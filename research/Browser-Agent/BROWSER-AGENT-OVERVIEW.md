# Veda Browser Agent -- Feature Overview

**Branch:** `feature/browser-agent`
**Date:** November 23, 2026
**Status:** Working prototype, tested end-to-end on mobile

---

## What Is It

A browser agent that lets users type a task in Veda's chat -- like "go to medium.com
and find me trending articles" -- and an AI (Claude) drives a real Chrome browser on
our server to complete it. The user sees only chat messages. No browser window, no
WebView, no popup. Just text in, results out.

Built on Anthropic's official **Browser Use SDK** (`browser_toolset_20260801`), where
Claude decides what to click, type, and read on real websites. Our code launches
Chrome, connects via Chrome DevTools Protocol (CDP), and executes Claude's decisions.

---

## What It Can Do Today

**Tested and working:**

- Navigate to any allowed website (medium.com, example.com, booking.com, etc.)
- Read page content -- headings, links, buttons, forms -- via accessibility tree
- Click buttons and links by element reference
- Type text into input fields (email, search boxes, forms)
- Press keyboard keys (Enter, Tab, Escape)
- Take screenshots for visual understanding
- Scroll pages
- Multi-turn conversations: browser stays open between messages so the user can
  provide OTP codes, make choices, or give follow-up instructions
- Detect bot walls (Cloudflare, CAPTCHAs) and report them honestly
- Auto-recover from dead browser sessions without user-visible errors

**Tested on real sites:**

| Site | Result |
|---|---|
| example.com | Full success -- navigated, read, summarized in 7.8 seconds |
| medium.com | Full success -- read trending articles, login with email + OTP code |
| priceline.com | Bot detection (Cloudflare Turnstile) -- reported honestly to user |

---

## How It Works

```
User (phone)                    Backend (server)                Claude (API)
     |                               |                              |
     | "find trending articles       |                              |
     |  on medium.com"               |                              |
     |------------------------------>|                              |
     |                               | Launch headless Chrome       |
     |                               | Connect via CDP              |
     |                               |----------------------------->|
     |                               |          Claude decides:     |
     |                               |          "navigate to        |
     |   SSE: "Navigating..."        |           medium.com"        |
     |<------------------------------|          "read_page"         |
     |                               |          "click ref_10"     |
     |   SSE: "Reading page..."      |          "get_page_text"    |
     |<------------------------------|                              |
     |                               |<-----------------------------|
     |                               |  "Here are 5 trending        |
     |   SSE: result with articles   |   articles..."               |
     |<------------------------------|                              |
```

The browser runs on the backend server as a headless Chrome process. The user's phone
never opens a browser. Claude sees the page through screenshots and the page's
accessibility tree, decides what actions to take, and our driver executes them via CDP.

Status updates stream to the phone as Server-Sent Events (SSE) so the user sees
progress in real time.

---

## Architecture

```
backend/
  app/agents/browser/
    driver.py        ~390 lines   The Chrome driver. Launches Chrome, connects
                                  via CDP WebSocket, implements 10 browser tools
                                  (navigate, screenshot, read_page, left_click,
                                  type, key, scroll, get_page_text, wait,
                                  browser_state). Includes anti-bot-detection
                                  flags and element reference tracking.

    agent.py         ~30 lines    Stub for orchestrator auto-discovery.

    manifest.yaml    ~8 lines     Agent registration (name, capabilities).

  app/routers/
    browser.py       ~250 lines   POST /browser/task -- SSE endpoint. Manages
                                  persistent browser sessions (one Chrome per
                                  user), conversation history for multi-turn,
                                  health checks, auto-recovery of dead sessions,
                                  5-minute idle cleanup.

mobile/
  src/hooks/
    useVedaChat.ts   +85 lines    Keyword detection (detects "browse", "go to
                                  medium.com", "sign in to X", etc.) routes
                                  messages to the browser agent. Tracks active
                                  sessions so follow-up messages (like OTP codes)
                                  stay on the browser path.

  src/lib/
    api.ts           +25 lines    streamBrowserTask() -- SSE client for the
                                  browser endpoint.
```

Total new code: approximately 700 lines backend, 85 lines mobile.

---

## Key Technical Decisions

**Claude as the brain, not a third party.** Previous browser features (grocery
checkout, Uber login) used third-party services (Pepesto, uber-mcp) to decide
what to click. If those services disappear, the features die. The browser agent
uses Claude directly -- the only external dependency is the Anthropic API.

**Server-side browser, not phone-side.** Chrome runs on the backend as a headless
process. The user's phone is just a chat interface. This keeps the phone light,
enables background processing, and centralizes browser management.

**CDP over Playwright.** We use the Chrome DevTools Protocol directly instead of
Playwright because Playwright's bundled Chromium download was blocked on our
network. CDP gives us the same control with no download dependency -- just the
system Chrome installation.

**Persistent sessions.** The browser stays open between chat messages so users can
provide OTP codes or make choices without starting over. Sessions are stored in
memory with automatic cleanup and dead-session recovery.

**claude-sonnet-5-5 specifically.** It is currently the only model supporting
the `browser_toolset_20260801`. Other models (claude-sonnet-4-6, etc.) explicitly
reject the browser toolset.

**Python 3.12 requirement.** The Browser Use SDK requires Python 3.10+. The main
backend runs Python 3.9. We created a separate virtual environment (`.venv-browser`)
with Python 3.12 that includes both the main backend dependencies and the browser
SDK.

---

## Known Limitations

| Limitation | Impact | Path Forward |
|---|---|---|
| Bot detection (Cloudflare) | Cannot access Priceline, Google | Browserbase (Anthropic partner) or hybrid phone WebView + Claude |
| Single tab per session | Cannot work across multiple tabs | Implement tab management tools in driver.py |
| No credential vault | User types credentials in chat | Build encrypted per-site credential storage |
| In-memory sessions | Sessions lost on server restart | Database-backed session persistence |
| Python 3.12 venv | Separate venv from main backend | Upgrade main backend to Python 3.12 |

---

## How to Run

**Start everything:**
```bash
./scripts/start.sh
```

**Or manually:**
```bash
# Backend (must use .venv-browser for browser agent support)
cd backend
.venv-browser/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

# Simulator (must be iOS 26.5 for Xcode 26.x touch support)
xcrun simctl boot "iPhone 17 Pro"
open -a Simulator

# Mobile
cd mobile
npm ci
NODE_TLS_REJECT_UNAUTHORIZED=0 npx expo start --go --clear

# Open in simulator
xcrun simctl openurl booted "exp://127.0.0.1:8081"
```

**Standalone test (no mobile needed):**
```bash
cd backend
.venv-browser/bin/python ../scripts/browser_test.py "Go to example.com and tell me what you see"
```

**Stop everything:**
```bash
./scripts/stop.sh
```

---

## Try It in the App

1. Sign in with phone `+15550001111`, OTP `500005`
2. Tap "Ask Veda" on the Dashboard
3. Type: `Go to medium.com and find me trending tech articles`
4. Watch the status updates stream in, then see the results

For the login flow:
1. Type: `Sign in to medium with 287262@ust.com`
2. When Claude asks for the code, check your email
3. Reply with the code in the chat

---

## Documentation

All research, architecture, and build documentation is in the repository:

| Document | Location |
|---|---|
| Full architecture (diagrams, sequences, code maps) | `research/Browser-Agent/Browser-Agent-Architecture.md` |
| Code summary: driver.py | `research/Browser-Agent/code-summary-driver.md` |
| Code summary: browser.py router | `research/Browser-Agent/code-summary-router.md` |
| Code summary: agent.py + manifest | `research/Browser-Agent/code-summary-agent-and-manifest.md` |
| Code summary: main.py changes | `research/Browser-Agent/code-summary-main.md` |
| Build journal (12 challenges + resolutions) | `research/Browser-Agent-Priceline/SETUP_LOG.md` |
| Presentation guide + Q&A prep | `research/Browser-Agent/PRESENTATION.md` |
