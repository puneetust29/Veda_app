"""DB helpers for per-user Uber sessions.

Reads/writes the uber_sessions Supabase table and handles silent token refresh.
"""
from __future__ import annotations

import logging
import time
from typing import Optional

from app.db.client import get_supabase

logger = logging.getLogger(__name__)


def get_session(customer_id: str) -> Optional[dict]:
    """Return the stored uber_session row for customer_id, or None."""
    sb = get_supabase()
    result = (
        sb.table("uber_sessions")
        .select("*")
        .eq("customer_id", customer_id)
        .limit(1)
        .execute()
    )
    return result.data[0] if result.data else None


def upsert_session(
    customer_id: str,
    user_sub: str,
    access_token: str,
    refresh_token: str,
    client_id: str,
    expires_in: int,
) -> None:
    sb = get_supabase()
    from datetime import datetime, timezone, timedelta
    expires_at = (datetime.now(timezone.utc) + timedelta(seconds=expires_in)).isoformat()
    sb.table("uber_sessions").upsert(
        {
            "customer_id": customer_id,
            "user_sub": user_sub,
            "access_token": access_token,
            "refresh_token": refresh_token,
            "client_id": client_id,
            "expires_at": expires_at,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        },
        on_conflict="customer_id",
    ).execute()
    logger.info("[uber_session] upserted | customer_id=%s | user_sub=%s", customer_id, user_sub)


def delete_session(customer_id: str) -> None:
    sb = get_supabase()
    sb.table("uber_sessions").delete().eq("customer_id", customer_id).execute()


def get_valid_access_token(customer_id: str) -> Optional[str]:
    """Return a valid access_token for customer_id.

    Silently refreshes if the token is within 5 minutes of expiry.
    Returns None if there is no session or the Uber cookies have expired
    (in which case the user must re-login).
    """
    session = get_session(customer_id)
    if not session:
        return None

    from datetime import datetime, timezone
    from dateutil.parser import isoparse
    expires_at = isoparse(session["expires_at"])
    now = datetime.now(timezone.utc)
    needs_refresh = (expires_at - now).total_seconds() < 300  # refresh 5 min early

    if not needs_refresh:
        return session["access_token"]

    # Attempt silent refresh
    try:
        from app.tools import uber_oauth
        refreshed = uber_oauth.refresh_tokens(session["refresh_token"])
        upsert_session(
            customer_id=customer_id,
            user_sub=refreshed["user_sub"],
            access_token=refreshed["access_token"],
            refresh_token=refreshed["refresh_token"],
            client_id=refreshed["client_id"],
            expires_in=refreshed["expires_in"],
        )
        logger.info("[uber_session] silent refresh ok | customer_id=%s", customer_id)
        return refreshed["access_token"]
    except Exception as exc:
        # Uber cookies expired — wipe the stale session so the UI prompts re-login
        logger.warning("[uber_session] refresh failed, deleting session | customer_id=%s | error=%s", customer_id, exc)
        delete_session(customer_id)
        return None
