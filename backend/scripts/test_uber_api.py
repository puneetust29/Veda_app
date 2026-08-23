"""
Uber API verification test.

Tests whether our existing Client ID + Secret can:
  1. Get an OAuth token (client_credentials grant)
  2. Call GET /estimates/price on the sandbox
  3. Call GET /estimates/time on the sandbox

Run from the backend directory:
  python scripts/test_uber_api.py

No graph, no agent, no LangGraph — just raw HTTP calls.
"""

import json
import os
import sys
from typing import Optional
from urllib.parse import urlencode

import httpx


# ---------------------------------------------------------------------------
# Config — read from environment or .env
# ---------------------------------------------------------------------------

def load_env():
    env_path = os.path.join(os.path.dirname(__file__), "..", ".env")
    env = {}
    try:
        with open(env_path) as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, _, v = line.partition("=")
                    env[k.strip()] = v.strip()
    except FileNotFoundError:
        pass
    return env

env = load_env()
CLIENT_ID     = env.get("UBER_CLIENT_ID")     or os.getenv("UBER_CLIENT_ID")
CLIENT_SECRET = env.get("UBER_CLIENT_SECRET") or os.getenv("UBER_CLIENT_SECRET")

# Sandbox base URL (safe — no real drivers affected)
SANDBOX_BASE  = "https://sandbox-api.uber.com"
OAUTH_URL     = "https://auth.uber.com/oauth/v2/token"

# Test coordinates: London Heathrow (LHR) → Central London (Paddington)
PICKUP_LAT    = 51.5074   # Paddington / Central London (user's current location)
PICKUP_LNG    = -0.1278
DROPOFF_LAT   = 51.4700   # London Heathrow (LHR)
DROPOFF_LNG   = -0.4543


def separator(title: str):
    print(f"\n{'='*60}")
    print(f"  {title}")
    print('='*60)


# ---------------------------------------------------------------------------
# Step 1: Get OAuth token via client_credentials
# ---------------------------------------------------------------------------

def get_token() -> Optional[str]:
    separator("STEP 1: OAuth token (client_credentials)")

    if not CLIENT_ID or not CLIENT_SECRET:
        print("❌ UBER_CLIENT_ID or UBER_CLIENT_SECRET not set in .env")
        return None

    print(f"  Client ID: {CLIENT_ID[:8]}...{CLIENT_ID[-4:]}")
    print(f"  Grant:     client_credentials")
    print(f"  Scope:     (none specified — let Uber decide)")

    # Try scopes from most to least privileged — client_credentials requires at least one scope
    for scope in ["request", "profile history", "profile"]:
        payload = {
            "client_id":     CLIENT_ID,
            "client_secret": CLIENT_SECRET,
            "grant_type":    "client_credentials",
            "scope":         scope,
        }
        print(f"\n  Trying scope: '{scope}'")
        with httpx.Client() as client:
            resp = client.post(OAUTH_URL, data=payload)
        print(f"  Status: {resp.status_code}")
        try:
            body = resp.json()
        except Exception:
            body = resp.text
        print(f"  Body:   {json.dumps(body, indent=2) if isinstance(body, dict) else body}")
        if resp.status_code == 200:
            token = body.get("access_token")
            print(f"\n  ✅ Got token (scope='{scope}'): {token[:20]}...")
            return token

    print("\n  ❌ Could not get token with any scope")
    return None


# ---------------------------------------------------------------------------
# Step 2: GET /estimates/price
# ---------------------------------------------------------------------------

def test_price_estimates(token: str):
    separator("STEP 2: GET /estimates/price (Paddington → Heathrow)")

    url = f"{SANDBOX_BASE}/v1.2/estimates/price"
    params = {
        "start_latitude":  PICKUP_LAT,
        "start_longitude": PICKUP_LNG,
        "end_latitude":    DROPOFF_LAT,
        "end_longitude":   DROPOFF_LNG,
    }
    headers = {"Authorization": f"Bearer {token}"}

    print(f"  URL:    {url}")
    print(f"  Params: {params}")

    with httpx.Client() as client:
        resp = client.get(url, params=params, headers=headers)

    print(f"\n  Status: {resp.status_code}")

    if resp.status_code == 200:
        data = resp.json()
        prices = data.get("prices", [])
        print(f"\n  ✅ Got {len(prices)} ride options:\n")
        for p in prices:
            print(f"    {p.get('display_name', '?'):15}  {p.get('estimate', '?'):12}  ETA: {p.get('duration', 0)//60} min")
        print(f"\n  Full response:\n{json.dumps(data, indent=2)}")
    else:
        print(f"\n  ❌ Failed:\n{json.dumps(resp.json(), indent=2)}")

    return resp.status_code == 200


# ---------------------------------------------------------------------------
# Step 3: GET /estimates/time
# ---------------------------------------------------------------------------

def test_time_estimates(token: str):
    separator("STEP 3: GET /estimates/time (pickup ETAs at Paddington)")

    url = f"{SANDBOX_BASE}/v1.2/estimates/time"
    params = {
        "start_latitude":  PICKUP_LAT,
        "start_longitude": PICKUP_LNG,
    }
    headers = {"Authorization": f"Bearer {token}"}

    print(f"  URL:    {url}")
    print(f"  Params: {params}")

    with httpx.Client() as client:
        resp = client.get(url, params=params, headers=headers)

    print(f"\n  Status: {resp.status_code}")

    if resp.status_code == 200:
        data = resp.json()
        times = data.get("times", [])
        print(f"\n  ✅ Got {len(times)} ETAs:\n")
        for t in times:
            print(f"    {t.get('display_name', '?'):15}  ETA: {t.get('estimate', 0)//60} min")
        print(f"\n  Full response:\n{json.dumps(data, indent=2)}")
    else:
        print(f"\n  ❌ Failed:\n{json.dumps(resp.json(), indent=2)}")

    return resp.status_code == 200


# ---------------------------------------------------------------------------
# Step 4: GET /products (what ride types exist at this location)
# ---------------------------------------------------------------------------

def test_products(token: str):
    separator("STEP 4: GET /products (available at Paddington)")

    url = f"{SANDBOX_BASE}/v1.2/products"
    params = {
        "latitude":  PICKUP_LAT,
        "longitude": PICKUP_LNG,
    }
    headers = {"Authorization": f"Bearer {token}"}

    print(f"  URL:    {url}")
    print(f"  Params: {params}")

    with httpx.Client() as client:
        resp = client.get(url, params=params, headers=headers)

    print(f"\n  Status: {resp.status_code}")

    if resp.status_code == 200:
        data = resp.json()
        products = data.get("products", [])
        print(f"\n  ✅ Got {len(products)} products:\n")
        for p in products:
            print(f"    {p.get('display_name', '?'):15}  id: {p.get('product_id', '?')[:8]}...")
        print(f"\n  Full response:\n{json.dumps(data, indent=2)}")
    else:
        print(f"\n  ❌ Failed:\n{json.dumps(resp.json(), indent=2)}")

    return resp.status_code == 200


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    print("\nUber API Verification Test")
    print("Sandbox only — no real drivers, no real charges\n")
    print(f"Route: Paddington ({PICKUP_LAT}, {PICKUP_LNG}) → Heathrow ({DROPOFF_LAT}, {DROPOFF_LNG})")

    token = get_token()

    if not token:
        print("\n❌ Cannot proceed without a token. Check credentials.")
        sys.exit(1)

    price_ok  = test_price_estimates(token)
    time_ok   = test_time_estimates(token)
    prod_ok   = test_products(token)

    separator("SUMMARY")
    print(f"  OAuth token:       {'✅' if token    else '❌'}")
    print(f"  Price estimates:   {'✅' if price_ok else '❌'}")
    print(f"  Time estimates:    {'✅' if time_ok  else '❌'}")
    print(f"  Products:          {'✅' if prod_ok  else '❌'}")
    print()
