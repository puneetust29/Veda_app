"""In-chat Uber login.

Drives uber-mcp's headless remote-browser session over a persistent WebSocket,
so the login conversation (phone -> password -> OTP) happens as normal chat
turns instead of opening a browser. uber-mcp still runs a real Chromium
session underneath (Uber's login needs a real browser for bot detection) —
this module fills in each field on the user's behalf based on what step
uber-mcp reports the page is on, instead of the user clicking/typing directly.

If uber-mcp can't tell what step the page is on (an unexpected screen, a
CAPTCHA, a layout uber-mcp doesn't recognize), the session errors out and the
caller should fall back to the browser-based flow in uber_oauth.py.

FastAPI's uber.py routes are sync `def`s (like the rest of this codebase),
so this module runs its own background asyncio event loop in a daemon thread
and hands sync callers a blocking `_run_coro` bridge — the same shape as
using httpx synchronously elsewhere in this file's siblings.
"""
from __future__ import annotations

import asyncio
import json
import logging
import secrets
import threading
import time
from dataclasses import dataclass, field
from typing import Optional

import httpx
import websockets

from app.config import get_settings
from app.tools import uber_oauth

logger = logging.getLogger(__name__)

CALLBACK_PATH = "/uber/callback"
_STEP_WAIT_SEC = 18.0
_STEP_POLL_SEC = 0.3


@dataclass
class ChatLoginSession:
    customer_id: str
    ws: object  # websockets.ClientConnection — untyped to avoid import-time version coupling
    code_verifier: str
    client_id: str
    state: str
    redirect_uri: str
    step: str = "unknown"  # "identifier" | "password" | "otp" | "unknown" | "done" | "error"
    prompt: Optional[str] = None
    detail: Optional[str] = None  # for step="otp": Uber's own "sent via phone call to..." text
    options: list[str] = field(default_factory=list)  # for step="otp": other delivery buttons on screen
    error: Optional[str] = None
    code: Optional[str] = None  # set once uber-mcp reports "done"
    created_at: float = field(default_factory=time.time)
    lock: threading.Lock = field(default_factory=threading.Lock)


_sessions: dict[str, ChatLoginSession] = {}
_loop: Optional[asyncio.AbstractEventLoop] = None
_loop_thread: Optional[threading.Thread] = None
_loop_lock = threading.Lock()


def _ensure_loop() -> asyncio.AbstractEventLoop:
    global _loop, _loop_thread
    with _loop_lock:
        if _loop is not None and _loop.is_running():
            return _loop
        loop = asyncio.new_event_loop()

        def _run() -> None:
            asyncio.set_event_loop(loop)
            loop.run_forever()

        thread = threading.Thread(target=_run, daemon=True, name="uber-chat-login-loop")
        thread.start()
        _loop = loop
        _loop_thread = thread
        return loop


def _run_coro(coro, timeout: float = 20.0):
    loop = _ensure_loop()
    future = asyncio.run_coroutine_threadsafe(coro, loop)
    return future.result(timeout=timeout)


def _callback_url() -> str:
    settings = get_settings()
    base = getattr(settings, "backend_url", "http://localhost:8000").rstrip("/")
    return f"{base}{CALLBACK_PATH}"


async def _reader_loop(session: ChatLoginSession) -> None:
    try:
        async for raw in session.ws:
            try:
                msg = json.loads(raw)
            except ValueError:
                continue
            msg_type = msg.get("type")
            if msg_type == "step":
                with session.lock:
                    session.step = msg.get("step", "unknown")
                    session.prompt = msg.get("prompt")
                    session.detail = msg.get("detail")
                    session.options = msg.get("options") or []
                logger.info(
                    "[uber_chat_login] step | customer_id=%s | step=%s | prompt=%r | detail=%r | options=%r",
                    session.customer_id, session.step, session.prompt, session.detail, session.options,
                )
            elif msg_type == "done":
                with session.lock:
                    session.step = "done"
                    session.code = msg.get("code")
                logger.info("[uber_chat_login] done | customer_id=%s", session.customer_id)
            elif msg_type == "error":
                with session.lock:
                    session.step = "error"
                    session.error = msg.get("message", "Unknown error")
                logger.warning(
                    "[uber_chat_login] uber-mcp reported error | customer_id=%s | message=%s",
                    session.customer_id, session.error,
                )
            # "frame" events are ignored — nothing renders them in chat mode.
    except Exception as exc:
        with session.lock:
            if session.step != "done":
                session.step = "error"
                session.error = str(exc)
        logger.warning("[uber_chat_login] ws reader ended | error=%s", exc)


async def _open_session(customer_id: str) -> ChatLoginSession:
    mcp_url = get_settings().uber_mcp_url.rstrip("/")
    client_id = uber_oauth._register_client()
    verifier, challenge = uber_oauth._pkce_pair()
    state = secrets.token_urlsafe(16)
    cb = _callback_url()

    resp = httpx.post(
        f"{mcp_url}/login/headless/start",
        json={
            "client_id": client_id,
            "redirect_uri": cb,
            "code_challenge": challenge,
            "state": state,
            "scope": "mcp:tools",
        },
        timeout=15.0,
    )
    resp.raise_for_status()
    data = resp.json()

    ws = await websockets.connect(data["wsUrl"], open_timeout=15)
    session = ChatLoginSession(
        customer_id=customer_id,
        ws=ws,
        code_verifier=verifier,
        client_id=client_id,
        state=state,
        redirect_uri=cb,
    )
    asyncio.get_running_loop().create_task(_reader_loop(session))
    return session


def _wait_for_step_change(session: ChatLoginSession, deadline: float) -> None:
    while time.time() < deadline:
        with session.lock:
            if session.step != "unknown":
                return
        time.sleep(_STEP_POLL_SEC)


def _question_for(session: ChatLoginSession) -> str:
    with session.lock:
        step, prompt, error = session.step, session.prompt, session.error
        detail, options = session.detail, list(session.options)
    if step == "identifier":
        return "What's the phone number or email on your Uber account?"
    if step == "password":
        return "And your Uber password?"
    if step == "otp":
        lines = [detail] if detail else ["Uber sent you a verification code."]
        if options:
            choices = "\n".join(f"  • \"{opt}\"" for opt in options)
            lines.append(f"Reply with the code, or say one of these instead:\n{choices}")
        else:
            lines.append("Reply with the code.")
        return "\n".join(lines)
    if step == "done":
        return "You're connected!"
    if step == "error":
        return f"I couldn't get through Uber's login here ({error or 'unrecognized screen'}). Want to use the browser login instead?"
    return prompt or "Give me a second while I open your Uber login…"


def is_active(customer_id: str) -> bool:
    return customer_id in _sessions


def current_question(customer_id: str) -> Optional[str]:
    session = _sessions.get(customer_id)
    return _question_for(session) if session else None


def _finish_login(session: ChatLoginSession, customer_id: str) -> dict:
    """Exchange the code once uber-mcp reports "done" and clear the session.
    Shared by start() (Uber's device-trust can auto-complete a login before
    any field is ever asked for) and submit_answer() (the normal path, after
    the last of identifier/password/otp is submitted)."""
    with session.lock:
        code = session.code
    try:
        result = uber_oauth.exchange_code_pkce(
            code=code,
            code_verifier=session.code_verifier,
            client_id=session.client_id,
            redirect_uri=session.redirect_uri,
            customer_id=customer_id,
        )
    except Exception as exc:
        logger.error("[uber_chat_login] token exchange failed | customer_id=%s | error=%s", customer_id, exc)
        stop(customer_id)
        return {"status": "error", "message": f"Uber login finished but token exchange failed: {exc}"}
    logger.info("[uber_chat_login] login complete | customer_id=%s | user_sub=%s", customer_id, result.get("user_sub"))
    stop(customer_id)
    return {"status": "done", "message": "You're connected!", "tokens": result}


def start(customer_id: str) -> dict:
    """Start a chat-driven login. Returns {"status": "asking"|"done"|"error", "message": str, "tokens"?: dict}."""
    stop(customer_id)
    try:
        session = _run_coro(_open_session(customer_id))
    except Exception as exc:
        logger.error("[uber_chat_login] failed to start | customer_id=%s | error=%s", customer_id, exc)
        return {"status": "error", "message": f"Could not reach Uber: {exc}"}

    _sessions[customer_id] = session
    _wait_for_step_change(session, time.time() + _STEP_WAIT_SEC)

    with session.lock:
        step = session.step
    if step == "done":
        # Uber recognized this device/account as already trusted and skipped
        # straight past any interactive step.
        return _finish_login(session, customer_id)

    if step in ("error", "unknown"):
        message = (
            _question_for(session)
            if step == "error"
            else "I couldn't tell what Uber's login page needed here. Want to use the browser login instead?"
        )
        logger.warning("[uber_chat_login] start gave up | customer_id=%s | step=%s", customer_id, step)
        stop(customer_id)
        return {"status": "error", "message": message}

    logger.info("[uber_chat_login] start asking | customer_id=%s | step=%s", customer_id, step)
    return {"status": "asking", "message": _question_for(session)}


def submit_answer(customer_id: str, text: str) -> dict:
    """Submit the user's chat reply for whatever step is currently pending.

    Returns {"status": "asking"|"done"|"error", "message": str, "tokens"?: dict}
    """
    session = _sessions.get(customer_id)
    if not session:
        logger.warning("[uber_chat_login] submit_answer | customer_id=%s | no session in progress", customer_id)
        return {"status": "error", "message": "No Uber login in progress."}

    with session.lock:
        step = session.step
    if step == "done":
        # The real "done" signal (URL-based, independent of detectStep) can land
        # in the background between two chat turns — e.g. detectStep briefly
        # misreads Uber's post-login home screen as another form step, we reply
        # to that, and only then does "done" arrive. Finish the login now
        # instead of just echoing "You're connected!" without ever exchanging
        # the code or saving the session.
        logger.info("[uber_chat_login] submit_answer found step already done | customer_id=%s", customer_id)
        return _finish_login(session, customer_id)

    if step not in ("identifier", "password", "otp"):
        logger.warning(
            "[uber_chat_login] submit_answer ignored | customer_id=%s | current_step=%s (not awaiting input)",
            customer_id, step,
        )
        return {"status": "asking", "message": _question_for(session)}

    logger.info(
        "[uber_chat_login] submitting | customer_id=%s | field=%s | value_len=%d", customer_id, step, len(text.strip())
    )

    async def _submit() -> None:
        with session.lock:
            session.step = "unknown"
        await session.ws.send(json.dumps({"type": "submit", "field": step, "value": text.strip()}))

    try:
        _run_coro(_submit())
    except Exception as exc:
        logger.error("[uber_chat_login] submit failed | customer_id=%s | error=%s", customer_id, exc)
        stop(customer_id)
        return {"status": "error", "message": f"Could not reach Uber: {exc}"}

    _wait_for_step_change(session, time.time() + _STEP_WAIT_SEC)

    with session.lock:
        new_step = session.step

    logger.info("[uber_chat_login] submit result | customer_id=%s | new_step=%s", customer_id, new_step)

    if new_step == "done":
        return _finish_login(session, customer_id)

    if new_step in ("error", "unknown"):
        message = (
            _question_for(session)
            if new_step == "error"
            else "I lost track of Uber's login page after that. Want to use the browser login instead?"
        )
        logger.warning("[uber_chat_login] submit_answer gave up | customer_id=%s | step=%s", customer_id, new_step)
        stop(customer_id)
        return {"status": "error", "message": message}

    return {"status": "asking", "message": _question_for(session)}


def stop(customer_id: str) -> None:
    session = _sessions.pop(customer_id, None)
    if not session:
        return

    async def _close() -> None:
        try:
            await session.ws.close()
        except Exception:
            pass

    try:
        _run_coro(_close(), timeout=5)
    except Exception:
        pass
