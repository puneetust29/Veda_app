"""Mocked telecom "mobile" product APIs: roaming plan catalog lookup + subscribe/activate.
Registered in the ToolRegistry as `mobile.get_roaming_plans` (read) and
`mobile.activate_roaming_plan` (commit) so manifests can declare them and the registry
can validate they exist.
"""
from datetime import datetime, timezone

from app.db.client import get_supabase
from app.tools.registry import ToolSpec, tool_registry


def fetch_roaming_catalog(destination_country: str) -> list[dict]:
    """Mocked telecom roaming-plan product API, backed by the roaming_plans table."""
    supabase = get_supabase()
    result = (
        supabase.table("roaming_plans")
        .select("*")
        .ilike("country_name", destination_country.strip())
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
