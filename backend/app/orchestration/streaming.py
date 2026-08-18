"""SSE streaming primitives: AgentEvent (the wire shape), EventStream (a thread-safe
asyncio.Queue wrapper an agent's worker thread can push into), and sse_format().

Final reconciled event type set: run_started, status, tool_started, tool_completed,
recommendation_ready, confirmation_required, error, done.
"""
from __future__ import annotations

import asyncio
import json
from itertools import count
from typing import Optional

from pydantic import BaseModel, Field

HEARTBEAT = ": ping\n\n"


class AgentEvent(BaseModel):
    type: str
    data: dict = Field(default_factory=dict)
    conversation_id: Optional[str] = None
    run_id: Optional[str] = None
    seq: int = 0


class EventStream:
    """Wraps an asyncio.Queue. `emit()` is thread-safe (via
    `loop.call_soon_threadsafe`) so it can be called from the worker thread that runs
    the synchronous graph, not just from the event loop that created this stream."""

    def __init__(self, *, run_id: Optional[str] = None, conversation_id: Optional[str] = None) -> None:
        self._loop = asyncio.get_running_loop()
        self._queue: "asyncio.Queue[Optional[AgentEvent]]" = asyncio.Queue()
        self._seq = count(1)
        self.run_id = run_id
        self.conversation_id = conversation_id

    def emit(self, event: dict) -> None:
        agent_event = AgentEvent(
            type=event.get("type", "status"),
            data=event.get("data", {}),
            conversation_id=event.get("conversation_id", self.conversation_id),
            run_id=event.get("run_id", self.run_id),
            seq=next(self._seq),
        )
        self._loop.call_soon_threadsafe(self._queue.put_nowait, agent_event)

    def close(self) -> None:
        """Signal the reader loop that no more events are coming."""
        self._loop.call_soon_threadsafe(self._queue.put_nowait, None)

    async def get(self) -> Optional[AgentEvent]:
        """Waits for the next event. Returns None once the stream has been closed.
        Callers that need a heartbeat while waiting should wrap this in
        `asyncio.wait_for(stream.get(), timeout=...)` and catch `asyncio.TimeoutError`."""
        return await self._queue.get()


def sse_format(event: AgentEvent) -> str:
    payload = event.model_dump(exclude_none=True)
    return f"event: {event.type}\ndata: {json.dumps(payload)}\n\n"
