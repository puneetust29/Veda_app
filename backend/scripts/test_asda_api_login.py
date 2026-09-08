"""
Test Azure AD B2C ROPC (Resource Owner Password Credentials) login for Asda.

If this works, we can authenticate with Asda's API directly — no browser,
no Cloudflare. The token can then be used to manage baskets via SFCC API.

Usage:
    cd backend
    .venv/bin/python scripts/test_asda_api_login.py
"""
import json
import os
import sys

import httpx
from dotenv import load_dotenv

load_dotenv()

email = os.getenv("ASDA_EMAIL", "")
password = os.getenv("ASDA_PASSWORD", "")

if not email or not password:
    sys.exit("ASDA_EMAIL and ASDA_PASSWORD must be set in .env")

# Azure B2C details (extracted from Asda's login flow)
TENANT_ID = "50a54d59-feff-4746-b172-93ce8b5e4dbb"
POLICY = "B2C_1A_GROCERIES_PWA_SIGNUP_SIGNIN"
CLIENT_ID = "8121a3d6-3e1c-4992-9b43-c0bf555159f5"

token_url = f"https://login.asda.com/{TENANT_ID}/{POLICY}/oauth2/v2.0/token"

print(f"Trying ROPC password grant…")
print(f"  Endpoint: {token_url}")
print(f"  Username: {email}")
print()

data = {
    "grant_type": "password",
    "client_id": CLIENT_ID,
    "username": email,
    "password": password,
    "scope": f"openid offline_access {CLIENT_ID}",
    "response_type": "token",
}

try:
    resp = httpx.post(token_url, data=data, timeout=15)
    print(f"HTTP {resp.status_code}")

    try:
        body = resp.json()
    except Exception:
        print(f"Response: {resp.text[:500]}")
        sys.exit(1)

    if "access_token" in body:
        print("SUCCESS — got an access token!")
        print(f"  Token type: {body.get('token_type')}")
        print(f"  Expires in: {body.get('expires_in')}s")
        # Don't print the full token for security
        token = body["access_token"]
        print(f"  Token preview: {token[:50]}…")

        # Decode JWT payload to check user info
        import base64
        parts = token.split(".")
        if len(parts) >= 2:
            payload = parts[1] + "=" * (4 - len(parts[1]) % 4)
            decoded = json.loads(base64.b64decode(payload))
            print(f"  User: {decoded.get('isb', decoded.get('sub', 'unknown'))[:100]}")
            print(f"  Scopes: {decoded.get('scp', 'N/A')[:100]}")
    else:
        print(f"FAILED")
        print(f"  Error: {body.get('error', 'unknown')}")
        desc = body.get("error_description", "")
        print(f"  Description: {desc[:300]}")

        if body.get("error") == "invalid_grant":
            print()
            print("ROPC grant type may not be enabled on Asda's Azure B2C tenant.")
            print("This is common — many tenants disable it for security.")

except Exception as e:
    print(f"Request failed: {e}")
