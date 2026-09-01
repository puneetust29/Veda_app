"""Deliveroo webhook receivers.

Deliveroo signs every webhook payload with HMAC-SHA256:
  - Header x-deliveroo-sequence-guid  — unique delivery attempt ID (for deduplication)
  - Header x-deliveroo-hmac-sha256    — base64(HMAC-SHA256(secret, raw_body))

All endpoints verify the signature before processing. A 200 OK must be
returned quickly (Deliveroo retries on non-2xx, with back-off up to 30 min).
"""
from __future__ import annotations

import hashlib
import hmac
import logging

from fastapi import APIRouter, Header, HTTPException, Request, status

from app.config import get_settings

log = logging.getLogger("app.deliveroo.webhooks")

router = APIRouter(prefix="/deliveroo/webhooks", tags=["deliveroo-webhooks"])


def _verify_signature(raw_body: bytes, signature_header: str | None) -> None:
    """Raise 401 if the HMAC-SHA256 signature does not match."""
    settings = get_settings()
    secret = settings.deliveroo_webhook_secret
    if not secret:
        log.warning("DELIVEROO_WEBHOOK_SECRET not set — skipping signature verification")
        return

    if not signature_header:
        log.error("[sig] Missing x-deliveroo-hmac-sha256 header — rejecting request")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing x-deliveroo-hmac-sha256 header",
        )

    expected = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()

    log.info(
        "[sig] body_len=%d header_prefix=%s expected_prefix=%s match=%s",
        len(raw_body),
        signature_header[:8] if signature_header else "NONE",
        expected[:8],
        signature_header == expected,
    )

    if not hmac.compare_digest(expected, signature_header):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Deliveroo webhook signature mismatch",
        )


@router.post("/orders")
async def orders_webhook(
    request: Request,
    x_deliveroo_sequence_guid: str | None = Header(default=None),
    x_deliveroo_hmac_sha256: str | None = Header(default=None),
):
    """Receives Order Events from both Partner Platform and Retail Platform.

    Events: order_placed, order_accepted, order_rejected, order_confirmed,
            order_cancelled, order_fulfillment_state_changed.
    """
    raw_body = await request.body()
    _verify_signature(raw_body, x_deliveroo_hmac_sha256)

    payload = await request.json() if raw_body else {}
    event_type = payload.get("type", "unknown")
    order_id = payload.get("order", {}).get("id") or payload.get("id", "unknown")

    log.info(
        "[orders] guid=%s type=%s order_id=%s",
        x_deliveroo_sequence_guid,
        event_type,
        order_id,
    )

    return {"received": True}


@router.post("/menu")
async def menu_webhook(
    request: Request,
    x_deliveroo_sequence_guid: str | None = Header(default=None),
    x_deliveroo_hmac_sha256: str | None = Header(default=None),
):
    """Receives Menu Events — menu upload completed or failed."""
    raw_body = await request.body()
    _verify_signature(raw_body, x_deliveroo_hmac_sha256)

    payload = await request.json() if raw_body else {}
    event_type = payload.get("type", "unknown")

    log.info(
        "[menu] guid=%s type=%s",
        x_deliveroo_sequence_guid,
        event_type,
    )

    return {"received": True}


@router.post("/rider-status")
async def rider_status_webhook(
    request: Request,
    x_deliveroo_sequence_guid: str | None = Header(default=None),
    x_deliveroo_hmac_sha256: str | None = Header(default=None),
):
    """Receives Rider Status Events — rider assigned, picked up, delivered."""
    raw_body = await request.body()
    _verify_signature(raw_body, x_deliveroo_hmac_sha256)

    payload = await request.json() if raw_body else {}
    event_type = payload.get("type", "unknown")
    order_id = payload.get("order_id", "unknown")

    log.info(
        "[rider-status] guid=%s type=%s order_id=%s",
        x_deliveroo_sequence_guid,
        event_type,
        order_id,
    )

    return {"received": True}


@router.post("/picking")
async def picking_webhook(
    request: Request,
    x_deliveroo_sequence_guid: str | None = Header(default=None),
    x_deliveroo_hmac_sha256: str | None = Header(default=None),
):
    """Receives Picking Order Events — Retail Platform suite only.

    Events: order placed for picking, JIT order placed, order cancelled.
    """
    raw_body = await request.body()
    _verify_signature(raw_body, x_deliveroo_hmac_sha256)

    payload = await request.json() if raw_body else {}
    event_type = payload.get("type", "unknown")
    order_id = payload.get("order", {}).get("id") or payload.get("id", "unknown")

    log.info(
        "[picking] guid=%s type=%s order_id=%s",
        x_deliveroo_sequence_guid,
        event_type,
        order_id,
    )

    return {"received": True}


@router.post("/catalogue")
async def catalogue_webhook(
    request: Request,
    x_deliveroo_sequence_guid: str | None = Header(default=None),
    x_deliveroo_hmac_sha256: str | None = Header(default=None),
):
    """Receives Catalogue Events — Retail Platform suite only.

    Events: catalogue upload completed, catalogue update applied.
    """
    raw_body = await request.body()
    _verify_signature(raw_body, x_deliveroo_hmac_sha256)

    payload = await request.json() if raw_body else {}
    event_type = payload.get("type", "unknown")

    log.info(
        "[catalogue] guid=%s type=%s",
        x_deliveroo_sequence_guid,
        event_type,
    )

    return {"received": True}
