"""Token issuing/verification and FastAPI auth dependencies."""
import hmac
import logging
import os
import secrets
import sqlite3
import time

import jwt
from fastapi import Depends, Header, HTTPException

from db import connect, get_db

log = logging.getLogger("auth")
TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60
_generated_secret: str | None = None


def jwt_secret() -> str:
    global _generated_secret
    env = os.getenv("APP_JWT_SECRET")
    if env:
        return env
    if _generated_secret is None:
        _generated_secret = secrets.token_urlsafe(48)
        log.warning("APP_JWT_SECRET is not set; generated a random one (tokens reset on restart)")
    return _generated_secret


def create_token(user_id: str, name: str, role: str) -> str:
    now = int(time.time())
    return jwt.encode(
        {"sub": user_id, "name": name, "role": role, "iat": now, "exp": now + TOKEN_TTL_SECONDS},
        jwt_secret(),
        algorithm="HS256",
    )


def admin_key_matches(candidate: str) -> bool:
    expected = os.getenv("ADMIN_KEY")
    if not expected:
        return False
    return hmac.compare_digest(candidate.encode(), expected.encode())


def _unauthorized(msg: str = "Not authenticated") -> HTTPException:
    return HTTPException(401, msg, headers={"WWW-Authenticate": "Bearer"})


def _user_from_header(authorization: str | None, conn: sqlite3.Connection) -> dict:
    if not authorization:
        raise _unauthorized()
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        raise _unauthorized()
    try:
        claims = jwt.decode(token.strip(), jwt_secret(), algorithms=["HS256"])
    except jwt.PyJWTError:
        raise _unauthorized("Invalid or expired token")
    user_id = claims.get("sub")
    if not user_id:
        raise _unauthorized("Invalid token")
    row = conn.execute("SELECT user_id, display_name, role FROM users WHERE user_id = ?", (user_id,)).fetchone()
    if row is None:
        raise _unauthorized("Unknown user")
    return dict(row)


def current_user(
    authorization: str | None = Header(default=None), conn: sqlite3.Connection = Depends(get_db)
) -> dict:
    return _user_from_header(authorization, conn)


def require_admin(user: dict = Depends(current_user)) -> dict:
    if user["role"] != "admin":
        raise HTTPException(403, "Admin only")
    return user


def optional_auth(authorization: str | None = Header(default=None)) -> dict | None:
    """Enforces a token only when REQUIRE_AUTH=true (touches the DB only then)."""
    if os.getenv("REQUIRE_AUTH", "false").strip().lower() == "true":
        conn = connect()
        try:
            return _user_from_header(authorization, conn)
        finally:
            conn.close()
    return None
