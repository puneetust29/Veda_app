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

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/chat", tags=["chat"])


def _build_trip_message(event: dict, customer: dict) -> str:
    """Draft a WhatsApp message with trip details for emergency contact."""
    from datetime import datetime

    destination = event.get("destination", "Unknown")
    start = event.get("start_datetime", "Unknown")
    end = event.get("end_datetime", "Unknown")

    customer_name = customer.get("full_name", "Friend")
    emergency_contact_name = customer.get("emergency_contact_name", "")

    # Parse and format dates
    start_formatted = start
    end_formatted = end
    is_round_trip = False

    if isinstance(start, str) and start.startswith("20"):
        try:
            start_dt = datetime.fromisoformat(start.replace("Z", "+00:00"))
            end_dt = datetime.fromisoformat(end.replace("Z", "+00:00"))
            start_formatted = start_dt.strftime("%b %d")
            end_formatted = end_dt.strftime("%b %d")
            # Check if it's a round-trip (different dates)
            is_round_trip = start_dt.date() != end_dt.date()
        except:
            pass

    # Build message based on trip type
    if is_round_trip:
        msg = f"Hi {emergency_contact_name},\n\n{customer_name} is travelling to {destination} from {start_formatted} to {end_formatted}."
    else:
        msg = f"Hi {emergency_contact_name},\n\n{customer_name} is travelling to {destination} on {start_formatted}."

    return msg


class DeviceLocation(BaseModel):
    latitude: float
    longitude: float
    label: Optional[str] = None


class ChatStreamRequest(BaseModel):
    calendar_event_id: Optional[str] = None
    message: Optional[str] = None
    prior_plan: Optional[dict] = None
    prior_reasoning: Optional[str] = None
    prior_judge_feedback: Optional[str] = None
    capability: Optional[str] = None
    history: Optional[list[dict]] = None
    device_location: Optional[DeviceLocation] = None


@router.post("/stream")
async def chat_stream(
    body: ChatStreamRequest,
    request: Request,
    customer: dict = Depends(get_current_customer),
) -> StreamingResponse:
    settings = get_settings()

    # Build subject conditionally: only include calendar_event if provided
    subject = {}
    if body.calendar_event_id:
        event = get_owned_calendar_event(body.calendar_event_id, customer["id"])
        subject["calendar_event"] = event
    if body.prior_plan is not None:
        subject["prior_plan"] = body.prior_plan
    if body.prior_reasoning is not None:
        subject["prior_reasoning"] = body.prior_reasoning
    if body.prior_judge_feedback is not None:
        subject["prior_judge_feedback"] = body.prior_judge_feedback
    if body.history is not None:
        subject["history"] = body.history
    if body.device_location is not None:
        subject["device_location"] = body.device_location.model_dump()

    # Generate conversation_id: use calendar_event_id if available, else a uuid
    if body.calendar_event_id:
        conversation_id = body.calendar_event_id
    else:
        import uuid
        conversation_id = str(uuid.uuid4())

    logger.info("[chat/stream] customer=%s event_id=%s capability=%s message=%r",
                customer.get("id"), body.calendar_event_id, body.capability, body.message)

    stream = EventStream(conversation_id=conversation_id)

    orchestrator_request = OrchestratorRequest(
        principal=customer,
        subject=subject,
        intent=Intent(capability=body.capability),
        conversation_id=conversation_id,
        mode="converse",
        user_message=body.message,
    )

    orchestrator = get_orchestrator()

    async def _drive() -> None:
        try:
            logger.info("[chat/stream] orchestrator starting run_id=%s", conversation_id)
            result = await asyncio.to_thread(orchestrator.run, orchestrator_request, stream.emit)
            logger.info("[chat/stream] orchestrator finished run_id=%s", conversation_id)

            # Emit WhatsApp share prompt after workflow completes
            if body.calendar_event_id and customer:
                try:
                    from app.deps import get_supabase
                    db = get_supabase()
                    customer_data = db.table("customers").select("emergency_contact_name, emergency_contact_phone").eq("id", customer["id"]).execute().data
                    if customer_data and customer_data[0].get("emergency_contact_phone"):
                        event = subject.get("calendar_event", {})
                        trip_msg = _build_trip_message(event, customer_data[0])
                        stream.emit({
                            "type": "item",
                            "data": {
                                "kind": "whatsapp_share",
                                "text": trip_msg,
                                "contactName": customer_data[0].get("emergency_contact_name", "Emergency Contact"),
                                "contactPhone": customer_data[0].get("emergency_contact_phone"),
                            }
                        })
                except Exception as e:
                    logger.warning("[chat/stream] failed to emit whatsapp_share: %s", e)
        except Exception as exc:
            logger.exception("[chat/stream] orchestrator crashed run_id=%s: %s", conversation_id, exc)
        finally:
            stream.close()

    task = asyncio.create_task(_drive())

    async def _event_generator():
        try:
            while True:
                if await request.is_disconnected():
                    break
                try:
                    event_obj = await asyncio.wait_for(
                        stream.get(), timeout=settings.stream_heartbeat_seconds
                    )
                except asyncio.TimeoutError:
                    yield HEARTBEAT
                    continue
                if event_obj is None:
                    break
                yield sse_format(event_obj)
        finally:
            if not task.done():
                task.cancel()

    return StreamingResponse(
        _event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
