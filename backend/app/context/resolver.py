"""ContextResolver: declared context key -> fetcher, so an agent only ever receives the
context keys its manifest declares in `required_context` (the "Context Contract").

Most fetchers here do no I/O of their own -- they just pass through values a caller
already resolved earlier in the request (e.g. `get_current_customer`'s result, or a
`calendar_events` row already fetched by the route). `upcoming_trips` is the one
exception: no route already has the customer's *full* trip list on hand (routes only
ever load the single calendar_event their screen is about), so it queries fresh.
Registered at construction time.
"""
from __future__ import annotations

from functools import lru_cache
from typing import Callable, Dict, Iterable, Optional


def _customer_fetcher(principal: dict, subject: Optional[dict]) -> dict:
    return principal


def _calendar_event_fetcher(principal: dict, subject: Optional[dict]) -> Optional[dict]:
    return (subject or {}).get("calendar_event")


def _upcoming_trips_fetcher(principal: dict, subject: Optional[dict]) -> list:
    """All of the customer's upcoming flights, not just the one calendar_event the
    current screen is about -- needed to answer "what's my next trip" style questions
    that aren't about the trip currently open in the app."""
    from datetime import datetime, timezone

    from app.deps import get_supabase

    supabase = get_supabase()
    now = datetime.now(timezone.utc).isoformat()
    result = (
        supabase.table("calendar_events")
        .select("id, origin, destination, start_datetime, end_datetime, event_type, raw_details")
        .eq("customer_id", principal.get("id"))
        .eq("event_type", "flight")
        .gte("start_datetime", now)
        .order("start_datetime")
        .execute()
    )
    return result.data or []


def _active_insurance_fetcher(principal: dict, subject: Optional[dict]) -> list:
    """The customer's active travel insurance purchases, keyed by calendar_event_id --
    master_agent needs this to say whether a given trip is insured, since that lives in
    a separate table from the trip itself (see app/routers/payments.py's
    insurance_purchases table, also used by GET /insurance/active)."""
    from app.deps import get_supabase

    supabase = get_supabase()
    result = (
        supabase.table("insurance_purchases")
        .select("id, calendar_event_id, status, purchased_at, plan_details")
        .eq("customer_id", principal.get("id"))
        .eq("status", "active")
        .execute()
    )
    return result.data or []


def _location_context_fetcher(principal: dict, subject: Optional[dict]) -> Optional[str]:
    from app.context.location_context import location_context_fetcher
    return location_context_fetcher(principal, subject)


def _enriched_location_context_fetcher(principal: dict, subject: Optional[dict]) -> Optional[dict]:
    from app.context.location_context import enriched_location_context_fetcher
    return enriched_location_context_fetcher(principal, subject)


class ContextResolver:
    def __init__(self) -> None:
        self._fetchers: Dict[str, Callable[[dict, Optional[dict]], object]] = {
            "customer": _customer_fetcher,
            "calendar_event": _calendar_event_fetcher,
            "upcoming_trips": _upcoming_trips_fetcher,
            "active_insurance": _active_insurance_fetcher,
            "location_context": _location_context_fetcher,
            "enriched_location_context": _enriched_location_context_fetcher,
        }

    def register(self, key: str, fetcher: Callable[[dict, Optional[dict]], object]) -> None:
        self._fetchers[key] = fetcher

    def has(self, key: str) -> bool:
        return key in self._fetchers

    def resolve(self, keys: Iterable[str], principal: dict, subject: Optional[dict] = None) -> dict:
        resolved: Dict[str, object] = {}
        for key in keys:
            if key in resolved:  # memoized per-call
                continue
            fetcher = self._fetchers.get(key)
            if fetcher is None:
                raise KeyError(f"no context resolver registered for '{key}'")
            resolved[key] = fetcher(principal, subject)
        return resolved


@lru_cache
def get_context_resolver() -> ContextResolver:
    return ContextResolver()
