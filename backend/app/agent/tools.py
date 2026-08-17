from datetime import datetime, timezone

from app.db.client import get_supabase


def extract_trip_context(calendar_event: dict) -> tuple[str, int]:
    """Derive destination country + trip length (days) from a mocked flight event."""
    destination_country = calendar_event.get("raw_details", {}).get("destination_country")
    if not destination_country:
        destination_country = calendar_event.get("destination", "Unknown")

    start = datetime.fromisoformat(calendar_event["start_datetime"])
    end = datetime.fromisoformat(calendar_event["end_datetime"])
    duration_days = max(1, (end - start).days)
    return destination_country, duration_days


def fetch_roaming_catalog(destination_country: str) -> list[dict]:
    """Mocked telecom roaming-plan product API, backed by the roaming_plans table."""
    supabase = get_supabase()
    result = (
        supabase.table("roaming_plans")
        .select("*")
        .eq("country_name", destination_country)
        .order("duration_days")
        .execute()
    )
    return result.data


def subscribe_roaming_plan(
    customer_id: str,
    roaming_plan_id: str,
    calendar_event_id: str,
    agent_reasoning: dict,
) -> dict:
    """Mocked telecom roaming "subscribe" API: activates the plan for the customer."""
    supabase = get_supabase()
    result = (
        supabase.table("subscriptions")
        .insert(
            {
                "customer_id": customer_id,
                "roaming_plan_id": roaming_plan_id,
                "calendar_event_id": calendar_event_id,
                "status": "active",
                "agent_reasoning": agent_reasoning,
                "subscribed_at": datetime.now(timezone.utc).isoformat(),
            }
        )
        .execute()
    )
    return result.data[0]
