from typing import Optional

from pydantic import BaseModel, Field


class MasterReply(BaseModel):
    reply: str
    wants_ride_booking: bool = Field(
        default=False,
        description=(
            "true if the user is asking to book/order a ride (uber, taxi, cab) tied "
            "to their trip -- e.g. 'book an uber', 'get me a cab to the airport'. "
            "false for anything else, including questions about rides in general."
        ),
    )
    pickup_label: Optional[str] = Field(
        default=None,
        description=(
            "Only when wants_ride_booking is true: the explicit pickup location named "
            "in the message, e.g. 'Bangalore airport' in 'uber from Bangalore airport "
            "to Hebbal'. Null if no pickup was named (use the device's current location)."
        ),
    )
    dropoff_label: Optional[str] = Field(
        default=None,
        description=(
            "Only when wants_ride_booking is true: the explicit destination named in "
            "the message, e.g. 'Hebbal' in 'uber from Bangalore airport to Hebbal', or "
            "'the airport' in 'book me an uber to the airport'. Null if the message "
            "doesn't name a specific destination (falls back to a flight-based ride "
            "suggestion instead)."
        ),
    )
