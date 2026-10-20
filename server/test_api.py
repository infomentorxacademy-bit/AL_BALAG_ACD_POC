from datetime import datetime, timedelta, timezone

import jwt
import pytest
from fastapi.testclient import TestClient

import main


@pytest.fixture(autouse=True)
def env(tmp_path, monkeypatch):
    monkeypatch.setenv("DB_PATH", str(tmp_path / "t.db"))
    monkeypatch.setenv("APP_JWT_SECRET", "x" * 32)
    monkeypatch.setenv("ADMIN_KEY", "letmein")
    monkeypatch.delenv("REQUIRE_AUTH", raising=False)


@pytest.fixture
def client():
    return TestClient(main.app)


def login(client, uid="alice", admin=False, name=None):
    body = {"user_id": uid, "display_name": name}
    if admin:
        body["admin_key"] = "letmein"
    r = client.post("/auth/login", json=body)
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


@pytest.fixture
def user(client):
    return login(client, "alice")


@pytest.fixture
def admin(client):
    return login(client, "boss", admin=True)


def future(hours=24):
    return (datetime.now(timezone.utc) + timedelta(hours=hours)).isoformat()


def meeting(**kw):
    d = {"title": "Class", "meeting_number": "81234567890", "start_time": future()}
    d.update(kw)
    return d


# ---- auth ----
def test_login_user(client):
    r = client.post("/auth/login", json={"user_id": "bob"})
    assert r.status_code == 200
    j = r.json()
    assert j["user"] == {"user_id": "bob", "display_name": "bob", "role": "user"}
    c = jwt.decode(j["token"], "x" * 32, algorithms=["HS256"])
    assert c["sub"] == "bob" and c["role"] == "user" and c["name"] == "bob"
    assert 29 * 86400 < c["exp"] - c["iat"] <= 30 * 86400


def test_login_admin_and_display_name(client):
    r = client.post("/auth/login", json={"user_id": "a", "display_name": "Ann", "admin_key": "letmein"})
    assert r.json()["user"] == {"user_id": "a", "display_name": "Ann", "role": "admin"}


def test_login_wrong_admin_key(client):
    r = client.post("/auth/login", json={"user_id": "a", "admin_key": "nope"})
    assert r.status_code == 403 and r.json() == {"detail": "Wrong admin key"}


def test_admin_key_unset_nobody_admin(client, monkeypatch):
    monkeypatch.delenv("ADMIN_KEY")
    assert client.post("/auth/login", json={"user_id": "a", "admin_key": "x"}).status_code == 403
    assert client.post("/auth/login", json={"user_id": "a", "admin_key": ""}).json()["user"]["role"] == "user"


@pytest.mark.parametrize("uid", ["", "a b", "x" * 65, "a/b"])
def test_login_validation(client, uid):
    assert client.post("/auth/login", json={"user_id": uid}).status_code == 422


def test_me_and_users(client, user, admin):
    assert client.get("/auth/me", headers=user).json() == {"user_id": "alice", "display_name": "alice", "role": "user"}
    ids = {u["user_id"] for u in client.get("/users", headers=user).json()}
    assert ids == {"alice", "boss"}


def test_401s(client):
    for method, path in [
        ("get", "/auth/me"), ("get", "/users"), ("get", "/announcements"), ("post", "/announcements/read-all"),
        ("get", "/announcements/unread-count"), ("get", "/meetings"), ("post", "/announcements/1/read"),
    ]:
        assert getattr(client, method)(path).status_code == 401, path
    bad = {"Authorization": "Bearer garbage"}
    assert client.get("/auth/me", headers=bad).status_code == 401
    assert client.get("/auth/me", headers={"Authorization": "Basic abc"}).status_code == 401
    expired = jwt.encode({"sub": "a", "exp": 1}, "x" * 32, algorithm="HS256")
    assert client.get("/auth/me", headers={"Authorization": f"Bearer {expired}"}).status_code == 401
    wrong = jwt.encode({"sub": "a", "exp": 9999999999}, "y" * 32, algorithm="HS256")
    assert client.get("/auth/me", headers={"Authorization": f"Bearer {wrong}"}).status_code == 401


def test_generated_secret_when_unset(client, monkeypatch):
    monkeypatch.delenv("APP_JWT_SECRET")
    h = login(client, "zed")
    assert client.get("/auth/me", headers=h).status_code == 200


# ---- role enforcement ----
def test_admin_only_403(client, user):
    assert client.post("/announcements", json={"title": "t", "body": "b"}, headers=user).status_code == 403
    assert client.delete("/announcements/1", headers=user).status_code == 403
    assert client.post("/meetings", json=meeting(), headers=user).status_code == 403
    assert client.put("/meetings/1", json=meeting(), headers=user).status_code == 403
    assert client.delete("/meetings/1", headers=user).status_code == 403


def test_admin_only_requires_token(client):
    assert client.post("/announcements", json={"title": "t", "body": "b"}).status_code == 401


# ---- announcements ----
def post_ann(client, admin, title="T", body="B", pinned=False):
    r = client.post("/announcements", json={"title": title, "body": body, "pinned": pinned}, headers=admin)
    assert r.status_code == 201, r.text
    return r.json()


def test_announcement_create_shape(client, admin):
    a = post_ann(client, admin, "Hello", "World", True)
    assert set(a) == {"id", "title", "body", "pinned", "author_id", "author_name", "created_at", "read"}
    assert a["pinned"] is True and a["read"] is False and a["author_id"] == "boss"
    datetime.fromisoformat(a["created_at"].replace("Z", "+00:00"))


def test_announcement_validation(client, admin):
    for bad in [{"title": "", "body": "b"}, {"title": "t", "body": ""}, {"title": "x" * 121, "body": "b"},
                {"title": "t", "body": "x" * 4001}, {"body": "b"}]:
        assert client.post("/announcements", json=bad, headers=admin).status_code == 422


def test_announcement_ordering_pinned_first_newest_first(client, admin, user):
    a1 = post_ann(client, admin, "one")
    a2 = post_ann(client, admin, "two", pinned=True)
    a3 = post_ann(client, admin, "three")
    a4 = post_ann(client, admin, "four", pinned=True)
    ids = [a["id"] for a in client.get("/announcements", headers=user).json()]
    assert ids == [a4["id"], a2["id"], a3["id"], a1["id"]]


def test_read_state_is_per_user(client, admin, user):
    a = post_ann(client, admin)
    other = login(client, "carol")
    assert client.post(f"/announcements/{a['id']}/read", headers=user).status_code == 204
    assert client.post(f"/announcements/{a['id']}/read", headers=user).status_code == 204  # idempotent
    assert client.get("/announcements", headers=user).json()[0]["read"] is True
    assert client.get("/announcements", headers=other).json()[0]["read"] is False
    assert client.get("/announcements/unread-count", headers=user).json() == {"count": 0}
    assert client.get("/announcements/unread-count", headers=other).json() == {"count": 1}


def test_unread_count_and_read_all(client, admin, user):
    for i in range(3):
        post_ann(client, admin, f"t{i}")
    assert client.get("/announcements/unread-count", headers=user).json() == {"count": 3}
    assert client.post("/announcements/read-all", headers=user).status_code == 204
    assert client.get("/announcements/unread-count", headers=user).json() == {"count": 0}
    assert all(a["read"] for a in client.get("/announcements", headers=user).json())
    post_ann(client, admin, "new")
    assert client.get("/announcements/unread-count", headers=user).json() == {"count": 1}
    assert client.post("/announcements/read-all", headers=user).status_code == 204


def test_read_and_delete_missing_404(client, admin, user):
    assert client.post("/announcements/999/read", headers=user).status_code == 404
    assert client.delete("/announcements/999", headers=admin).status_code == 404


def test_delete_announcement(client, admin, user):
    a = post_ann(client, admin)
    client.post(f"/announcements/{a['id']}/read", headers=user)
    assert client.delete(f"/announcements/{a['id']}", headers=admin).status_code == 204
    assert client.get("/announcements", headers=user).json() == []
    assert client.get("/announcements/unread-count", headers=user).json() == {"count": 0}
    assert client.delete(f"/announcements/{a['id']}", headers=admin).status_code == 404


# ---- meetings ----
def test_meeting_create_shape_and_normalization(client, admin):
    r = client.post("/meetings", json=meeting(meeting_number="812 3456-7890", passcode="abc",
                                              start_time="2030-01-01T10:00:00"), headers=admin)
    assert r.status_code == 201, r.text
    m = r.json()
    assert set(m) == {"id", "title", "description", "meeting_number", "passcode", "start_time",
                      "duration_minutes", "assignees", "created_by", "created_at"}
    assert m["meeting_number"] == "81234567890" and m["passcode"] == "abc"
    assert m["duration_minutes"] == 60 and m["assignees"] == [] and m["description"] == ""
    assert m["created_by"] == "boss"
    assert datetime.fromisoformat(m["start_time"].replace("Z", "+00:00")) == datetime(2030, 1, 1, 10, tzinfo=timezone.utc)


def test_meeting_offset_start_time_converted_to_utc(client, admin):
    m = client.post("/meetings", json=meeting(start_time="2030-01-01T10:00:00+02:00"), headers=admin).json()
    assert datetime.fromisoformat(m["start_time"].replace("Z", "+00:00")) == datetime(2030, 1, 1, 8, tzinfo=timezone.utc)


@pytest.mark.parametrize("patch", [
    {"meeting_number": "12345678"}, {"meeting_number": "123456789012"}, {"meeting_number": "abc123456789"},
    {"title": ""}, {"title": "x" * 121}, {"duration_minutes": 4}, {"duration_minutes": 1441},
    {"start_time": "not a date"}, {"assignees": "bob"},
])
def test_meeting_validation_422(client, admin, patch):
    assert client.post("/meetings", json=meeting(**patch), headers=admin).status_code == 422


def test_meeting_missing_required_422(client, admin):
    assert client.post("/meetings", json={"title": "x"}, headers=admin).status_code == 422


def test_meeting_visibility(client, admin, user):
    bob = login(client, "bob")
    for title, assignees in [("everyone", []), ("alice only", ["alice"]), ("bob only", ["bob"])]:
        client.post("/meetings", json=meeting(title=title, assignees=assignees), headers=admin)
    titles = lambda h: [m["title"] for m in client.get("/meetings", headers=h).json()]
    assert titles(user) == ["everyone", "alice only"]
    assert titles(bob) == ["everyone", "bob only"]
    assert titles(admin) == ["everyone", "alice only", "bob only"]


def test_meetings_ordered_by_start_time(client, admin):
    for title, h in [("c", 30), ("a", 2), ("b", 10)]:
        client.post("/meetings", json=meeting(title=title, start_time=future(h)), headers=admin)
    assert [m["title"] for m in client.get("/meetings", headers=admin).json()] == ["a", "b", "c"]


def test_past_filtering(client, admin, user):
    now = datetime.now(timezone.utc)
    cases = {
        "long ago": now - timedelta(days=2),
        "ended 30m ago": now - timedelta(minutes=90),   # 60min duration + 1h grace -> still shown
        "ended 2h ago": now - timedelta(hours=4),
        "future": now + timedelta(hours=1),
    }
    for title, st in cases.items():
        client.post("/meetings", json=meeting(title=title, start_time=st.isoformat(), duration_minutes=60), headers=admin)
    shown = [m["title"] for m in client.get("/meetings", headers=user).json()]
    assert shown == ["ended 30m ago", "future"]
    allm = [m["title"] for m in client.get("/meetings?include_past=true", headers=user).json()]
    assert allm == ["long ago", "ended 2h ago", "ended 30m ago", "future"]


def test_meeting_update_and_delete(client, admin, user):
    mid = client.post("/meetings", json=meeting(), headers=admin).json()["id"]
    r = client.put(f"/meetings/{mid}", json=meeting(title="New", meeting_number="999-888-777",
                                                    assignees=["alice"], duration_minutes=90), headers=admin)
    assert r.status_code == 200
    j = r.json()
    assert j["id"] == mid and j["title"] == "New" and j["meeting_number"] == "999888777"
    assert j["assignees"] == ["alice"] and j["duration_minutes"] == 90 and j["created_by"] == "boss"
    assert client.put(f"/meetings/{mid}", json=meeting(meeting_number="1"), headers=admin).status_code == 422
    assert client.delete(f"/meetings/{mid}", headers=admin).status_code == 204
    assert client.get("/meetings", headers=user).json() == []


def test_meeting_missing_404(client, admin):
    assert client.put("/meetings/999", json=meeting(), headers=admin).status_code == 404
    assert client.delete("/meetings/999", headers=admin).status_code == 404


# ---- REQUIRE_AUTH on /zoom/signature ----
@pytest.fixture
def zoom_env(monkeypatch):
    monkeypatch.setenv("ZOOM_SDK_KEY", "key123")
    monkeypatch.setenv("ZOOM_SDK_SECRET", "s" * 32)


def test_signature_open_by_default(client, zoom_env):
    assert client.post("/zoom/signature", json={}).status_code == 200
    monkey_headers = {"Authorization": "Bearer junk"}
    assert client.post("/zoom/signature", json={}, headers=monkey_headers).status_code == 200


def test_signature_require_auth_true(client, zoom_env, monkeypatch, user):
    monkeypatch.setenv("REQUIRE_AUTH", "true")
    assert client.post("/zoom/signature", json={}).status_code == 401
    assert client.post("/zoom/signature", json={}, headers={"Authorization": "Bearer junk"}).status_code == 401
    assert client.post("/zoom/signature", json={}, headers=user).status_code == 200


def test_signature_require_auth_false_explicit(client, zoom_env, monkeypatch):
    monkeypatch.setenv("REQUIRE_AUTH", "false")
    assert client.post("/zoom/signature", json={}).status_code == 200


def test_health(client):
    assert client.get("/health").json() == {"status": "ok"}
