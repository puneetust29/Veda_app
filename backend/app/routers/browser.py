"""POST /browser/task — SSE endpoint for the browser agent.

Launches a headless Chrome, runs Claude's Browser Use SDK loop,
and streams status events back to the mobile chat.

Sessions persist between requests: if Claude asks the user for input
(like an OTP code), the browser stays open. The next request from the
same customer continues the conversation in the same browser.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import threading
import time
from dataclasses import dataclass, field
from typing import Any, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from starlette.responses import StreamingResponse

from app.config import get_settings
from app.deps import get_current_customer

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/browser", tags=["browser"])

HEARTBEAT_INTERVAL = 15.0
BROWSER_MODEL = "claude-sonnet-5-5"
SESSION_TTL = 300  # seconds before an idle session is cleaned up

DEFAULT_ALLOWED_DOMAINS = [
    "priceline.com",
    "www.priceline.com",
    "example.com",
    "iana.org",
    "booking.com",
    "www.booking.com",
    "hotels.com",
    "www.hotels.com",
    "expedia.com",
    "www.expedia.com",
    "wikipedia.org",
    "en.wikipedia.org",
    "medium.com",
    "www.medium.com",
]

SYSTEM_PROMPT = (
    "You are Veda, an AI travel companion browsing the web for the user. "
    "Complete tasks step by step. Use read_page to find interactive elements, "
    "left_click with refs, type to enter text, screenshot to see the page. "
    "When you need information from the user (like a verification code, OTP, "
    "or a choice), ask clearly in your response. The user will reply and you "
    "will continue in the SAME browser session. "
    "If you encounter a bot check or CAPTCHA, report it honestly. "
    "Be efficient — don't take unnecessary steps."
)


@dataclass
class BrowserSession:
    """A persistent browser session for one customer."""
    customer_id: str
    browser: Any  # VedaBrowserDriver instance
    client: Any   # Anthropic client
    messages: list = field(default_factory=list)
    created_at: float = field(default_factory=time.time)
    last_used: float = field(default_factory=time.time)


# In-memory session store: customer_id -> BrowserSession
_sessions: dict[str, BrowserSession] = {}
_sessions_lock = threading.Lock()


def _cleanup_stale_sessions() -> None:
    """Remove sessions idle longer than SESSION_TTL."""
    cutoff = time.time() - SESSION_TTL
    with _sessions_lock:
        stale = [cid for cid, s in _sessions.items() if s.last_used < cutoff]
        for cid in stale:
            logger.info("[browser] cleaning up stale session | customer=%s", cid)
            try:
                _sessions[cid].browser.close()
            except Exception:
                pass
            del _sessions[cid]


def _get_or_create_session(
    customer_id: str,
    api_key: str,
    domains: list[str],
    on_step: Any,
) -> BrowserSession:
    """Get existing session or create a new one."""
    _cleanup_stale_sessions()

    with _sessions_lock:
        session = _sessions.get(customer_id)

    if session:
        session.last_used = time.time()
        logger.info("[browser] reusing session | customer=%s | messages=%d", customer_id, len(session.messages))
        return session

    from anthropic import Anthropic
    from app.agents.browser.driver import VedaBrowserDriver

    on_step("Launching browser...")
    client = Anthropic(api_key=api_key)
    browser = VedaBrowserDriver(
        headless=True,
        on_step=on_step,
        allowed_domains=domains,
    )
    on_step("Browser ready.")

    session = BrowserSession(
        customer_id=customer_id,
        browser=browser,
        client=client,
    )
    with _sessions_lock:
        _sessions[customer_id] = session

    logger.info("[browser] new session | customer=%s", customer_id)
    return session


def _close_session(customer_id: str) -> None:
    with _sessions_lock:
        session = _sessions.pop(customer_id, None)
    if session:
        try:
            session.browser.close()
        except Exception:
            pass
        logger.info("[browser] session closed | customer=%s", customer_id)


class BrowserTaskRequest(BaseModel):
    task: str
    allowed_domains: list[str] | None = None
    end_session: bool = False


@router.post("/end-session")
async def end_browser_session(
    customer: dict = Depends(get_current_customer),
):
    """Close the browser session for this customer."""
    customer_id = customer.get("id", "?")
    _close_session(customer_id)
    return {"closed": True}


@router.post("/task")
async def browser_task(
    body: BrowserTaskRequest,
    customer: dict = Depends(get_current_customer),
):
    """Run a browser task. Reuses an existing session if one is open."""
    customer_id = customer.get("id", "?")
    logger.info(
        "[browser/task] START | customer=%s | task=%r",
        customer_id, body.task[:100],
    )

    if body.end_session:
        _close_session(customer_id)
        return {"closed": True}

    settings = get_settings()
    if not settings.anthropic_api_key:
        return {"error": "ANTHROPIC_API_KEY not configured"}

    event_queue: asyncio.Queue[dict | None] = asyncio.Queue()
    loop = asyncio.get_running_loop()

    def emit(event: dict) -> None:
        loop.call_soon_threadsafe(event_queue.put_nowait, event)

    def on_step(text: str) -> None:
        logger.info("[browser/task] step | %s", text)
        emit({"kind": "status", "text": text})

    def _run_browser() -> None:
        run_t0 = time.time()
        try:
            domains = body.allowed_domains or DEFAULT_ALLOWED_DOMAINS
            session = _get_or_create_session(customer_id, settings.anthropic_api_key, domains, on_step)

            # Update the on_step callback for this request
            session.browser._on_step = on_step

            # Add user message to conversation history
            session.messages.append({"role": "user", "content": body.task})

            on_step("Agent working...")

            runner = session.client.beta.messages.tool_runner(
                model=BROWSER_MODEL,
                max_tokens=4096,
                system=SYSTEM_PROMPT,
                tools=[session.browser],
                messages=session.messages,
            )

            step_count = 0
            final_text = ""

            for message in runner:
                step_count += 1
                if hasattr(message, "content"):
                    for block in message.content:
                        if hasattr(block, "text") and block.text:
                            final_text = block.text
                        elif hasattr(block, "name"):
                            on_step(f"Tool: {block.name}")

            # Save assistant response to history for multi-turn
            if final_text:
                session.messages.append({"role": "assistant", "content": final_text})

            total_s = time.time() - run_t0
            logger.info(
                "[browser/task] DONE | customer=%s | steps=%d | time=%.1fs | history=%d",
                customer_id, step_count, total_s, len(session.messages),
            )
            emit({
                "kind": "result",
                "text": final_text,
                "steps": step_count,
                "elapsed": round(total_s, 1),
                "session_active": True,
            })

        except Exception as e:
            logger.error("[browser/task] ERROR | customer=%s | %r", customer_id, e)
            emit({"kind": "error", "text": str(e)})
            _close_session(customer_id)

        emit({"kind": "done"})
        loop.call_soon_threadsafe(event_queue.put_nowait, None)

    async def generate():
        task = asyncio.create_task(asyncio.to_thread(_run_browser))
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
