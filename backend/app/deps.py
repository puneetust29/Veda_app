from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt

from app.config import get_settings
from app.db.client import get_supabase

bearer_scheme = HTTPBearer()


def get_current_phone_number(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> str:
    """Verify the Supabase-issued JWT and return the authenticated phone number."""
    settings = get_settings()
    try:
        payload = jwt.decode(
            credentials.credentials,
            settings.supabase_jwt_secret,
            algorithms=["HS256"],
            audience="authenticated",
        )
    except JWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        ) from exc

    phone = payload.get("phone")
    if not phone:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token is missing a verified phone number",
        )
    return phone


def get_or_create_customer(phone_number: str) -> dict:
    """Look up (or lazily create) the mocked telecom customer record for this phone number."""
    supabase = get_supabase()
    existing = (
        supabase.table("customers")
        .select("*")
        .eq("phone_number", phone_number)
        .limit(1)
        .execute()
    )
    if existing.data:
        return existing.data[0]

    created = (
        supabase.table("customers")
        .insert(
            {
                "phone_number": phone_number,
                "full_name": "New Customer",
                "address": "Unknown",
                "telecom_plan": "Standard Mobile",
                "account_number": phone_number,
            }
        )
        .execute()
    )
    return created.data[0]


def get_current_customer(phone_number: str = Depends(get_current_phone_number)) -> dict:
    return get_or_create_customer(phone_number)
