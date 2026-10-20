# AL Balag POC API

FastAPI backend (`uvicorn main:app`). Config via env vars, see `.env.example`.

## API

All endpoints except `/health` and `/auth/login` need `Authorization: Bearer <token>`
(`/zoom/signature` only when `REQUIRE_AUTH=true`). Admin-only endpoints return 403 for other users.

- `GET /health`
- `POST /zoom/signature` - Zoom Meeting SDK JWT
- `POST /auth/login` `{user_id, display_name?, admin_key?}` -> `{token, user}` (403 on wrong admin key)
- `GET /auth/me`, `GET /users`
- `GET /announcements`, `POST /announcements` (admin), `DELETE /announcements/{id}` (admin)
- `POST /announcements/{id}/read`, `POST /announcements/read-all`, `GET /announcements/unread-count`
- `GET /meetings?include_past=false`, `POST /meetings` (admin), `PUT /meetings/{id}` (admin), `DELETE /meetings/{id}` (admin)

Storage is SQLite at `DB_PATH` (default `data.db`). Run tests with `python -m pytest`.
