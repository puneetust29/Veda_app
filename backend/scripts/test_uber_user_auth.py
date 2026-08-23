"""
Step 1 of Uber MCP test: Get a real user Uber OAuth token.

How it works:
  1. Prints the Uber authorize URL and opens it in your browser.
  2. You log in to Uber and click "Allow".
  3. Uber redirects to http://localhost:8000/uber/callback?code=...
  4. This script's tiny HTTP server captures the code automatically.
  5. Exchanges the code for access_token + refresh_token.
  6. Saves token to scripts/.test-uber-token.json for use in the MCP test.

Run from the backend directory:
  python scripts/test_uber_user_auth.py

Requires UBER_CLIENT_ID, UBER_CLIENT_SECRET, UBER_REDIRECT_URI in .env.
The redirect URI must be http://localhost:8000/uber/callback (already configured).
"""

import base64
import hashlib
import http.server
import json
import os
import secrets
import threading
import urllib.parse
import webbrowser
from pathlib import Path

import httpx

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

def load_env() -> dict:
    env = {}
    env_path = Path(__file__).parent.parent / ".env"
    try:
        for line in env_path.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, _, v = line.partition("=")
                env[k.strip()] = v.strip()
    except FileNotFoundError:
        pass
    return env

env = load_env()

# veda rider test app (Rider3PLTesting suite) — sandbox access + scopes pre-approved
CLIENT_ID     = "Zukx-tUozEH4bb3xX_i3eeVN9ePzfziK"
CLIENT_SECRET = "oY_nou6iiGmou8ixU1FjbjAuzoJmZCx1vIONgG7v"
REDIRECT_URI  = env.get("UBER_REDIRECT_URI") or os.getenv("UBER_REDIRECT_URI", "http://localhost:8000/uber/callback")
TOKEN_FILE    = Path(__file__).parent / ".test-uber-token.json"

# Standard Consumer Identity endpoints (not universal/authorize — that's for internal Uber apps)
AUTHORIZE_URL = "https://auth.uber.com/oauth/v2/authorize"
TOKEN_URL     = "https://auth.uber.com/oauth/v2/token"
# Rider3PLTesting pre-approved scope
SCOPE         = "partner-loyalty.link-account"


# ---------------------------------------------------------------------------
# Step 1: Open browser to Uber authorize URL
# ---------------------------------------------------------------------------

def generate_pkce() -> tuple:
    """Return (code_verifier, code_challenge) for PKCE S256."""
    code_verifier = base64.urlsafe_b64encode(secrets.token_bytes(32)).rstrip(b"=").decode()
    digest = hashlib.sha256(code_verifier.encode()).digest()
    code_challenge = base64.urlsafe_b64encode(digest).rstrip(b"=").decode()
    return code_verifier, code_challenge


def build_auth_url(code_challenge: str, state: str, nonce: str) -> str:
    params = urllib.parse.urlencode({
        "client_id":             CLIENT_ID,
        "response_type":         "code",
        "scope":                 SCOPE,
        "redirect_uri":          REDIRECT_URI,
        "code_challenge":        code_challenge,
        "code_challenge_method": "S256",
        "state":                 state,
        "nonce":                 nonce,
    })
    return f"{AUTHORIZE_URL}?{params}"


# ---------------------------------------------------------------------------
# Step 2: Tiny HTTP server to capture the callback code
# ---------------------------------------------------------------------------

captured_code: list = []  # single-element list so the handler can write to it

class CallbackHandler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        params = urllib.parse.parse_qs(parsed.query)

        if "code" in params:
            captured_code.append(params["code"][0])
            # state param is also returned — could verify here
            self.send_response(200)
            self.send_header("Content-Type", "text/html")
            self.end_headers()
            self.wfile.write(b"""
                <html><body style="font-family:sans-serif;padding:40px">
                <h2>&#x2705; Uber authorised!</h2>
                <p>You can close this tab and return to your terminal.</p>
                </body></html>
            """)
        else:
            error = params.get("error", ["unknown"])[0]
            self.send_response(400)
            self.send_header("Content-Type", "text/html")
            self.end_headers()
            self.wfile.write(f"<html><body><h2>&#x274C; Error: {error}</h2></body></html>".encode())

    def log_message(self, format, *args):
        pass  # silence request logs


def start_callback_server(port: int) -> http.server.HTTPServer:
    server = http.server.HTTPServer(("localhost", port), CallbackHandler)
    thread = threading.Thread(target=server.handle_request, daemon=True)
    thread.start()
    return server


# ---------------------------------------------------------------------------
# Step 3: Exchange code for token
# ---------------------------------------------------------------------------

def exchange_code(code: str, code_verifier: str) -> dict:
    print("\n[3] Exchanging code for token...")
    resp = httpx.post(TOKEN_URL, data={
        "client_id":     CLIENT_ID,
        "client_secret": CLIENT_SECRET,
        "grant_type":    "authorization_code",
        "code":          code,
        "redirect_uri":  REDIRECT_URI,
        "code_verifier": code_verifier,
    })
    print(f"    Status: {resp.status_code}")
    if resp.status_code != 200:
        print(f"    ❌ Failed: {resp.text}")
        return {}
    return resp.json()


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    if not CLIENT_ID or not CLIENT_SECRET:
        print("❌ UBER_CLIENT_ID or UBER_CLIENT_SECRET not set in .env")
        raise SystemExit(1)

    parsed_redirect = urllib.parse.urlparse(REDIRECT_URI)
    port = parsed_redirect.port or 8000

    code_verifier, code_challenge = generate_pkce()
    state = secrets.token_urlsafe(16)
    nonce = secrets.token_urlsafe(16)
    auth_url = build_auth_url(code_challenge, state, nonce)

    print("\nUber User OAuth Test")
    print("=" * 60)
    print(f"  Client ID:    {CLIENT_ID[:8]}...{CLIENT_ID[-4:]}")
    print(f"  Scope:        {SCOPE}")
    print(f"  Redirect URI: {REDIRECT_URI}")
    print("=" * 60)

    print(f"\n[1] Starting callback server on port {port}...")
    server = start_callback_server(port)

    print(f"\n[2] Opening Uber auth in your browser...")
    print(f"    URL: {auth_url}\n")
    webbrowser.open(auth_url)
    print("    (If the browser didn't open, paste the URL above manually.)")
    print("\n    Waiting for you to authorise in the browser...")

    # Block until the callback arrives (up to 120 seconds)
    import time
    for _ in range(120):
        if captured_code:
            break
        time.sleep(1)

    if not captured_code:
        print("\n❌ Timed out waiting for authorisation. Did the browser open?")
        raise SystemExit(1)

    code = captured_code[0]
    print(f"\n    ✅ Got authorisation code: {code[:12]}...")

    token_data = exchange_code(code, code_verifier)
    if not token_data:
        raise SystemExit(1)

    access_token  = token_data.get("access_token", "")
    refresh_token = token_data.get("refresh_token", "")
    expires_in    = token_data.get("expires_in", 0)
    scope         = token_data.get("scope", "")

    print(f"\n    ✅ access_token:  {access_token[:20]}...")
    print(f"    ✅ refresh_token: {refresh_token[:20]}..." if refresh_token else "    (no refresh_token)")
    print(f"    expires_in:      {expires_in}s ({expires_in // 86400} days)")
    print(f"    scope:           {scope}")

    TOKEN_FILE.write_text(json.dumps(token_data, indent=2))
    print(f"\n[4] Token saved to: {TOKEN_FILE}")
    print("\nNext step: run scripts/test_uber_mcp.py to test the MCP with this token.")
