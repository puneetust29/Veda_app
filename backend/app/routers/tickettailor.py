"""Ticket Tailor event browsing and box-office management.

Read/manage only — there is no ticket-purchase endpoint here because Ticket
Tailor's API doesn't have one. Checkout happens on Ticket Tailor's own hosted
page (see the `url` field on an event series); this router surfaces data for
that, and reads back orders placed there.
"""
from __future__ import annotations

from pydantic import BaseModel, Field

from fastapi import APIRouter, HTTPException, status

from app.config import get_settings
from app.integrations.tickettailor import TicketTailorClient, TicketTailorError

router = APIRouter(prefix="/tickettailor", tags=["tickettailor"])


class CreateEventSeriesRequest(BaseModel):
    name: str


class CreateTicketTypeRequest(BaseModel):
    name: str
    price: int = Field(..., description="Price in the smallest currency unit (cents)")
    quantity: int


def _client() -> TicketTailorClient:
    if not get_settings().tickettailor_configured:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Ticket Tailor not configured (TICKETTAILOR_API_KEY)",
        )
    return TicketTailorClient()


def _handle(fn):
    try:
        return fn()
    except TicketTailorError as e:
        raise HTTPException(status_code=e.status_code, detail=e.message) from e


@router.get("/ping")
def ping():
    with _client() as c:
        return _handle(c.ping)


@router.get("/overview")
def overview():
    with _client() as c:
        return _handle(c.overview)


@router.get("/events")
def list_events(starting_after: str | None = None, limit: int = 50):
    with _client() as c:
        return _handle(lambda: c.list_events(starting_after=starting_after, limit=limit))


@router.get("/event_series")
def list_event_series(starting_after: str | None = None, limit: int = 50):
    with _client() as c:
        return _handle(
            lambda: c.list_event_series(starting_after=starting_after, limit=limit)
        )


@router.get("/event_series/{series_id}")
def get_event_series(series_id: str):
    with _client() as c:
        return _handle(lambda: c.get_event_series(series_id))


@router.get("/orders")
def list_orders(starting_after: str | None = None, limit: int = 50):
    with _client() as c:
        return _handle(lambda: c.list_orders(starting_after=starting_after, limit=limit))


@router.get("/orders/{order_id}")
def get_order(order_id: str):
    with _client() as c:
        return _handle(lambda: c.get_order(order_id))


@router.get("/discounts")
def list_discounts(starting_after: str | None = None, limit: int = 50):
    with _client() as c:
        return _handle(
            lambda: c.list_discounts(starting_after=starting_after, limit=limit)
        )


# -- Management writes ------------------------------------------------------
# Creates/deletes real event series & ticket types in the connected box office.
# Still no purchase/checkout endpoint — Ticket Tailor's API doesn't have one.

@router.post("/event_series")
def create_event_series(body: CreateEventSeriesRequest):
    with _client() as c:
        return _handle(lambda: c.create_event_series(name=body.name))


@router.delete("/event_series/{series_id}")
def delete_event_series(series_id: str):
    with _client() as c:
        return _handle(lambda: c.delete_event_series(series_id))


@router.post("/event_series/{series_id}/ticket_types")
def create_ticket_type(series_id: str, body: CreateTicketTypeRequest):
    with _client() as c:
        return _handle(
            lambda: c.create_ticket_type(
                series_id, name=body.name, price=body.price, quantity=body.quantity
            )
        )


@router.delete("/event_series/{series_id}/ticket_types/{ticket_type_id}")
def delete_ticket_type(series_id: str, ticket_type_id: str):
    with _client() as c:
        return _handle(lambda: c.delete_ticket_type(series_id, ticket_type_id))
