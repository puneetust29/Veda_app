"""Location context fetcher.

Reads the semantic location context from the chat request body.
Accepts either the legacy plain-string form or the new enriched structured form.
The enriched form is preferred when present; both are passed through to VedaAgentState.
"""
from __future__ import annotations

from typing import Optional


def location_context_fetcher(principal: dict, subject: Optional[dict]) -> Optional[str]:
    """Return the pre-formatted location context string (legacy + enriched fallback)."""
    s = subject or {}
    string_ctx = s.get("location_context")
    enriched = s.get("enriched_location_context")

    if enriched and isinstance(enriched, dict):
        # Build a readable string from the enriched struct as fallback for agents
        # that only consume the string form. The enriched dict is passed separately.
        cp = enriched.get("currentPlace")
        if cp and cp.get("semanticLabel"):
            label = cp["semanticLabel"]
            mins = cp.get("arrivedMinutesAgo")
            mins_str = f", arrived about {mins} min ago" if mins else ""
            return string_ctx or f"User is currently at {label}{mins_str}."

    return string_ctx


def enriched_location_context_fetcher(principal: dict, subject: Optional[dict]) -> Optional[dict]:
    """Return the structured enriched location context dict if present."""
    return (subject or {}).get("enriched_location_context")
