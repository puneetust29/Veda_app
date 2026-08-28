from typing import Optional

from app.agents.base.state import AgentState


class UberAgentState(AgentState, total=False):
    customer: dict
    calendar_event: dict
    device_location: Optional[dict]

    origin_label: Optional[str]
    destination_label: Optional[str]

    origin_type: str
    reasoning: str
    suggested_message: str

    pickup_label: Optional[str]
    dropoff_label: Optional[str]
    uber_app_url: Optional[str]
    deep_link_url: Optional[str]
    airport_options: list[dict]
    alternative_options: list[dict]
    drive_mins_to_airport: Optional[int]
