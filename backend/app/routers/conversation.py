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

router = APIRouter(prefix="/chat", tags=["chat"])


class ChatStreamRequest(BaseModel):
    calendar_event_id: Optional[str] = None
    message: Optional[str] = None
    prior_plan: Optional[dict] = None
    prior_reasoning: Optional[str] = None
    prior_judge_feedback: Optional[str] = None
    capability: Optional[str] = None
    history: Optional[list[dict]] = None


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

    # Generate conversation_id: use calendar_event_id if available, else a uuid
    if body.calendar_event_id:
        conversation_id = body.calendar_event_id
    else:
        import uuid
        conversation_id = str(uuid.uuid4())

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
            await asyncio.to_thread(orchestrator.run, orchestrator_request, stream.emit)
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
