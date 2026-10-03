import jwt
from fastapi.testclient import TestClient

import main

client = TestClient(main.app)


def test_signature_contains_meeting_claims(monkeypatch):
    monkeypatch.setenv("ZOOM_SDK_KEY", "key123")
    monkeypatch.setenv("ZOOM_SDK_SECRET", "s" * 32)
    r = client.post("/zoom/signature", json={"meeting_number": "81234567890", "role": 0})
    assert r.status_code == 200
    claims = jwt.decode(r.json()["signature"], "s" * 32, algorithms=["HS256"])
    assert claims["sdkKey"] == claims["appKey"] == "key123"
    assert claims["mn"] == "81234567890" and claims["role"] == 0


def test_rejects_bad_meeting_number():
    assert client.post("/zoom/signature", json={"meeting_number": "abc"}).status_code == 422


def test_missing_credentials(monkeypatch):
    monkeypatch.delenv("ZOOM_SDK_KEY", raising=False)
    monkeypatch.delenv("ZOOM_SDK_SECRET", raising=False)
    assert client.post("/zoom/signature", json={"meeting_number": "81234567890"}).status_code == 500


def test_meeting_number_is_optional_for_native_sdks(monkeypatch):
    monkeypatch.setenv("ZOOM_SDK_KEY", "key123")
    monkeypatch.setenv("ZOOM_SDK_SECRET", "s" * 32)
    r = client.post("/zoom/signature", json={"role": 0})
    assert r.status_code == 200
    claims = jwt.decode(r.json()["signature"], "s" * 32, algorithms=["HS256"])
    assert "mn" not in claims
    assert claims["appKey"] == claims["sdkKey"] == "key123"
    assert claims["exp"] - claims["iat"] == main.TOKEN_TTL_SECONDS
    assert claims["tokenExp"] == claims["exp"]


def test_empty_body_is_accepted(monkeypatch):
    monkeypatch.setenv("ZOOM_SDK_KEY", "key123")
    monkeypatch.setenv("ZOOM_SDK_SECRET", "s" * 32)
    assert client.post("/zoom/signature", json={}).status_code == 200
