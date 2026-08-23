from typing import Literal, Optional

from pydantic import BaseModel, Field


class RideSuggestion(BaseModel):
    """Claude's structured output for a ride suggestion.

    The LLM identifies the origin type and writes the user-facing message.
    Whether to suggest and distance/alternative logic is handled by graph code —
    the LLM never produces coordinates or deep-link URLs.
    """
    origin_type: Literal["airport", "train_station", "ferry", "unknown"] = Field(
        description="Type of departure location: airport, train_station, ferry, or unknown"
    )
    reasoning: str = Field(
        description="Brief reasoning about the origin type and why this message was chosen"
    )
    suggested_message: str = Field(
        description=(
            "Short friendly message for the user. "
            "Airport: 'Need a ride to Heathrow before your Tokyo flight?' "
            "Train station: 'Need a ride to St Pancras for your Eurostar?' "
            "Unknown: 'Need an Uber before your trip?'"
        )
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

    Uses official Uber deep-link API. No live quotes or OAuth URLs included.
    Uses a `kind` discriminator so future agent cards can coexist as additive
    union members alongside the existing `roaming_plan` card kind.

    alternative_options: shown when the origin is far from the user's current location
    (e.g. train to London but user is in Seattle). Offers nearby airport rides as an
    alternative to riding directly to a distant station.
    """
    kind: Literal["uber_ride"] = "uber_ride"
    origin_type: str = "airport"
    reasoning: str
    suggested_message: str
    pickup_label: Optional[str] = None
    dropoff_label: Optional[str] = None
    uber_app_url: Optional[str] = None
    deep_link_url: Optional[str] = None
    airport_options: list[UberAirportOption] = Field(default_factory=list)
    alternative_options: list[UberAirportOption] = Field(default_factory=list)
