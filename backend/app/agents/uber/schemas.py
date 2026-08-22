from typing import Literal, Optional

from pydantic import BaseModel, Field


class RideSuggestion(BaseModel):
    """Claude's structured output when recommending a ride for the trip.

    Deliberately minimal: the LLM's job is only to decide whether to suggest a
    ride and write the user-facing message. All location labels and deep-link
    URLs are derived by the graph from device GPS + the airport coordinates
    lookup -- the LLM never sees or produces coordinates.
    """
    should_suggest: bool = Field(
        description="Whether an Uber ride makes sense for this trip context"
    )
    reasoning: str = Field(
        description="Why a ride is (or isn't) being suggested"
    )
    suggested_message: str = Field(
        description="Short, friendly message to show the user (e.g. 'Need a ride to the airport?')"
    )


class UberAirportOption(BaseModel):
    label: str
    uber_app_url: str
    deep_link_url: str


class UberLiveQuote(BaseModel):
    product_name: str
    estimate: str
    currency_code: Optional[str] = None
    eta_minutes: Optional[int] = None


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
    # Deep link URLs — populated after the tool call, None if the user needs to
    # choose from several airport options first.
    uber_app_url: Optional[str] = None
    deep_link_url: Optional[str] = None
    airport_options: list[UberAirportOption] = Field(default_factory=list)
    connect_uber_url: Optional[str] = None
    live_quote: Optional[UberLiveQuote] = None
    quote_status: Optional[str] = None
