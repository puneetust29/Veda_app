from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from jose import jwt
from pydantic import BaseModel

from app.config import get_settings
from app.db.client import get_supabase
from app.deps import get_current_customer, get_or_create_customer

router = APIRouter(prefix="/auth", tags=["auth"])
me_router = APIRouter(tags=["auth"])


@router.post("/sync-profile")
def sync_profile(customer: dict = Depends(get_current_customer)) -> dict:
    """Call right after Supabase login to hydrate/create the linked telecom profile."""
    return customer


@me_router.get("/me")
def read_profile(customer: dict = Depends(get_current_customer)) -> dict:
    return customer


class DevLoginRequest(BaseModel):
    phone_number: str
    otp: Optional[str] = None


class DevLoginResponse(BaseModel):
    access_token: str
    customer: dict


@router.post("/dev-login", response_model=DevLoginResponse)
def dev_login(body: DevLoginRequest) -> DevLoginResponse:
    """
    POC-only stand-in for Supabase phone/OTP sign-in: validates OTP from database and
    mints a token signed with the same Supabase JWT secret, so it passes the exact same
    verification path (app.deps.get_current_phone_number) as a real Supabase-issued token.
    Disabled outside development so it can never become a real auth bypass in production.
    """
    settings = get_settings()
    if settings.environment == "production":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")

    supabase = get_supabase()
    customer_data = (
        supabase.table("customers")
        .select("otp")
        .eq("phone_number", body.phone_number)
        .limit(1)
        .execute()
    )

    if customer_data.data and customer_data.data[0].get("otp"):
        if not body.otp or body.otp != customer_data.data[0]["otp"]:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid OTP")

    customer = get_or_create_customer(body.phone_number)

    now = datetime.now(timezone.utc)
    token = jwt.encode(
        {
            "aud": "authenticated",
            "role": "authenticated",
            "sub": body.phone_number,
            "phone": body.phone_number,
            "iat": int(now.timestamp()),
            "exp": int((now + timedelta(hours=12)).timestamp()),
        },
        settings.supabase_jwt_secret,
        algorithm="HS256",
    )
    return DevLoginResponse(access_token=token, customer=customer)
