from __future__ import annotations

from typing import Optional
from pydantic import BaseModel, Field


class LineStatus(BaseModel):
    line_name: str
    status: str
    severity: int
    disruption: Optional[str] = None


class JourneyLeg(BaseModel):
    mode: str
    instruction: str
    duration_mins: int


class JourneyOption(BaseModel):
    duration_mins: int
    legs: list[JourneyLeg]


class TransportResult(BaseModel):
    has_london: bool
    direction: Optional[str] = None  # "from_london" | "to_london"
    airport: Optional[str] = None
    line_statuses: list[LineStatus] = Field(default_factory=list)
    journey_options: list[JourneyOption] = Field(default_factory=list)
    summary: str = ""
