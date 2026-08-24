from typing import Optional

from app.agents.base.state import AgentState


class UberAgentState(AgentState, total=False):
    """Extends shared AgentState with Uber-specific graph node keys.

    UberAgent._initial_state() writes resolved context into both state["context"]
    (the contract) and these flat keys, mirroring the RoamingAgentState pattern.
    """

    customer: dict
    calendar_event: dict
    device_location: Optional[dict]

    # Trip location fields (extracted from the calendar event)
    origin_label: Optional[str]       # e.g. "London Heathrow (LHR)"
    destination_label: Optional[str]  # e.g. "Tokyo Narita (NRT)"

    # LLM classification output
    origin_type: str          # "airport" | "train_station" | "ferry" | "unknown"
    reasoning: str
    suggested_message: str

    # MCP-enriched quote/auth state
    connect_uber_url: Optional[str]
    live_quote: Optional[dict]
    quote_status: Optional[str]
    mcp_available: bool
    mcp_error: Optional[str]

    # Deep link URLs built by the tool (None if the user must choose an airport option first)
    pickup_label: Optional[str]
    dropoff_label: Optional[str]
    uber_app_url: Optional[str]
    deep_link_url: Optional[str]
    airport_options: list[dict]
    # Alternative airport options shown when origin is far from user's current location
    alternative_options: list[dict]
    # Ranked ride offers from uber-mcp (empty when falling back to deeplink)
    ride_offers: list[dict]
