"""Auth, users, announcements and meetings endpoints."""
import json
import re
import sqlite3
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field, field_validator

import auth
from auth import current_user, require_admin
from db import get_db

router = APIRouter()


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def to_utc(dt: datetime) -> datetime:
    return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt.astimezone(timezone.utc)


def iso(dt: datetime) -> str:
    return to_utc(dt).isoformat(timespec="seconds").replace("+00:00", "Z")


def parse_iso(s: str) -> datetime:
    return to_utc(datetime.fromisoformat(s.replace("Z", "+00:00")))


# ---------- auth ----------
class LoginRequest(BaseModel):
    user_id: str = Field(min_length=1, max_length=64, pattern=r"^[A-Za-z0-9_.@-]+$")
    display_name: str | None = Field(default=None, max_length=100)
    admin_key: str | None = None


@router.post("/auth/login")
def login(req: LoginRequest, conn: sqlite3.Connection = Depends(get_db)) -> dict:
    role = "user"
    if req.admin_key:
        if not auth.admin_key_matches(req.admin_key):
            raise HTTPException(403, "Wrong admin key")
        role = "admin"
    name = (req.display_name or "").strip() or req.user_id
    # Role is re-evaluated on each login (a plain login demotes a former admin).
    conn.execute(
        "INSERT INTO users (user_id, display_name, role, created_at) VALUES (?, ?, ?, ?) "
        "ON CONFLICT(user_id) DO UPDATE SET display_name = excluded.display_name, role = excluded.role",
        (req.user_id, name, role, now_iso()),
    )
    return {
        "token": auth.create_token(req.user_id, name, role),
        "user": {"user_id": req.user_id, "display_name": name, "role": role},
    }


@router.get("/auth/me")
def me(user: dict = Depends(current_user)) -> dict:
    return user


@router.get("/users")
def users(_: dict = Depends(current_user), conn: sqlite3.Connection = Depends(get_db)) -> list[dict]:
    rows = conn.execute("SELECT user_id, display_name, role FROM users ORDER BY display_name COLLATE NOCASE")
    return [dict(r) for r in rows]


# ---------- announcements ----------
class AnnouncementIn(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    body: str = Field(min_length=1, max_length=4000)
    pinned: bool = False


def _ann(row: sqlite3.Row) -> dict:
    d = dict(row)
    d["pinned"] = bool(d["pinned"])
    d["read"] = bool(d["read"])
    return d


_ANN_SELECT = (
    "SELECT a.id, a.title, a.body, a.pinned, a.author_id, a.author_name, a.created_at, "
    "EXISTS(SELECT 1 FROM announcement_reads r WHERE r.announcement_id = a.id AND r.user_id = ?) AS read "
    "FROM announcements a"
)


@router.get("/announcements")
def list_announcements(user: dict = Depends(current_user), conn: sqlite3.Connection = Depends(get_db)) -> list[dict]:
    rows = conn.execute(_ANN_SELECT + " ORDER BY a.pinned DESC, a.created_at DESC, a.id DESC", (user["user_id"],))
    return [_ann(r) for r in rows]


@router.post("/announcements", status_code=201)
def create_announcement(
    req: AnnouncementIn, admin: dict = Depends(require_admin), conn: sqlite3.Connection = Depends(get_db)
) -> dict:
    cur = conn.execute(
        "INSERT INTO announcements (title, body, pinned, author_id, author_name, created_at) VALUES (?,?,?,?,?,?)",
        (req.title, req.body, int(req.pinned), admin["user_id"], admin["display_name"], now_iso()),
    )
    row = conn.execute(_ANN_SELECT + " WHERE a.id = ?", (admin["user_id"], cur.lastrowid)).fetchone()
    return _ann(row)


# Static paths are declared before "/announcements/{id}/..." so they are never shadowed.
@router.post("/announcements/read-all", status_code=204)
def read_all(user: dict = Depends(current_user), conn: sqlite3.Connection = Depends(get_db)) -> Response:
    conn.execute(
        "INSERT OR IGNORE INTO announcement_reads (announcement_id, user_id) SELECT id, ? FROM announcements",
        (user["user_id"],),
    )
    return Response(status_code=204)


@router.get("/announcements/unread-count")
def unread_count(user: dict = Depends(current_user), conn: sqlite3.Connection = Depends(get_db)) -> dict:
    n = conn.execute(
        "SELECT COUNT(*) FROM announcements a WHERE NOT EXISTS "
        "(SELECT 1 FROM announcement_reads r WHERE r.announcement_id = a.id AND r.user_id = ?)",
        (user["user_id"],),
    ).fetchone()[0]
    return {"count": n}


@router.delete("/announcements/{ann_id}", status_code=204)
def delete_announcement(
    ann_id: int, _: dict = Depends(require_admin), conn: sqlite3.Connection = Depends(get_db)
) -> Response:
    if conn.execute("DELETE FROM announcements WHERE id = ?", (ann_id,)).rowcount == 0:
        raise HTTPException(404, "Announcement not found")
    conn.execute("DELETE FROM announcement_reads WHERE announcement_id = ?", (ann_id,))
    return Response(status_code=204)


@router.post("/announcements/{ann_id}/read", status_code=204)
def mark_read(ann_id: int, user: dict = Depends(current_user), conn: sqlite3.Connection = Depends(get_db)) -> Response:
    if conn.execute("SELECT 1 FROM announcements WHERE id = ?", (ann_id,)).fetchone() is None:
        raise HTTPException(404, "Announcement not found")
    conn.execute(
        "INSERT OR IGNORE INTO announcement_reads (announcement_id, user_id) VALUES (?, ?)", (ann_id, user["user_id"])
    )
    return Response(status_code=204)


# ---------- meetings ----------
class MeetingIn(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    description: str = Field(default="", max_length=4000)
    meeting_number: str
    passcode: str | None = Field(default=None, max_length=64)
    start_time: datetime
    duration_minutes: int = Field(default=60, ge=5, le=1440)
    assignees: list[str] = Field(default_factory=list, max_length=1000)

    @field_validator("meeting_number")
    @classmethod
    def _normalize_number(cls, v: str) -> str:
        v = re.sub(r"[\s-]", "", v)
        if not re.fullmatch(r"\d{9,11}", v):
            raise ValueError("meeting_number must be 9-11 digits")
        return v


def _meeting(row: sqlite3.Row) -> dict:
    d = dict(row)
    d["assignees"] = json.loads(d["assignees"])
    return d


def _meeting_values(m: MeetingIn) -> tuple:
    return (
        m.title, m.description, m.meeting_number, m.passcode or None, iso(m.start_time),
        m.duration_minutes, json.dumps(list(dict.fromkeys(m.assignees))),
    )


@router.get("/meetings")
def list_meetings(
    include_past: bool = False, user: dict = Depends(current_user), conn: sqlite3.Connection = Depends(get_db)
) -> list[dict]:
    now = datetime.now(timezone.utc)
    out = []
    for row in conn.execute("SELECT * FROM meetings ORDER BY start_time ASC, id ASC"):
        m = _meeting(row)
        if user["role"] != "admin" and m["assignees"] and user["user_id"] not in m["assignees"]:
            continue
        end_plus = parse_iso(m["start_time"]) + timedelta(minutes=m["duration_minutes"], hours=1)
        if not include_past and end_plus < now:
            continue
        out.append(m)
    return out


@router.post("/meetings", status_code=201)
def create_meeting(
    req: MeetingIn, admin: dict = Depends(require_admin), conn: sqlite3.Connection = Depends(get_db)
) -> dict:
    cur = conn.execute(
        "INSERT INTO meetings (title, description, meeting_number, passcode, start_time, duration_minutes, "
        "assignees, created_by, created_at) VALUES (?,?,?,?,?,?,?,?,?)",
        _meeting_values(req) + (admin["user_id"], now_iso()),
    )
    return _meeting(conn.execute("SELECT * FROM meetings WHERE id = ?", (cur.lastrowid,)).fetchone())


@router.put("/meetings/{meeting_id}")
def update_meeting(
    meeting_id: int, req: MeetingIn, _: dict = Depends(require_admin), conn: sqlite3.Connection = Depends(get_db)
) -> dict:
    cur = conn.execute(
        "UPDATE meetings SET title=?, description=?, meeting_number=?, passcode=?, start_time=?, "
        "duration_minutes=?, assignees=? WHERE id = ?",
        _meeting_values(req) + (meeting_id,),
    )
    if cur.rowcount == 0:
        raise HTTPException(404, "Meeting not found")
    return _meeting(conn.execute("SELECT * FROM meetings WHERE id = ?", (meeting_id,)).fetchone())


@router.delete("/meetings/{meeting_id}", status_code=204)
def delete_meeting(
    meeting_id: int, _: dict = Depends(require_admin), conn: sqlite3.Connection = Depends(get_db)
) -> Response:
    if conn.execute("DELETE FROM meetings WHERE id = ?", (meeting_id,)).rowcount == 0:
        raise HTTPException(404, "Meeting not found")
    return Response(status_code=204)
