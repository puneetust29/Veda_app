"""
Per-user Uber OAuth via uber-mcp's PKCE flow.

Flow:
  1. get_connect_url(customer_id) -> auth URL (open in browser)
  2. User logs into Uber in the streamed Chromium browser
  3. uber-mcp redirects to /uber/callback?code=&state=
  4. exchange_code(code, state) -> {access_token, refresh_token, user_sub, customer_id}
  5. Caller stores tokens in uber_sessions table
  6. call_tool_as(access_token, ...) uses per-user token for all MCP calls

Token lifetime:
  - access_token : ~1h (uber-mcp JWT)
  - refresh_token: ~30 days (uber-mcp refresh store)
  - Uber cookies  : ~24h (stored inside uber-mcp, keyed by user_sub)
  When refresh fails, the Uber cookies have expired and the user must re-login.
"""
from __future__ import annotations

import hashlib
import base64
import logging
import secrets
import time
from typing import Optional

import httpx
import jose.jwt as _jwt

from app.config import get_settings

logger = logging.getLogger(__name__)

CALLBACK_PATH = "/uber/callback"

# In-memory PKCE state store: state -> {code_verifier, customer_id, client_id, expires_at}
# Short-lived (10 min). Single-process — fine for local/dev.
_pending_flows: dict[str, dict] = {}

# Registered client_id cache. uber-mcp's InMemoryClientsStore resets on restart,
# so we reset ours too (None triggers re-registration).
_registered_client_id: Optional[str] = None


def _mcp_url() -> str:
    return get_settings().uber_mcp_url.rstrip("/")


def _callback_url() -> str:
    """Absolute URL uber-mcp redirects to after login."""
    settings = get_settings()
    # Use the backend's own base URL so it's reachable when uber-mcp calls back.
    base = getattr(settings, "backend_url", "http://localhost:8000").rstrip("/")
    return f"{base}{CALLBACK_PATH}"


def _pkce_pair() -> tuple[str, str]:
    verifier = secrets.token_urlsafe(64)
    digest = hashlib.sha256(verifier.encode()).digest()
    challenge = base64.urlsafe_b64encode(digest).rstrip(b"=").decode()
    return verifier, challenge


def _register_client() -> str:
    """Register Veda as an OAuth client with uber-mcp.

    uber-mcp stores clients in memory; they vanish on restart, so we re-register
    when our cached client_id is gone or rejected.
    """
    global _registered_client_id
    if _registered_client_id:
        return _registered_client_id

    url = _mcp_url()
    cb = _callback_url()
    resp = httpx.post(
        f"{url}/register",
        json={
            "redirect_uris": [cb],
            "grant_types": ["authorization_code", "refresh_token"],
            "response_types": ["code"],
            "scope": "mcp:tools",
            "client_name": "Veda",
            "token_endpoint_auth_method": "none",
        },
        timeout=10.0,
    )
    resp.raise_for_status()
    client_id: str = resp.json()["client_id"]
    _registered_client_id = client_id
    logger.info("[uber_oauth] registered client_id=%s callback=%s", client_id, cb)
    return client_id


def _prune_stale_flows() -> None:
    cutoff = time.time()
    for k in list(_pending_flows):
        if _pending_flows[k]["expires_at"] < cutoff:
            del _pending_flows[k]


def get_connect_url(customer_id: str, return_url: Optional[str] = None) -> str:
    """Start a PKCE flow for this customer. Returns the auth URL to open in-browser."""
    _prune_stale_flows()
    url = _mcp_url()
    client_id = _register_client()
    verifier, challenge = _pkce_pair()
    state = secrets.token_urlsafe(16)

    _pending_flows[state] = {
        "code_verifier": verifier,
        "customer_id": customer_id,
        "client_id": client_id,
        "return_url": return_url,
        "expires_at": time.time() + 600,
    }

    cb = _callback_url()
    params = (
        f"response_type=code"
        f"&client_id={client_id}"
        f"&code_challenge={challenge}"
        f"&code_challenge_method=S256"
        f"&state={state}"
        f"&scope=mcp:tools"
        f"&redirect_uri={cb}"
    )
    return f"{url}/authorize?{params}"


def _exchange_code_for_tokens(code: str, code_verifier: str, client_id: str, redirect_uri: str) -> dict:
    """POST /token with an authorization code and decode the resulting JWT.

    Shared by the browser-based flow (exchange_code, which looks its params up
    from _pending_flows) and the chat-driven flow (uber_chat_login.py, which
    tracks its own PKCE state per in-progress conversation).
    """
    url = _mcp_url()
    resp = httpx.post(
        f"{url}/token",
        data={
            "grant_type": "authorization_code",
            "code": code,
            "code_verifier": code_verifier,
            "client_id": client_id,
            "redirect_uri": redirect_uri,
        },
        timeout=15.0,
    )
    if resp.status_code >= 400:
        logger.error("[uber_oauth] token exchange failed | status=%s | body=%s", resp.status_code, resp.text)
    resp.raise_for_status()
    tokens = resp.json()

    # Decode the JWT (no signature verify needed — uber-mcp just issued it to us)
    payload = _jwt.decode(
        tokens["access_token"],
        key="",
        algorithms=["HS256"],
        options={"verify_signature": False, "verify_aud": False},
    )
    user_sub = payload.get("sub", "")
    expires_in = tokens.get("expires_in", 3600)

    return {
        "access_token": tokens["access_token"],
        "refresh_token": tokens.get("refresh_token", ""),
        "expires_in": expires_in,
        "user_sub": user_sub,
        "client_id": client_id,
    }


def exchange_code(code: str, state: str) -> dict:
    """Exchange auth code for tokens. Returns dict with tokens + customer_id."""
    flow = _pending_flows.pop(state, None)
    if not flow:
        raise ValueError("Invalid or expired OAuth state parameter.")
    if flow["expires_at"] < time.time():
        raise ValueError("OAuth flow expired — restart the login from the app.")

    cb = _callback_url()
    result = _exchange_code_for_tokens(code, flow["code_verifier"], flow["client_id"], cb)
    user_sub = result["user_sub"]

    logger.info("[uber_oauth] code exchange ok | customer_id=%s | user_sub=%s", flow["customer_id"], user_sub)
    return {
        **result,
        "customer_id": flow["customer_id"],
        "return_url": flow.get("return_url"),
    }


def exchange_code_pkce(code: str, code_verifier: str, client_id: str, redirect_uri: str, customer_id: str) -> dict:
    """Like exchange_code(), but for callers (uber_chat_login.py) that track
    their own PKCE state instead of going through _pending_flows/state.
    """
    result = _exchange_code_for_tokens(code, code_verifier, client_id, redirect_uri)
    logger.info("[uber_oauth] chat code exchange ok | customer_id=%s | user_sub=%s", customer_id, result["user_sub"])
    return {**result, "customer_id": customer_id}


def refresh_tokens(refresh_token: str) -> dict:
    """Exchange a refresh_token for a new access_token.

    Returns same shape as exchange_code() minus customer_id.
    Raises httpx.HTTPError when the underlying Uber session has expired
    (uber-mcp rejects the refresh because the cookies are gone).
    """
    global _registered_client_id

    url = _mcp_url()
    client_id = _registered_client_id or _register_client()
    resp = httpx.post(
        f"{url}/token",
        data={
            "grant_type": "refresh_token",
            "refresh_token": refresh_token,
            "client_id": client_id,
        },
        timeout=15.0,
    )
    resp.raise_for_status()
    tokens = resp.json()

    payload = _jwt.decode(
        tokens["access_token"],
        key="",
        algorithms=["HS256"],
        options={"verify_signature": False, "verify_aud": False},
    )
    user_sub = payload.get("sub", "")
    expires_in = tokens.get("expires_in", 3600)

    logger.info("[uber_oauth] token refresh ok | user_sub=%s", user_sub)
    return {
        "access_token": tokens["access_token"],
        "refresh_token": tokens.get("refresh_token", refresh_token),
        "expires_in": expires_in,
        "user_sub": user_sub,
        "client_id": client_id,
    }


def invalidate_client() -> None:
    """Call when uber-mcp restarts — forces re-registration on next flow."""
    global _registered_client_id
    _registered_client_id = None
