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
import time

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


class CheckoutSessionRequest(BaseModel):
    supermarket_domain: str
    skus: list[SkuItem]


class CheckoutStepRequest(BaseModel):
    session_id: str
    screenshot_b64: str = ""
    prev_result: str = ""
    prev_error: str = ""


class SaveSessionRequest(BaseModel):
    local_storage: dict = {}
    cookies: str = ""


@router.post("/checkout-session")
async def create_checkout_session(
    body: CheckoutSessionRequest,
    customer: dict = Depends(get_current_customer),
):
    """Create a Pepesto checkout session via /mcheckout, then call /checkout
    to get the first instruction (usually LoadPage with the supermarket URL)."""
    t0 = time.perf_counter()
    customer_id = customer.get("id", "?")
    logger.info(
        "[grocery/checkout-session] ▶ START | customer=%s | supermarket=%s | skus=%d",
        customer_id, body.supermarket_domain, len(body.skus),
    )

    settings = get_settings()
    if not settings.pepesto_api_key:
        logger.error("[grocery/checkout-session] ❌ no Pepesto API key")
        return {"error": "Pepesto API key not configured"}

    client = PepetoClient(api_key=settings.pepesto_api_key)
    skus = [{"session_token": s.session_token, "quantity": s.quantity} for s in body.skus]

    mcheckout_result = client.mcheckout(
        supermarket_domain=body.supermarket_domain,
        skus=skus,
        return_url="veda://grocery-done",
    )

    session_id = mcheckout_result.get("session_id", "")
    if not session_id:
        mobile_url = mcheckout_result.get("mobile_hosted_url", "")
        if mobile_url:
            from urllib.parse import parse_qs, urlparse
            session_id = parse_qs(urlparse(mobile_url).query).get("sid", [""])[0]

    if not session_id:
        logger.error("[grocery/checkout-session] ❌ no session_id from mcheckout | response_keys=%s", list(mcheckout_result.keys()))
        return {"error": "Failed to create checkout session — no session_id"}

    logger.info("[grocery/checkout-session] mcheckout session_id=%s | calling /checkout for first instruction…", session_id)
    checkout_result = client.checkout(session_id=session_id)
    proto = checkout_result.get("proto", checkout_result)
    instruction = proto.get("Instruction", {})

    first_url = ""
    if "LoadPage" in instruction:
        first_url = instruction["LoadPage"].get("url", "")

    elapsed_ms = int((time.perf_counter() - t0) * 1000)
    instr_type = list(instruction.keys())[0] if instruction else "none"
    logger.info(
        "[grocery/checkout-session] ✅ done | session_id=%s | first_url=%s | instruction=%s | elapsed=%dms",
        session_id, first_url, instr_type, elapsed_ms,
    )
    return {"session_id": session_id, "first_url": first_url, "instruction": instruction}


@router.post("/checkout-step")
async def checkout_step(
    body: CheckoutStepRequest,
    customer: dict = Depends(get_current_customer),
):
    """One iteration of the mobile WebView checkout loop. Forwards the previous
    instruction's result (and optional screenshot) to Pepesto /checkout, returns
    the next instruction for the mobile client to execute."""
    t0 = time.perf_counter()
    customer_id = customer.get("id", "?")
    logger.info(
        "[grocery/checkout-step] ▶ START | customer=%s | session_id=%s | has_screenshot=%s | prev_result_len=%d | prev_error=%r | prev_result=%r",
        customer_id, body.session_id, bool(body.screenshot_b64),
        len(body.prev_result), body.prev_error[:80] if body.prev_error else "",
        body.prev_result[:600],
    )

    settings = get_settings()
    if not settings.pepesto_api_key:
        logger.error("[grocery/checkout-step] ❌ no Pepesto API key")
        return {"error": "Pepesto API key not configured"}

    client = PepetoClient(api_key=settings.pepesto_api_key)
    result = client.checkout(
        session_id=body.session_id,
        prev_result=body.prev_result,
        prev_error=body.prev_error,
        screenshot_b64=body.screenshot_b64,
    )

    proto = result.get("proto", result)
    instruction = proto.get("Instruction", {})
    elapsed_ms = int((time.perf_counter() - t0) * 1000)

    non_instruction_keys = {k: v for k, v in proto.items() if k != "Instruction"}
    logger.info(
        "[grocery/checkout-step] pepesto proto (minus Instruction) | elapsed=%dms | keys=%s",
        elapsed_ms, json.dumps(non_instruction_keys, default=str)[:2000],
    )

    status = proto.get("status", "")
    if status in ("done", "complete", "success", "order_placed"):
        logger.info("[grocery/checkout-step] ✅ done via status field | status=%s | elapsed=%dms", status, elapsed_ms)
        return {"done": True, "success": True, "message": "Order placed"}

    for done_key in ("Done", "Complete", "Success", "OrderPlaced", "Finished"):
        if done_key in instruction:
            logger.info("[grocery/checkout-step] ✅ done via instruction key=%s | elapsed=%dms", done_key, elapsed_ms)
            return {"done": True, "success": True, "message": "Order placed"}

    for err_key in ("Error", "Failure", "Failed"):
        if err_key in instruction:
            msg = instruction[err_key]
            if not isinstance(msg, str):
                msg = str(msg)
            logger.error("[grocery/checkout-step] ❌ terminal error | key=%s | msg=%r | elapsed=%dms", err_key, msg, elapsed_ms)
            return {"done": True, "success": False, "message": msg}

    instr_type = list(instruction.keys())[0] if instruction else "none"
    # Log full instruction detail for debugging. Strip the (huge, obfuscated) `js`
    # source from the log but keep every other field verbatim so we can see
    # current_content / check_interval_msec / spec metadata etc.
    def _redact_js(obj):
        if isinstance(obj, dict):
            return {
                k: (f"<js {len(v)} chars>" if k == "js" and isinstance(v, str) else _redact_js(v))
                for k, v in obj.items()
            }
        if isinstance(obj, list):
            return [_redact_js(v) for v in obj]
        return obj

    instr_for_log = _redact_js(instruction)
    logger.info(
        "[grocery/checkout-step] → next instruction | type=%s | elapsed=%dms | full=%s",
        instr_type, elapsed_ms, json.dumps(instr_for_log, default=str),
    )
    return {"done": False, "instruction": instruction}


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
    t0 = time.perf_counter()
    customer_id = customer.get("id", "?")
    ls_keys = list((body.local_storage or {}).keys())
    raw_cookie_count = len([p for p in body.cookies.split(";") if "=" in p.strip()]) if body.cookies else 0
    has_slas = any("slas" in k.lower() for k in ls_keys)
    logger.info(
        "[grocery/asda/save-session] ▶ START | customer=%s | localStorage_keys=%d | cookie_parts=%d | has_slas=%s | ls_key_names=%s",
        customer_id, len(ls_keys), raw_cookie_count, has_slas, ", ".join(ls_keys[:10]),
    )

    settings = get_settings()

    # Resolve output path (mirrors CheckoutExecutor._auth_state_path logic)
    raw_path = settings.asda_auth_state_path or "asda_auth.json"
    if not os.path.isabs(raw_path):
        # Resolve relative to backend/ directory
        backend_dir = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
        raw_path = os.path.normpath(os.path.join(backend_dir, raw_path))

    logger.info("[grocery/asda/save-session] writing to path=%s", raw_path)

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

    elapsed_ms = int((time.perf_counter() - t0) * 1000)
    logger.info(
        "[grocery/asda/save-session] ✅ saved | cookies=%d | localStorage=%d | path=%s | elapsed=%dms",
        len(cookies), len(local_storage_items), raw_path, elapsed_ms,
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
    stream_t0 = time.perf_counter()
    customer_id = customer.get("id", "?")
    settings = get_settings()
    logger.info(
        "[grocery/auto-checkout] ▶ START | customer=%s | supermarket=%s | skus=%d",
        customer_id, body.supermarket_domain, len(body.skus),
    )

    if not settings.pepesto_api_key:
        logger.error("[grocery/auto-checkout] ❌ no Pepesto API key")
        return {"error": "Pepesto API key not configured"}, 503

    event_queue: asyncio.Queue[dict | None] = asyncio.Queue()
    loop = asyncio.get_running_loop()
    event_counter = [0]

    def on_event(event: dict) -> None:
        event_counter[0] += 1
        logger.info(
            "[grocery/auto-checkout] → emit #%d | kind=%s | text=%r",
            event_counter[0], event.get("kind"), str(event.get("text", event.get("message", "")))[:80],
        )
        loop.call_soon_threadsafe(event_queue.put_nowait, event)

    def _run_checkout() -> None:
        run_t0 = time.time()
        logger.info(
            "[grocery/auto-checkout] thread started | customer=%s | supermarket=%s | skus=%d",
            customer_id, body.supermarket_domain, len(body.skus),
        )
        client = PepetoClient(api_key=settings.pepesto_api_key)

        # Step 1: create a Pepesto session from the SKUs
        skus = [{"session_token": s.session_token, "quantity": s.quantity} for s in body.skus]
        on_event({"kind": "status", "text": "Creating checkout session…"})
        logger.info("[grocery/auto-checkout] calling /session | supermarket=%s | skus=%d", body.supermarket_domain, len(skus))
        try:
            session_resp = client.session(
                supermarket_domain=body.supermarket_domain,
                skus=skus,
                charge_user=False,
            )
            session_id = session_resp.get("session_id", "")
        except Exception as e:
            logger.error("[grocery/auto-checkout] ❌ /session failed | error=%r | elapsed=%.1fs", e, time.time() - run_t0)
            loop.call_soon_threadsafe(event_queue.put_nowait, {"kind": "done", "success": False, "message": str(e)})
            loop.call_soon_threadsafe(event_queue.put_nowait, None)
            return

        if not session_id:
            logger.error("[grocery/auto-checkout] ❌ no session_id in /session response | keys=%s", list(session_resp.keys()))
            loop.call_soon_threadsafe(event_queue.put_nowait, {
                "kind": "done", "success": False, "message": "Pepesto returned no session_id"
            })
            loop.call_soon_threadsafe(event_queue.put_nowait, None)
            return

        logger.info("[grocery/auto-checkout] session created | session_id=%s | starting executor", session_id)

        # Step 2: run the automated checkout loop
        executor = CheckoutExecutor(
            session_id=session_id,
            client=client,
            supermarket=body.supermarket_domain,
            on_event=on_event,
        )
        result = executor.run()
        total_s = time.time() - run_t0
        logger.info(
            "[grocery/auto-checkout] executor done | success=%s | message=%r | events_emitted=%d | total=%.1fs",
            result.get("success"), result.get("message"), event_counter[0], total_s,
        )
        loop.call_soon_threadsafe(event_queue.put_nowait, {"kind": "done", **result})
        loop.call_soon_threadsafe(event_queue.put_nowait, None)  # sentinel — close stream

    async def generate():
        task = asyncio.create_task(asyncio.to_thread(_run_checkout))
        sse_count = 0
        try:
            while True:
                try:
                    event = await asyncio.wait_for(event_queue.get(), timeout=HEARTBEAT_INTERVAL)
                except asyncio.TimeoutError:
                    logger.info("[grocery/auto-checkout] SSE heartbeat ping | elapsed=%.1fs", time.perf_counter() - stream_t0)
                    yield ": ping\n\n"
                    continue

                if event is None:
                    elapsed_ms = int((time.perf_counter() - stream_t0) * 1000)
                    logger.info(
                        "[grocery/auto-checkout] ✅ stream closed | sse_events=%d | elapsed=%dms",
                        sse_count, elapsed_ms,
                    )
                    break
                sse_count += 1
                yield f"data: {json.dumps(event)}\n\n"
        finally:
            task.cancel()

    return StreamingResponse(generate(), media_type="text/event-stream")
