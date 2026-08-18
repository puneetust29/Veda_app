"""ContextResolver: declared context key -> fetcher, so an agent only ever receives the
context keys its manifest declares in `required_context` (the "Context Contract").

Fetchers here do no I/O of their own -- they just pass through values a caller already
resolved earlier in the request (e.g. `get_current_customer`'s result, or a
`calendar_events` row already fetched by the route). Registered at construction time.
"""
from __future__ import annotations

from functools import lru_cache
from typing import Callable, Dict, Iterable, Optional


def _customer_fetcher(principal: dict, subject: Optional[dict]) -> dict:
    return principal


def _calendar_event_fetcher(principal: dict, subject: Optional[dict]) -> Optional[dict]:
    return (subject or {}).get("calendar_event")


class ContextResolver:
    def __init__(self) -> None:
        self._fetchers: Dict[str, Callable[[dict, Optional[dict]], object]] = {
            "customer": _customer_fetcher,
            "calendar_event": _calendar_event_fetcher,
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
