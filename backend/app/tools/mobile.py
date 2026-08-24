"""Mocked telecom "mobile" product APIs: roaming plan catalog lookup + subscribe/activate.
Registered in the ToolRegistry as `mobile.get_roaming_plans` (read) and
`mobile.activate_roaming_plan` (commit) so manifests can declare them and the registry
can validate they exist.
"""
from datetime import datetime, timezone

from app.db.client import get_supabase
from app.tools.registry import ToolSpec, tool_registry


def fetch_roaming_catalog(destination_country: str) -> list[dict]:
    """Mocked telecom roaming-plan product API, backed by the roaming_plans table.

    Handles city names (NYC -> United States), country names, and country codes.
    """
    supabase = get_supabase()

    # City -> country code mapping for common destinations
    city_to_country = {
        "NYC": "US",
        "New York": "US",
        "LA": "US",
        "Los Angeles": "US",
        "London": "GB",
        "Paris": "FR",
        "Tokyo": "JP",
        "Delhi": "IN",
        "Mumbai": "IN",
        "Singapore": "SG",
        "Sydney": "AU",
        "Casablanca": "MA",
    }

    # Normalize input: remove whitespace, check city mapping
    search_value = destination_country.strip()
    country_code = city_to_country.get(search_value)

    # If city mapping found, search by country_code
    if country_code:
        result = (
            supabase.table("roaming_plans")
            .select("*")
            .eq("country_code", country_code)
            .order("duration_days")
            .execute()
        )
        return result.data

    # Try exact match on country_name first
    result = (
        supabase.table("roaming_plans")
        .select("*")
        .eq("country_name", search_value)
        .order("duration_days")
        .execute()
    )
    if result.data:
        return result.data

    # Try country_code (case-insensitive)
    result = (
        supabase.table("roaming_plans")
        .select("*")
        .eq("country_code", search_value.upper())
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


tool_registry.register(
    ToolSpec(name="mobile.get_roaming_plans", handler=fetch_roaming_catalog, risk="read", provider="mobile")
)
tool_registry.register(
    ToolSpec(
        name="mobile.activate_roaming_plan", handler=subscribe_roaming_plan, risk="commit", provider="mobile"
    )
)
