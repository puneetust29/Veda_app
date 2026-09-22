"""Ticket Tailor REST API client.

Covers the confirmed-working, self-serve surface of the API: browsing events,
managing event series / ticket types / holds / discounts, and reading back orders.

There is deliberately no order/checkout-creation method here — Ticket Tailor's
public API has no such endpoint (confirmed by live testing against a real box
office, see research/TicketTailor/API-Research.md §13.5). Actual ticket purchase
happens on Ticket Tailor's own hosted checkout page (the `url` field returned on
an event series), not via this API.

Auth is HTTP Basic with the raw API key Base64-encoded as the username (per Ticket
Tailor's convention — not `key:password`). Write requests must be form-urlencoded;
JSON bodies are silently ignored by the API.
"""
from __future__ import annotations

import base64
from typing import Any, Optional

import httpx

from app.config import get_settings

BASE_URL = "https://api.tickettailor.com/v1"


def _auth_header(api_key: str) -> dict[str, str]:
    encoded = base64.b64encode(api_key.encode()).decode()
    return {"Authorization": f"Basic {encoded}", "Accept": "application/json"}


class TicketTailorError(RuntimeError):
    def __init__(self, status_code: int, error_code: str, message: str):
        super().__init__(f"{status_code} {error_code}: {message}")
        self.status_code = status_code
        self.error_code = error_code
        self.message = message


class TicketTailorClient:
    def __init__(self, api_key: Optional[str] = None) -> None:
        settings = get_settings()
        self.api_key = api_key or settings.tickettailor_api_key
        if not self.api_key:
            raise RuntimeError("Ticket Tailor API key not configured (TICKETTAILOR_API_KEY)")
        self._client = httpx.Client(
            base_url=BASE_URL, headers=_auth_header(self.api_key), timeout=10
        )

    def close(self) -> None:
        self._client.close()

    def __enter__(self) -> "TicketTailorClient":
        return self

    def __exit__(self, *exc: object) -> None:
        self.close()

    def _request(self, method: str, path: str, **kwargs: Any) -> dict[str, Any]:
        resp = self._client.request(method, path, **kwargs)
        if resp.status_code >= 400:
            try:
                body = resp.json()
            except ValueError:
                body = {}
            raise TicketTailorError(
                status_code=resp.status_code,
                error_code=body.get("error_code", "UNKNOWN"),
                message=body.get("message", resp.text),
            )
        return resp.json()

    # -- Read-only ---------------------------------------------------------

    def ping(self) -> dict[str, Any]:
        return self._request("GET", "/ping")

    def overview(self) -> dict[str, Any]:
        return self._request("GET", "/overview")

    def list_events(
        self, *, starting_after: Optional[str] = None, limit: int = 50
    ) -> dict[str, Any]:
        params = {"limit": limit}
        if starting_after:
            params["starting_after"] = starting_after
        return self._request("GET", "/events", params=params)

    def list_event_series(
        self, *, starting_after: Optional[str] = None, limit: int = 50
    ) -> dict[str, Any]:
        params = {"limit": limit}
        if starting_after:
            params["starting_after"] = starting_after
        return self._request("GET", "/event_series", params=params)

    def get_event_series(self, series_id: str) -> dict[str, Any]:
        return self._request("GET", f"/event_series/{series_id}")

    def list_orders(
        self, *, starting_after: Optional[str] = None, limit: int = 50
    ) -> dict[str, Any]:
        params = {"limit": limit}
        if starting_after:
            params["starting_after"] = starting_after
        return self._request("GET", "/orders", params=params)

    def get_order(self, order_id: str) -> dict[str, Any]:
        return self._request("GET", f"/orders/{order_id}")

    # -- Event / ticket-type management --------------------------------------

    def create_event_series(
        self, *, name: str, timezone: Optional[str] = None, **extra: Any
    ) -> dict[str, Any]:
        data = {"name": name, **extra}
        if timezone:
            data["timezone"] = timezone
        return self._request("POST", "/event_series", data=data)

    def delete_event_series(self, series_id: str) -> dict[str, Any]:
        return self._request("DELETE", f"/event_series/{series_id}")

    def create_ticket_type(
        self, series_id: str, *, name: str, price: int, quantity: int, **extra: Any
    ) -> dict[str, Any]:
        """price is in the smallest currency unit (cents), per Ticket Tailor convention."""
        data = {"name": name, "price": price, "quantity": quantity, **extra}
        return self._request(
            "POST", f"/event_series/{series_id}/ticket_types", data=data
        )

    def delete_ticket_type(self, series_id: str, ticket_type_id: str) -> dict[str, Any]:
        return self._request(
            "DELETE", f"/event_series/{series_id}/ticket_types/{ticket_type_id}"
        )

    # -- Discounts / holds ----------------------------------------------------

    def list_discounts(
        self, *, starting_after: Optional[str] = None, limit: int = 50
    ) -> dict[str, Any]:
        params = {"limit": limit}
        if starting_after:
            params["starting_after"] = starting_after
        return self._request("GET", "/discounts", params=params)

    def create_hold(self, *, event_id: str, ticket_type_id: str, quantity: int) -> dict[str, Any]:
        """event_id must be an `ev_...` occurrence id, not an `es_...` series id."""
        data = {
            "event_id": event_id,
            "ticket_type_id": ticket_type_id,
            "quantity": quantity,
        }
        return self._request("POST", "/holds", data=data)
