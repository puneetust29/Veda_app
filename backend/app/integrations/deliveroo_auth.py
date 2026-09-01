"""Deliveroo OAuth2 client-credentials token management.

Tokens are cached in-process and refreshed 60 s before expiry.
Thread-safe for single-process uvicorn; for multi-worker deploys use Redis.
"""
from __future__ import annotations

import time

import httpx

from app.config import get_settings

_cache: dict[str, object] = {}

TOKEN_URL = "https://auth.deliveroo.com/oauth2/token"


def get_deliveroo_token() -> str:
    now = time.time()
    if _cache.get("token") and float(_cache.get("expires_at", 0)) > now + 60:
        return str(_cache["token"])

    settings = get_settings()
    if not settings.deliveroo_configured:
        raise RuntimeError("Deliveroo credentials not configured (DELIVEROO_CLIENT_ID / DELIVEROO_CLIENT_SECRET)")

    resp = httpx.post(
        TOKEN_URL,
        data={
            "client_id": settings.deliveroo_client_id,
            "client_secret": settings.deliveroo_client_secret,
            "grant_type": "client_credentials",
        },
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        timeout=10,
    )
    resp.raise_for_status()
    data = resp.json()

    _cache["token"] = data["access_token"]
    _cache["expires_at"] = now + int(data.get("expires_in", 3600))
    _cache["token_type"] = data.get("token_type", "Bearer")
    _cache["fetched_at"] = now
    return str(_cache["token"])


def get_auth_headers() -> dict[str, str]:
    return {"Authorization": f"Bearer {get_deliveroo_token()}"}


def token_info() -> dict:
    """Return non-secret metadata about the current cached token."""
    now = time.time()
    fetched_at = float(_cache.get("fetched_at", 0))
    expires_at = float(_cache.get("expires_at", 0))
    return {
        "cached": bool(_cache.get("token")),
        "expires_in_seconds": max(0, int(expires_at - now)) if expires_at else None,
        "fetched_ago_seconds": int(now - fetched_at) if fetched_at else None,
    }
