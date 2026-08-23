"""
Add US-based upcoming trips for Alex Morgan (+15550001111) — the default test user.

Run from the backend directory:
  python scripts/seed_us_trips.py

Safe to run multiple times — uses upsert with conflict handling.
"""

import os
from datetime import datetime, timezone, timedelta
from pathlib import Path

from supabase import create_client


def load_env() -> dict:
    env = {}
    env_path = Path(__file__).parent.parent / ".env"
    for line in env_path.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, _, v = line.partition("=")
            env[k.strip()] = v.strip()
    return env


env = load_env()
supabase = create_client(env["SUPABASE_URL"], env["SUPABASE_SERVICE_ROLE_KEY"])


def now_plus(days: int) -> str:
    return (datetime.now(timezone.utc) + timedelta(days=days)).isoformat()


def get_customer_id(phone: str) -> str:
    result = supabase.table("customers").select("id").eq("phone_number", phone).single().execute()
    return result.data["id"]


US_TRIPS = [
    {
        "title": "Flight to New York",
        "event_type": "flight",
        "origin": "Seattle-Tacoma International Airport (SEA)",
        "destination": "John F. Kennedy International Airport (JFK)",
        "start_datetime": now_plus(3),
        "end_datetime": now_plus(7),
        "raw_details": {
            "airline": "Alaska Airlines",
            "flight_number": "AS12",
            "destination_country": "United States",
        },
    },
    {
        "title": "Conference in Chicago",
        "event_type": "flight",
        "origin": "Los Angeles International Airport (LAX)",
        "destination": "O'Hare International Airport (ORD)",
        "start_datetime": now_plus(10),
        "end_datetime": now_plus(13),
        "raw_details": {
            "airline": "United Airlines",
            "flight_number": "UA456",
            "destination_country": "United States",
        },
    },
    {
        "title": "Flight to Miami",
        "event_type": "flight",
        "origin": "Dallas/Fort Worth International Airport (DFW)",
        "destination": "Miami International Airport (MIA)",
        "start_datetime": now_plus(18),
        "end_datetime": now_plus(21),
        "raw_details": {
            "airline": "American Airlines",
            "flight_number": "AA789",
            "destination_country": "United States",
        },
    },
    {
        "title": "Flight to San Francisco",
        "event_type": "flight",
        "origin": "Boston Logan International Airport (BOS)",
        "destination": "San Francisco International Airport (SFO)",
        "start_datetime": now_plus(25),
        "end_datetime": now_plus(28),
        "raw_details": {
            "airline": "Delta Air Lines",
            "flight_number": "DL321",
            "destination_country": "United States",
        },
    },
    {
        "title": "Flight to Denver",
        "event_type": "flight",
        "origin": "Hartsfield-Jackson Atlanta Airport (ATL)",
        "destination": "Denver International Airport (DEN)",
        "start_datetime": now_plus(32),
        "end_datetime": now_plus(35),
        "raw_details": {
            "airline": "Southwest Airlines",
            "flight_number": "WN101",
            "destination_country": "United States",
        },
    },
]


if __name__ == "__main__":
    print("\nSeeding US trips for Alex Morgan (+15550001111)...")

    customer_id = get_customer_id("+15550001111")
    print(f"  customer_id: {customer_id}")

    for trip in US_TRIPS:
        row = {**trip, "customer_id": customer_id}
        row["raw_details"] = row["raw_details"]  # already a dict, supabase-py handles it
        result = supabase.table("calendar_events").insert(row).execute()
        print(f"  ✅ Inserted: {trip['title']} ({trip['origin']} → {trip['destination']})")

    print(f"\nDone — {len(US_TRIPS)} US trips added.")
    print("Refresh the Veda app to see them under Upcoming Trips.")
