from typing import Literal, Optional

from pydantic import BaseModel, Field


class RideSuggestion(BaseModel):
    """Claude's structured output when recommending a ride for the trip."""
    should_suggest: bool = Field(
        description="Whether an Uber ride makes sense for this trip context"
    )
    reasoning: str = Field(
        description="Why a ride is (or isn't) being suggested"
    )
    pickup_label: Optional[str] = Field(
        default=None,
        description="Human-readable pickup location label (e.g. 'London Heathrow (LHR)')"
    )
    dropoff_label: Optional[str] = Field(
        default=None,
        description="Human-readable dropoff location label (e.g. 'Tokyo Narita (NRT)')"
    )
    suggested_message: str = Field(
        description="Short, friendly message to show the user (e.g. 'Need a ride to the airport?')"
    )


class UberRideSuggestionCard(BaseModel):
    """The recommendation_ready stream event card payload for the Uber agent.

    Uses a `kind` discriminator so future agent cards can coexist as additive
    union members alongside the existing `roaming_plan` card kind.
    """
    kind: Literal["uber_ride"] = "uber_ride"
    should_suggest: bool
    reasoning: str
    suggested_message: str
    pickup_label: Optional[str] = None
    dropoff_label: Optional[str] = None
    # Deep link URLs — populated after the tool call, None if coordinates unknown
    uber_app_url: Optional[str] = None
    deep_link_url: Optional[str] = None
