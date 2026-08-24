"""POST /chat/stream -- the SSE conversation endpoint fronting the orchestrator.

This route (like app/orchestration/ and app/policy/) must never import a concrete
agent module -- see tests/test_no_agent_imports.py. It only knows about the generic
Orchestrator/AgentRegistry; which agent(s) run is entirely up to `registry.match()`.

Bridges FastAPI's async world into the orchestrator's (mostly) synchronous code by
running orchestrator.run() inside asyncio.to_thread; events flow back through an
EventStream (a thread-safe asyncio.Queue) that this route's generator reads from.
"""
from __future__ import annotations

import asyncio
import json
import logging
from typing import Optional

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel
from starlette.responses import StreamingResponse

from app.config import get_settings
from app.deps import get_current_customer
from app.orchestration.intents import Intent, OrchestratorRequest
from app.orchestration.orchestrator import get_orchestrator
from app.orchestration.streaming import HEARTBEAT, EventStream, sse_format
from app.routers._shared import get_owned_calendar_event
from app.tools import uber_chat_login, uber_ride_options, uber_session as _uber_session

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/chat", tags=["chat"])


class ChatStreamRequest(BaseModel):
    calendar_event_id: str
    message: Optional[str] = None
    prior_plan: Optional[dict] = None
    prior_reasoning: Optional[str] = None
    prior_judge_feedback: Optional[str] = None
    pickup_latitude: Optional[float] = None
    pickup_longitude: Optional[float] = None
    pickup_label: Optional[str] = None
    start_uber_login: bool = False


def _uber_chat_login_stream(events: list[dict]) -> StreamingResponse:
    """A minimal SSE response for chat-driven Uber login turns — these bypass
    the orchestrator entirely (a typed phone number/OTP isn't an intent for
    the LLM router to interpret), so there's no EventStream/agent run here."""

    async def _generate():
        for seq, evt in enumerate(events, start=1):
            payload = {"type": evt["type"], "data": evt.get("data", {}), "seq": seq}
            yield f"event: {evt['type']}\ndata: {json.dumps(payload)}\n\n"

    return StreamingResponse(
        _generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no"},
    )


def _uber_chat_login_events(result: dict) -> list[dict]:
    if result["status"] == "error":
        return [
            {"type": "error", "data": {"message": result["message"], "retryable": True}},
            {"type": "done", "data": {}},
        ]
    return [
        {"type": "text", "data": {"role": "agent", "text": result["message"]}},
        {"type": "done", "data": {}},
    ]


@router.post("/stream")
async def chat_stream(
    body: ChatStreamRequest,
    request: Request,
    customer: dict = Depends(get_current_customer),
) -> StreamingResponse:
    logger.info(
        "chat stream request | customer_id=%s | calendar_event_id=%s | has_message=%s | has_pickup_coords=%s | pickup_label=%r",
        customer.get("id"),
        body.calendar_event_id,
        bool((body.message or "").strip()),
        body.pickup_latitude is not None and body.pickup_longitude is not None,
        body.pickup_label,
    )
    customer_id = customer["id"]

    def _handle_uber_login_result(result: dict) -> StreamingResponse:
        events = _uber_chat_login_events(result)
        if result["status"] == "done":
            tokens = result["tokens"]
            _uber_session.upsert_session(
                customer_id=tokens["customer_id"],
                user_sub=tokens["user_sub"],
                access_token=tokens["access_token"],
                refresh_token=tokens["refresh_token"],
                client_id=tokens["client_id"],
                expires_in=tokens["expires_in"],
            )
            # Refresh the ride card with real prices now that the token exists —
            # the one already on screen (if any) was built before the account was connected.
            try:
                owned_event = get_owned_calendar_event(body.calendar_event_id, customer_id)
                device_location = (
                    {"latitude": body.pickup_latitude, "longitude": body.pickup_longitude, "label": body.pickup_label}
                    if body.pickup_latitude is not None and body.pickup_longitude is not None
                    else None
                )
                options = uber_ride_options.fetch(customer, owned_event, device_location)
                card = {
                    "kind": "uber_ride",
                    "origin_type": options.get("origin_type", "airport"),
                    "reasoning": options.get("reasoning", ""),
                    "suggested_message": options.get("suggested_message") or "Here's your ride, now that you're connected:",
                    "pickup_label": options.get("pickup_label"),
                    "dropoff_label": options.get("dropoff_label"),
                    "uber_app_url": options.get("uber_app_url"),
                    "deep_link_url": options.get("deep_link_url"),
                    "airport_options": options.get("airport_options", []),
                    "alternative_options": options.get("alternative_options", []),
                    "live_quote": options.get("live_quote"),
                    "ride_products": options.get("ride_products", []),
                    "connect_uber_url": options.get("connect_uber_url"),
                }
                events.insert(-1, {"type": "recommendation_ready", "data": {"card": card}})
            except Exception:
                logger.exception(
                    "chat uber login: failed to refresh ride card | customer_id=%s | calendar_event_id=%s",
                    customer_id,
                    body.calendar_event_id,
                )
        return _uber_chat_login_stream(events)

    if body.start_uber_login:
        return _handle_uber_login_result(uber_chat_login.start(customer_id))

    if uber_chat_login.is_active(customer_id) and (body.message or "").strip():
        return _handle_uber_login_result(uber_chat_login.submit_answer(customer_id, body.message))

    event = get_owned_calendar_event(body.calendar_event_id, customer["id"])
    settings = get_settings()

    stream = EventStream(conversation_id=body.calendar_event_id)

    subject = {
        "calendar_event": event,
        "prior_plan": body.prior_plan,
        "prior_reasoning": body.prior_reasoning,
        "prior_judge_feedback": body.prior_judge_feedback,
        "device_location": (
            {
                "latitude": body.pickup_latitude,
                "longitude": body.pickup_longitude,
                "label": body.pickup_label,
            }
            if body.pickup_latitude is not None and body.pickup_longitude is not None
            else None
        ),
    }

    logger.info(
        "chat stream subject prepared | customer_id=%s | calendar_event_type=%s | device_location_present=%s",
        customer.get("id"),
        event.get("event_type"),
        subject.get("device_location") is not None,
    )

    orchestrator_request = OrchestratorRequest(
        principal=customer,
        subject=subject,
        intent=Intent(),
        conversation_id=body.calendar_event_id,
        mode="converse",
        user_message=body.message,
    )

    orchestrator = get_orchestrator()

    async def _drive() -> None:
        try:
            logger.info(
                "chat stream orchestration start | customer_id=%s | conversation_id=%s",
                customer.get("id"),
                body.calendar_event_id,
            )
            result = await asyncio.to_thread(orchestrator.run, orchestrator_request, stream.emit)
            logger.info(
                "chat stream orchestration complete | customer_id=%s | conversation_id=%s | agent_count=%d",
                customer.get("id"),
                body.calendar_event_id,
                len(result.results),
            )
        except Exception:
            logger.exception(
                "chat stream orchestration failed | customer_id=%s | conversation_id=%s",
                customer.get("id"),
                body.calendar_event_id,
            )
            raise
        finally:
            stream.close()

    task = asyncio.create_task(_drive())

    async def _event_generator():
        try:
            while True:
                if await request.is_disconnected():
                    logger.info(
                        "chat stream client disconnected | customer_id=%s | conversation_id=%s",
                        customer.get("id"),
                        body.calendar_event_id,
                    )
                    break
                try:
                    event_obj = await asyncio.wait_for(
                        stream.get(), timeout=settings.stream_heartbeat_seconds
                    )
                except asyncio.TimeoutError:
                    logger.debug(
                        "chat stream heartbeat | customer_id=%s | conversation_id=%s",
                        customer.get("id"),
                        body.calendar_event_id,
                    )
                    yield HEARTBEAT
                    continue
                if event_obj is None:
                    logger.info(
                        "chat stream completed | customer_id=%s | conversation_id=%s",
                        customer.get("id"),
                        body.calendar_event_id,
                    )
                    break
                logger.debug(
                    "chat stream event | customer_id=%s | conversation_id=%s | type=%s | seq=%s",
                    customer.get("id"),
                    body.calendar_event_id,
                    event_obj.type,
                    event_obj.seq,
                )
                yield sse_format(event_obj)
        finally:
            if not task.done():
                task.cancel()
                logger.info(
                    "chat stream task cancelled | customer_id=%s | conversation_id=%s",
                    customer.get("id"),
                    body.calendar_event_id,
                )

    return StreamingResponse(
        _event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
