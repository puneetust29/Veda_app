# browser.py (router) -- Code Summary

**File:** `backend/app/routers/browser.py`
**Lines:** ~250
**Purpose:** The API endpoint that the mobile app calls. Manages browser sessions and streams status updates back to the user.

---

## What This File Does

This is the entry point for all browser agent requests. When the mobile app sends `POST /browser/task`, this file:

1. Authenticates the user
2. Gets or creates a Chrome browser session for them
3. Runs Claude's agent loop in a background thread
4. Streams status updates back to the phone as Server-Sent Events (SSE)
5. Keeps the browser alive for follow-up messages

---

## Key Parts

### 1. Configuration

```python
BROWSER_MODEL = "claude-sonnet-5-5"     # only model supporting browser toolset
SESSION_TTL = 300                        # 5 minutes idle before session cleanup
HEARTBEAT_INTERVAL = 15.0               # SSE keep-alive ping every 15 seconds
```

**DEFAULT_ALLOWED_DOMAINS:** The list of websites Claude is allowed to visit. Includes priceline.com, medium.com, booking.com, example.com, wikipedia.org, and others.

**SYSTEM_PROMPT:** Instructions to Claude about how to behave. Key points:
- Complete tasks step by step
- When you need user input (OTP, choices), ask and wait
- Report bot detection honestly
- Be efficient

### 2. BrowserSession (dataclass)

Stores everything about one user's browser session:

```python
@dataclass
class BrowserSession:
    customer_id: str      # which user owns this session
    browser: Any          # VedaBrowserDriver instance (the Chrome connection)
    client: Any           # Anthropic API client
    messages: list        # conversation history [user_msg, assistant_msg, ...]
    created_at: float     # when the session started
    last_used: float      # when the session was last active
```

Sessions are stored in `_sessions` dict, keyed by customer_id. Protected by a threading lock since the browser runs in a background thread.

### 3. Session Management (4 functions)

**_cleanup_stale_sessions():**
- Runs before every new request
- Finds sessions idle longer than SESSION_TTL (5 minutes)
- Closes their Chrome and removes them from the dict

**_is_session_alive(session):**
- Health check before reusing a session
- Checks: Is the WebSocket still connected? Is the Chrome process still running? Can we call `_page_info()` without error?
- Returns True/False
- If False, the session will be recycled (closed and replaced with a fresh one)

**_get_or_create_session(customer_id, api_key, domains, on_step):**
- If a session exists and is alive: reuse it (same Chrome, same cookies, same page)
- If a session exists but is dead: close it, tell user "Starting fresh...", create new one
- If no session: launch new Chrome, create new Anthropic client, store in dict

**_close_session(customer_id):**
- Close the Chrome browser
- Remove from the dict

### 4. POST /browser/task (the main endpoint)

The request body:
```python
class BrowserTaskRequest(BaseModel):
    task: str                              # "Go to medium.com and sign in"
    allowed_domains: list[str] | None      # optional override
    end_session: bool = False              # close the session explicitly
```

What happens when a request comes in:

```
1. Authenticate user (get_current_customer)
2. Get or create browser session
3. Add user's message to session.messages
4. Start _run_browser() in a background thread
5. Return SSE StreamingResponse immediately
6. _run_browser() runs Claude's tool_runner loop
7. Each step emits an SSE event: {"kind": "status", "text": "Navigating..."}
8. When Claude finishes, emit: {"kind": "result", "text": "Here's what I found..."}
9. Emit: {"kind": "done"}
```

### 5. _run_browser() -- the background thread

This is where Claude actually drives the browser:

```python
runner = session.client.beta.messages.tool_runner(
    model=BROWSER_MODEL,
    max_tokens=4096,
    system=SYSTEM_PROMPT,
    tools=[session.browser],       # our VedaBrowserDriver
    messages=session.messages,     # full conversation history
)

for message in runner:
    # Claude returns either tool calls (keep going) or text (done)
    for block in message.content:
        if block is text: final_text = block.text
        if block is tool_use: emit status event
```

After the loop finishes:
- Save Claude's response to `session.messages` (for multi-turn)
- Emit the result with `session_active: True`
- Keep the browser open

If an error occurs:
- Check if it's a connection error (WebSocket died, timeout)
- If yes: close session, tell user "session expired, try again"
- If no: close session, show the actual error

### 6. POST /browser/end-session

Simple endpoint to explicitly close a browser session:

```python
@router.post("/end-session")
async def end_browser_session(customer):
    _close_session(customer_id)
    return {"closed": True}
```

### 7. SSE Streaming

The `generate()` async generator produces the SSE stream:

```python
async def generate():
    task = asyncio.create_task(asyncio.to_thread(_run_browser))
    while True:
        event = await event_queue.get(timeout=HEARTBEAT_INTERVAL)
        if timeout: yield ": ping\n\n"      # keep connection alive
        if event is None: break              # _run_browser finished
        yield f"data: {json.dumps(event)}\n\n"
```

The browser runs in `asyncio.to_thread` (a worker thread) because it makes blocking CDP calls. Events flow from the thread to the async generator via an `asyncio.Queue`.

Heartbeat pings (`: ping`) are sent every 15 seconds to prevent the connection from timing out when Claude is processing.

---

## SSE Event Types

The mobile app receives these events:

| Event | When | Example |
|---|---|---|
| `{"kind": "status", "text": "..."}` | Each browser action | "Navigating to medium.com" |
| `{"kind": "result", "text": "...", "session_active": true}` | Claude finishes | The final answer |
| `{"kind": "error", "text": "..."}` | Something failed | "Browser session expired" |
| `{"kind": "done"}` | Stream closing | Always the last event |
| `: ping` | Every 15s of silence | SSE keep-alive (not a data event) |

---

## Threading Model

```
Main thread (FastAPI/uvicorn):
  - Receives HTTP request
  - Returns StreamingResponse immediately
  - Reads from event_queue, yields SSE frames

Worker thread (asyncio.to_thread):
  - Runs _run_browser()
  - Launches Chrome, runs Claude loop
  - Writes to event_queue via loop.call_soon_threadsafe
  - Blocks on CDP WebSocket calls (OK because it's a worker thread)
```

The `loop.call_soon_threadsafe(event_queue.put_nowait, event)` bridge is necessary because the worker thread cannot directly access the async event loop.

---

## Dependencies

| Import | Purpose |
|---|---|
| `fastapi.APIRouter` | Route registration |
| `fastapi.Depends` | Dependency injection (authentication) |
| `starlette.responses.StreamingResponse` | SSE streaming |
| `asyncio` | Async event queue, background threading |
| `threading` | Session lock for thread safety |
| `app.deps.get_current_customer` | JWT authentication |
| `app.config.get_settings` | Read ANTHROPIC_API_KEY from .env |
