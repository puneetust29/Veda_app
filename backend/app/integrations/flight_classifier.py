"""Flight detection for calendar events pulled from Google or a device.

Two-stage: a cheap regex pre-filter catches obvious flights (airline codes, PNR
patterns, "boarding"/"departs" language) without spending an LLM call on every
lunch meeting. Anything the regex can't confidently call gets one Anthropic
call with structured output, same pattern as agents/roaming/graph.py.
"""
from __future__ import annotations

import re
from typing import Optional

from langchain_anthropic import ChatAnthropic
from pydantic import BaseModel, Field

from app.config import get_settings

# Two-to-three letter airline code + 1-4 digit flight number, e.g. "AA 123",
# "BA0284", "UA1849" -- deliberately loose; false positives here just mean an
# event falls through to the LLM stage instead of being wrongly accepted.
_FLIGHT_NUMBER = re.compile(r"\b[A-Z]{2,3}\s?-?\s?\d{1,4}\b")
_KEYWORDS = re.compile(
    r"\b(flight|boarding|departs?|arriving|itinerary|e-?ticket|pnr|confirmation code|gate\s?\d)\b",
    re.IGNORECASE,
)
# IATA airport codes in a "XXX \u2192 YYY" / "XXX-YYY" / "XXX to YYY" layout, the
# shape most calendar apps and airline confirmation emails use for the title.
_AIRPORT_PAIR = re.compile(r"\b[A-Z]{3}\b\s*(?:\u2192|->|-|to)\s*\b[A-Z]{3}\b")


class FlightClassification(BaseModel):
    is_flight: bool = Field(description="true only if this event is an actual flight/trip departure or arrival")
    origin: Optional[str] = Field(default=None, description="departure city or airport, if identifiable")
    destination: Optional[str] = Field(default=None, description="arrival city or airport, if identifiable")
    confidence: float = Field(ge=0.0, le=1.0, description="0-1 confidence in is_flight")


def _llm():
    settings = get_settings()
    return ChatAnthropic(model=settings.anthropic_model, api_key=settings.anthropic_api_key)


def _regex_prefilter(title: str, location: str, notes: str) -> Optional[bool]:
    """Return True/False if the regexes are confident, None to defer to the LLM."""
    haystack = f"{title}\n{location}\n{notes}"
    hits = sum(
        1
        for pattern in (_FLIGHT_NUMBER, _KEYWORDS, _AIRPORT_PAIR)
        if pattern.search(haystack)
    )
    if hits >= 2:
        return True
    if hits == 0 and len(haystack.strip()) > 0:
        # No signal at all in a non-empty event -- confidently not a flight, and
        # skips an LLM call for the overwhelming majority of calendar entries.
        return False
    return None  # exactly one weak hit: ambiguous, ask the LLM


def _classify_prompt(title: str, location: str, notes: str) -> str:
    return (
        "Decide whether this calendar event represents a flight (a specific "
        "flight departure or arrival), not a generic trip, meeting, or reminder.\n\n"
        f"Title: {title!r}\n"
        f"Location: {location!r}\n"
        f"Notes: {notes!r}\n\n"
        "If it is a flight, extract the origin and destination (city or airport "
        "name/code) if they appear in the text. Leave them null if not stated."
    )


def classify_event(*, title: str, location: str = "", notes: str = "") -> FlightClassification:
    """Classify a single calendar event as a flight or not.

    Cheap regex pass first; only ambiguous events reach the LLM, so a batch of
    calendar events costs at most one Anthropic call per genuinely uncertain
    entry rather than one per event.
    """
    prefiltered = _regex_prefilter(title, location, notes)
    if prefiltered is False:
        return FlightClassification(is_flight=False, confidence=0.95)
    if prefiltered is True:
        # Regex is confident it's a flight, but still ask the LLM for origin/
        # destination extraction since that needs actual language understanding.
        result = _llm().with_structured_output(FlightClassification).invoke(
            _classify_prompt(title, location, notes)
        )
        result.is_flight = True
        result.confidence = max(result.confidence, 0.9)
        return result

    return _llm().with_structured_output(FlightClassification).invoke(
        _classify_prompt(title, location, notes)
    )
