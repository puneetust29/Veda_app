"""POST /grocery/auto-checkout — SSE endpoint that runs the Pepesto automated
checkout loop in a background thread and streams status events back to the caller.

Flow:
  1. Mobile sends {supermarket_domain, skus: [{session_token, quantity}]}
  2. Backend calls Pepesto /session → session_id
  3. CheckoutExecutor drives a headless browser via Pepesto /checkout loop
  4. Status events stream back as SSE; final {success, message} closes the stream
"""
from __future__ import annotations

import asyncio
import json
import logging
import os

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from starlette.responses import StreamingResponse

from app.agents.grocery.checkout_executor import CheckoutExecutor
from app.agents.grocery.pepesto_client import PepetoClient
from app.config import get_settings
from app.deps import get_current_customer

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/grocery", tags=["grocery"])

HEARTBEAT_INTERVAL = 15.0  # seconds between SSE keep-alive pings


class SkuItem(BaseModel):
    session_token: str
    quantity: int = 1


class AutoCheckoutRequest(BaseModel):
    supermarket_domain: str
    skus: list[SkuItem]


class SaveSessionRequest(BaseModel):
    local_storage: dict = {}
    cookies: str = ""


@router.post("/asda/save-session")
async def save_asda_session(
    body: SaveSessionRequest,
    customer: dict = Depends(get_current_customer),
):
    """
    Save an Asda login session extracted from the in-app WebView.

    The mobile app opens Asda's login page in a WebView, detects successful login,
    then extracts localStorage (SLAS JWT tokens) and readable cookies via JS injection.
    This endpoint persists those as a Playwright storage_state JSON file so future
    automated checkouts start already authenticated.
    """
    settings = get_settings()

    # Resolve output path (mirrors CheckoutExecutor._auth_state_path logic)
    raw_path = settings.asda_auth_state_path or "asda_auth.json"
    if not os.path.isabs(raw_path):
        # Resolve relative to backend/ directory
        backend_dir = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
        raw_path = os.path.normpath(os.path.join(backend_dir, raw_path))

    # Build Playwright storage_state structure
    cookies = []
    if body.cookies:
        for part in body.cookies.split(";"):
            part = part.strip()
            if "=" in part:
                name, _, value = part.partition("=")
                cookies.append({
                    "name": name.strip(),
                    "value": value.strip(),
                    "domain": "www.asda.com",
                    "path": "/",
                    "expires": -1,
                    "httpOnly": False,
                    "secure": True,
                    "sameSite": "Lax",
                })

    local_storage_items = [
        {"name": k, "value": v}
        for k, v in (body.local_storage or {}).items()
        if isinstance(v, str)
    ]

    storage_state = {
        "cookies": cookies,
        "origins": [
            {
                "origin": "https://www.asda.com",
                "localStorage": local_storage_items,
            }
        ],
    }

    with open(raw_path, "w") as f:
        json.dump(storage_state, f, indent=2)

    logger.info(
        "[grocery/asda/save-session] saved %d cookies + %d localStorage items to %s",
        len(cookies), len(local_storage_items), raw_path,
    )
    return {"saved": True, "cookies": len(cookies), "localStorage": len(local_storage_items)}


@router.post("/auto-checkout")
async def auto_checkout(
    body: AutoCheckoutRequest,
    customer: dict = Depends(get_current_customer),
):
    """
    Stream an automated checkout using Pepesto's /checkout browser-loop API.

    Events are emitted as SSE:
      data: {"kind": "status", "text": "..."}   — progress update
      data: {"kind": "done",   "success": bool, "message": "..."}  — terminal
    """
    settings = get_settings()
    if not settings.pepesto_api_key:
        return {"error": "Pepesto API key not configured"}, 503

    event_queue: asyncio.Queue[dict | None] = asyncio.Queue()
    loop = asyncio.get_running_loop()

    def on_event(event: dict) -> None:
        loop.call_soon_threadsafe(event_queue.put_nowait, event)

    def _run_checkout() -> None:
        client = PepetoClient(api_key=settings.pepesto_api_key)

        # Step 1: create a Pepesto session from the SKUs
        skus = [{"session_token": s.session_token, "quantity": s.quantity} for s in body.skus]
        on_event({"kind": "status", "text": "Creating checkout session…"})
        try:
            session_resp = client.session(
                supermarket_domain=body.supermarket_domain,
                skus=skus,
                charge_user=False,
            )
            session_id = session_resp.get("session_id", "")
        except Exception as e:
            logger.error("[grocery/auto-checkout] /session failed: %r", e)
            loop.call_soon_threadsafe(event_queue.put_nowait, {"kind": "done", "success": False, "message": str(e)})
            loop.call_soon_threadsafe(event_queue.put_nowait, None)
            return

        if not session_id:
            loop.call_soon_threadsafe(event_queue.put_nowait, {
                "kind": "done", "success": False, "message": "Pepesto returned no session_id"
            })
            loop.call_soon_threadsafe(event_queue.put_nowait, None)
            return

        # Step 2: run the automated checkout loop
        executor = CheckoutExecutor(
            session_id=session_id,
            client=client,
            supermarket=body.supermarket_domain,
            on_event=on_event,
        )
        result = executor.run()
        loop.call_soon_threadsafe(event_queue.put_nowait, {"kind": "done", **result})
        loop.call_soon_threadsafe(event_queue.put_nowait, None)  # sentinel — close stream

    async def generate():
        task = asyncio.create_task(asyncio.to_thread(_run_checkout))
        try:
            while True:
                try:
                    event = await asyncio.wait_for(event_queue.get(), timeout=HEARTBEAT_INTERVAL)
                except asyncio.TimeoutError:
                    yield ": ping\n\n"
                    continue

                if event is None:
                    break
                yield f"data: {json.dumps(event)}\n\n"
        finally:
            task.cancel()

    return StreamingResponse(generate(), media_type="text/event-stream")
