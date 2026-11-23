# main.py changes -- Code Summary

**File:** `backend/app/main.py`
**Change:** 2 lines added
**Purpose:** Register the browser router so the `/browser/*` endpoints are accessible.

---

## What Changed

Two lines were added to main.py:

### 1. Import the browser router

```python
# Before:
from app.routers import auth, calendar, conversation, dev, ...

# After:
from app.routers import auth, browser, calendar, conversation, dev, ...
```

This imports `backend/app/routers/browser.py` which defines the browser agent endpoints.

### 2. Register the router with FastAPI

```python
# Added at the end of the router registrations:
app.include_router(browser.router)
```

This tells FastAPI: "when someone calls `POST /browser/task` or `POST /browser/end-session`, route it to the browser router."

---

## What This Enables

After these two lines, the backend serves:

| Endpoint | Method | Purpose |
|---|---|---|
| `/browser/task` | POST | Run a browser task, stream SSE status updates |
| `/browser/end-session` | POST | Close the browser session for this customer |

Both require authentication (JWT token from `/auth/dev-login`).

---

## Why Only 2 Lines

The browser agent is self-contained. All the complexity lives in:
- `driver.py` -- the Chrome driver
- `browser.py` (router) -- session management and SSE streaming

main.py only needs to know the router exists. It does not import the driver, the agent, or any browser-specific logic.
