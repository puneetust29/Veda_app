"""Google OAuth 2.0 (authorization code + PKCE) against the real Google endpoints.

Nothing in here touches the database or FastAPI -- it is the pure HTTP/crypto
layer, so it can be tested by stubbing httpx alone. Credential storage and token
freshness live in google_calendar.py.
"""
from __future__ import annotations

import base64
import hashlib
import secrets
from dataclasses import dataclass
from urllib.parse import urlencode

import httpx

from app.config import get_settings

# Development-only: disable SSL verification for local testing with self-signed certs
# This is NOT safe for production and should only be used in development environments
_verify_ssl = True
_settings_cache = None

def _get_verify_ssl() -> bool:
    global _settings_cache
    if _settings_cache is None:
        _settings_cache = get_settings()
    return _settings_cache.environment != "development"

AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token"
REVOKE_ENDPOINT = "https://oauth2.googleapis.com/revoke"
TOKENINFO_ENDPOINT = "https://oauth2.googleapis.com/tokeninfo"
USERINFO_ENDPOINT = "https://www.googleapis.com/oauth2/v3/userinfo"

_TIMEOUT = httpx.Timeout(10.0)


class GoogleOAuthError(RuntimeError):
    """Google rejected an OAuth request. Message carries Google's own error body."""


@dataclass(frozen=True)
class PkcePair:
    verifier: str
    challenge: str


def _b64url(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def make_pkce_pair() -> PkcePair:
    verifier = _b64url(secrets.token_bytes(32))
    challenge = _b64url(hashlib.sha256(verifier.encode()).digest())
    return PkcePair(verifier=verifier, challenge=challenge)


def make_state() -> str:
    return _b64url(secrets.token_bytes(16))


def build_authorization_url(state: str, code_challenge: str) -> str:
    settings = get_settings()
    params = {
        "client_id": settings.google_client_id,
        "redirect_uri": settings.google_redirect_uri,
        "response_type": "code",
        "scope": " ".join(settings.google_scope_list),
        "state": state,
        "code_challenge": code_challenge,
        "code_challenge_method": "S256",
        # access_type=offline + prompt=consent is what earns a refresh_token.
        # Without them Google returns access-only tokens on repeat consents and
        # the connection silently dies after an hour.
        "access_type": "offline",
        "prompt": "consent",
        "include_granted_scopes": "true",
    }
    return f"{AUTH_ENDPOINT}?{urlencode(params)}"


def _post_token(payload: dict) -> dict:
    settings = get_settings()
    body = {
        "client_id": settings.google_client_id,
        "client_secret": settings.google_client_secret,
        **payload,
    }
    with httpx.Client(timeout=_TIMEOUT, verify=_get_verify_ssl()) as client:
        response = client.post(TOKEN_ENDPOINT, data=body)
    if response.status_code >= 400:
        raise GoogleOAuthError(f"token endpoint returned {response.status_code}: {response.text}")
    return response.json()


def exchange_code(code: str, code_verifier: str, redirect_uri: str | None = None) -> dict:
    """Swap an authorization code for tokens. Includes refresh_token on first consent."""
    settings = get_settings()
    if redirect_uri is None:
        redirect_uri = settings.google_redirect_uri
    return _post_token(
        {
            "code": code,
            "code_verifier": code_verifier,
            "grant_type": "authorization_code",
            "redirect_uri": redirect_uri,
        }
    )


def refresh_access_token(refresh_token: str) -> dict:
    """Mint a fresh access token. Google does not return a new refresh_token here."""
    return _post_token({"refresh_token": refresh_token, "grant_type": "refresh_token"})


def revoke(token: str) -> None:
    """Best-effort revoke. Google answers 400 for an already-dead token, which is fine."""
    with httpx.Client(timeout=_TIMEOUT, verify=_get_verify_ssl()) as client:
        client.post(REVOKE_ENDPOINT, data={"token": token})


def token_info(access_token: str) -> dict:
    """Google's own view of a token -- the only authoritative source on granted scopes."""
    with httpx.Client(timeout=_TIMEOUT, verify=_get_verify_ssl()) as client:
        response = client.get(TOKENINFO_ENDPOINT, params={"access_token": access_token})
    if response.status_code >= 400:
        raise GoogleOAuthError(f"tokeninfo returned {response.status_code}: {response.text}")
    return response.json()


def userinfo(access_token: str) -> dict:
    """Basic profile (email, name, given_name, picture) for the connected account.

    Requires the `openid email profile` scopes to have been granted -- without
    them Google still returns 200 but with an empty/partial body, so callers
    should treat every field here as optional.
    """
    with httpx.Client(timeout=_TIMEOUT, verify=_get_verify_ssl()) as client:
        response = client.get(USERINFO_ENDPOINT, headers={"Authorization": f"Bearer {access_token}"})
    if response.status_code >= 400:
        raise GoogleOAuthError(f"userinfo returned {response.status_code}: {response.text}")
    return response.json()
