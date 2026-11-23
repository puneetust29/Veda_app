"""POST /browser/task — SSE endpoint for the browser agent.

Launches a headless Chrome, runs Claude's Browser Use SDK loop,
and streams status events back to the mobile chat.
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

from app.config import get_settings
from app.deps import get_current_customer

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/browser", tags=["browser"])

HEARTBEAT_INTERVAL = 15.0
BROWSER_MODEL = "claude-sonnet-5-5"

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
]

SYSTEM_PROMPT = (
    "You are Veda, an AI travel companion. You are browsing the web on behalf of the user. "
    "Navigate to the requested website, interact with it like a human would, and complete the task. "
    "Use read_page to understand page structure and find interactive elements. "
    "Use screenshot when you need to see the visual layout. "
    "Use left_click with element references (ref_N) when possible. "
    "When filling search forms, use type to enter text and key to press Enter or Tab. "
    "After getting results, summarize them clearly with prices and key details. "
    "If you encounter a bot check or CAPTCHA, report it honestly — do not try to bypass it. "
    "Be efficient — don't take unnecessary steps."
)


class BrowserTaskRequest(BaseModel):
    task: str
    allowed_domains: list[str] | None = None


@router.post("/task")
async def browser_task(
    body: BrowserTaskRequest,
    customer: dict = Depends(get_current_customer),
):
    """Run a browser task and stream status + results as SSE."""
    customer_id = customer.get("id", "?")
    logger.info(
        "[browser/task] START | customer=%s | task=%r",
        customer_id, body.task[:100],
    )

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
            from anthropic import Anthropic
            from app.agents.browser.driver import VedaBrowserDriver

            domains = body.allowed_domains or DEFAULT_ALLOWED_DOMAINS

            on_step("Launching browser...")
            client = Anthropic(api_key=settings.anthropic_api_key)
            browser = VedaBrowserDriver(
                headless=True,
                on_step=on_step,
                allowed_domains=domains,
            )

            on_step("Browser ready. Starting agent...")

            with browser:
                runner = client.beta.messages.tool_runner(
                    model=BROWSER_MODEL,
                    max_tokens=4096,
                    system=SYSTEM_PROMPT,
                    tools=[browser],
                    messages=[{"role": "user", "content": body.task}],
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
                                tool_input = getattr(block, "input", {})
                                on_step(f"Tool: {block.name}")

                total_s = time.time() - run_t0
                logger.info(
                    "[browser/task] DONE | customer=%s | steps=%d | time=%.1fs",
                    customer_id, step_count, total_s,
                )
                emit({
                    "kind": "result",
                    "text": final_text,
                    "steps": step_count,
                    "elapsed": round(total_s, 1),
                })

        except Exception as e:
            logger.error("[browser/task] ERROR | customer=%s | %r", customer_id, e)
            emit({"kind": "error", "text": str(e)})

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
