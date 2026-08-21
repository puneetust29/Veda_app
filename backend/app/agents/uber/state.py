from typing import Optional

from app.agents.base.state import AgentState


class UberAgentState(AgentState, total=False):
    """Extends shared AgentState with Uber-specific graph node keys.

    UberAgent._initial_state() writes resolved context into both state["context"]
    (the contract) and these flat keys, mirroring the RoamingAgentState pattern.
    """

    customer: dict
    calendar_event: dict

    # Trip location fields (extracted from the calendar event)
    origin_label: Optional[str]       # e.g. "London Heathrow (LHR)"
    destination_label: Optional[str]  # e.g. "Tokyo Narita (NRT)"

    # Claude's recommendation output
    should_suggest: bool
    reasoning: str
    suggested_message: str

    # Deep link URLs built by the tool (None if coordinates not in the known map)
    uber_app_url: Optional[str]
    deep_link_url: Optional[str]
