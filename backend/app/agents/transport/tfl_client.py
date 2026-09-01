from __future__ import annotations

import httpx
from app.config import get_settings

TFL_BASE = "https://api.tfl.gov.uk"
DEFAULT_MODES = "tube,elizabeth-line,dlr,overground"

# London airports: keyword → display name + journey planner "from/to" string
LONDON_AIRPORTS: dict[str, dict] = {
    "heathrow": {"name": "Heathrow Airport", "journey_loc": "940GZZLUHR5"},
    "lhr":      {"name": "Heathrow Airport", "journey_loc": "940GZZLUHR5"},
    "gatwick":  {"name": "Gatwick Airport",  "journey_loc": "910GGTWK"},
    "lgw":      {"name": "Gatwick Airport",  "journey_loc": "910GGTWK"},
    "stansted": {"name": "Stansted Airport", "journey_loc": "Stansted Airport"},
    "stn":      {"name": "Stansted Airport", "journey_loc": "Stansted Airport"},
    "luton":    {"name": "Luton Airport",    "journey_loc": "Luton Airport Parkway"},
    "ltn":      {"name": "Luton Airport",    "journey_loc": "Luton Airport Parkway"},
    "london city": {"name": "London City Airport", "journey_loc": "London City Airport"},
    "lcy":          {"name": "London City Airport", "journey_loc": "London City Airport"},
}

# Central London destination for journey planning
CENTRAL_LONDON = "940GZZLUKSX"  # King's Cross St. Pancras


def _api_key() -> str:
    return get_settings().tfl_api_key


def get_line_status(modes: str = DEFAULT_MODES) -> list[dict]:
    """Fetch current status for the given comma-separated modes."""
    r = httpx.get(
        f"{TFL_BASE}/Line/Mode/{modes}/Status",
        params={"app_key": _api_key()},
        timeout=10,
    )
    r.raise_for_status()
    return r.json()


def get_journey(from_loc: str, to_loc: str) -> list[dict]:
    """Return up to 3 journey options between from_loc and to_loc."""
    r = httpx.get(
        f"{TFL_BASE}/Journey/JourneyResults/{from_loc}/to/{to_loc}",
        params={"app_key": _api_key(), "useRealTimeLiveArrivals": "true"},
        timeout=10,
    )
    r.raise_for_status()
    return r.json().get("journeys", [])


def detect_london_airport(text: str) -> dict | None:
    """Return airport metadata if the text mentions a London airport, else None."""
    lower = text.lower()
    for keyword, meta in LONDON_AIRPORTS.items():
        if keyword in lower:
            return meta
    return None


def is_london(text: str) -> bool:
    """Return True if the text references London (generic, no specific airport)."""
    return "london" in text.lower() or "st pancras" in text.lower()
