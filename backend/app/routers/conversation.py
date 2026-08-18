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
    calendar_event_id: str


@router.post("/stream")
async def chat_stream(
    body: ChatStreamRequest,
    request: Request,
    customer: dict = Depends(get_current_customer),
) -> StreamingResponse:
    event = get_owned_calendar_event(body.calendar_event_id, customer["id"])
    settings = get_settings()

    stream = EventStream(conversation_id=body.calendar_event_id)

    orchestrator_request = OrchestratorRequest(
        principal=customer,
        subject={"calendar_event": event},
        intent=Intent(),
        conversation_id=body.calendar_event_id,
        mode="converse",
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
