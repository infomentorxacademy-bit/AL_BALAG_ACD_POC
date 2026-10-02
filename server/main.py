"""POC backend: signs Zoom Meeting SDK JWTs so the SDK secret never ships in the mobile app."""
import os
import time

import jwt
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

load_dotenv()

app = FastAPI(title="AL Balag POC API")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

TOKEN_TTL_SECONDS = 2 * 60 * 60


class SignatureRequest(BaseModel):
    meeting_number: str = Field(pattern=r"^\d{9,11}$")
    role: int = Field(default=0, ge=0, le=1)  # 0 = attendee, 1 = host


class SignatureResponse(BaseModel):
    signature: str


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/zoom/signature", response_model=SignatureResponse)
def zoom_signature(req: SignatureRequest) -> SignatureResponse:
    sdk_key = os.getenv("ZOOM_SDK_KEY")
    sdk_secret = os.getenv("ZOOM_SDK_SECRET")
    if not sdk_key or not sdk_secret:
        raise HTTPException(500, "ZOOM_SDK_KEY / ZOOM_SDK_SECRET are not configured")

    iat = int(time.time()) - 30  # small backdate for clock skew
    exp = iat + TOKEN_TTL_SECONDS
    payload = {
        "appKey": sdk_key,
        "sdkKey": sdk_key,
        "mn": req.meeting_number,
        "role": req.role,
        "iat": iat,
        "exp": exp,
        "tokenExp": exp,
    }
    return SignatureResponse(signature=jwt.encode(payload, sdk_secret, algorithm="HS256"))
