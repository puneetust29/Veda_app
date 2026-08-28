from typing import Literal, Optional

from pydantic import BaseModel, Field


class RideSuggestion(BaseModel):
    origin_type: Literal["airport", "train_station", "ferry", "unknown"] = Field(
        description="Type of departure location: airport, train_station, ferry, or unknown"
    )
    reasoning: str = Field(description="Brief reasoning about the origin type")
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


class UberRideSuggestionCard(BaseModel):
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
    drive_mins_to_airport: Optional[int] = None
