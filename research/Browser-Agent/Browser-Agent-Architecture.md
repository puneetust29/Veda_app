# Browser Agent — Architecture & Implementation

*How Veda's browser agent actually works, derived from the implemented code on `feature/browser-agent`.*

---

## How It Works — The Simple Version

Imagine you have a really smart friend who can use a computer, but they're in another room. You can't see their screen, but you can text them.

You text: *"Go to Medium and find me trending tech articles."*

Here's what happens:

1. **Your friend opens a laptop.** On our server (not your phone), a real Google Chrome browser launches — but with no screen attached. It's like a computer running in a dark room. This is called "headless" Chrome.

2. **Your friend has a genius helper.** Claude (Anthropic's AI) is sitting next to the laptop. Claude can see the screen (via screenshots and reading the page structure), and can tell the browser what to do: "click here", "type this", "scroll down".

3. **Claude navigates the website.** Claude tells the browser: "Go to medium.com." The browser loads it. Claude reads the page and sees a "Sign in" button, trending articles, navigation links — everything a human would see.

4. **Claude clicks and types like a human.** Need to sign in? Claude clicks the email field, types your email, clicks Continue. Need to search? Claude types in the search box and presses Enter. It's doing exactly what you would do — just faster and invisible.

5. **You get text updates.** While Claude works, your phone shows status messages: "Navigating to medium.com...", "Reading page...", "Found 5 trending articles...". You never see a browser. Just chat.

6. **Claude reports back.** When it's done, Claude sends you the results as a chat message: article titles, prices, hotel options — whatever you asked for.

7. **If Claude needs your help, it asks.** Some websites need a verification code sent to your email. Claude can't read your email, so it asks: "Medium sent a code to your email. What is it?" You reply with the code, and Claude enters it — in the **same browser that's still open** — and continues.

**That's it.** You texted what you wanted. A robot on our server opened a real browser, navigated a real website, and brought back the answer — while you were doing something else on your phone.

---

## How This Is Different From Everything Before

Veda has had two previous "browser-like" features. This one is fundamentally different:

| | Grocery (Pepesto) | Uber Login (uber-mcp) | **Browser Agent (Claude)** |
|---|---|---|---|
| **Who is the brain?** | Pepesto (third-party API) | uber-mcp (third-party service) | **Claude (our LLM)** |
| **Who drives the browser?** | Pepesto's JS in a WebView on the phone | uber-mcp's Chromium on their server | **Our Chrome on our server, Claude decides** |
| **Where is the browser?** | On the user's phone (WebView) | On uber-mcp's server | **On our server (headless Chrome via CDP)** |
| **What websites work?** | 25 Pepesto-supported supermarkets | Uber login only | **Any website** |
| **If the third-party dies?** | Everything breaks | Everything breaks | **Still works — Claude is the only dependency** |
| **Who owns the code?** | Infrastructure only — brain is Pepesto's | Orchestration only — brain is uber-mcp's | **Full stack — brain + hands + orchestration** |
| **Human-in-the-loop?** | User logs in manually in WebView | User provides credentials in chat | **User provides OTP/choices in chat, same browser session** |
| **Multi-turn?** | No — one-shot checkout loop | No — one-shot login | **Yes — browser persists, conversation continues** |

---

## 1. High-Level Architecture

```
+------------------+         +---------------------------+         +------------------+
|   MOBILE APP     |         |      BACKEND (FastAPI)    |         |  ANTHROPIC API   |
|  (React Native)  |         |      Python 3.12          |         |                  |
|                  |         |                           |         |                  |
|  +-----------+   |  SSE    |  +---------------------+ |  API    |  +------------+  |
|  | VedaChat  |----------->|  | POST /browser/task  |--------->|  | Claude     |  |
|  | (chat UI) |<-----------|  | (SSE streaming)     |<---------|  | sonnet-5-5 |  |
|  +-----------+   | events  |  +----------+----------+ | tool    |  |            |  |
|       |          |         |             |             | calls   |  | Browser    |  |
|       |          |         |  +----------v----------+ |         |  | Use SDK    |  |
|  User types      |         |  | VedaBrowserDriver   | |         |  +------------+  |
|  "Go to          |         |  | (CDP over WebSocket)| |         |                  |
|   medium.com"    |         |  +----------+----------+ |         |                  |
|                  |         |             |             |         |                  |
|  User sees       |         |  +----------v----------+ |         |                  |
|  only chat       |         |  | Headless Chrome     | |         |                  |
|  messages        |         |  | (real Chromium,     | |         |                  |
|                  |         |  |  no screen,         | |         |                  |
|  NO browser      |         |  |  fresh profile)     | |         |                  |
|  visible         |         |  +----------+----------+ |         |                  |
+------------------+         |             | HTTPS       |         +------------------+
                             +-------------|-------------+
                                           |
                                           v
                                    +-------------+
                                    |  WEBSITES   |
                                    | (medium.com,|
                                    |  priceline, |
                                    |  any site)  |
                                    +-------------+
```

**Key points:**
- The browser runs on the **server**, not the phone
- The user sees **only chat messages**, never a browser window
- Claude sees the page via **screenshots + accessibility tree** (read_page)
- Claude decides what to do and returns **structured tool calls** (navigate, click, type)
- Our driver executes them in Chrome via **Chrome DevTools Protocol (CDP)**
- Status updates stream to the phone as **Server-Sent Events (SSE)**

---

## 2. The Agent Loop — How Claude Drives the Browser

This is the core loop that makes everything work:

```
                    +------------------+
                    |  User sends task |
                    |  via VedaChat    |
                    +--------+---------+
                             |
                             v
                    +------------------+
              +---->|  Claude receives |
              |     |  task + page     |
              |     |  state           |
              |     +--------+---------+
              |              |
              |              v
              |     +------------------+
              |     |  Claude decides  |
              |     |  next action(s): |
              |     |  navigate,       |
              |     |  read_page,      |
              |     |  left_click,     |
              |     |  type, key,      |
              |     |  screenshot,     |
              |     |  scroll, wait    |
              |     +--------+---------+
              |              |
              |    +---------+---------+
              |    |                   |
              |    v                   v
              | Tool calls         Text response
              | (keep going)       (task complete)
              |    |                   |
              |    v                   v
              | +------------------+  +------------------+
              | | Our driver       |  | Stream result    |
              | | executes in      |  | to mobile chat   |
              | | Chrome via CDP   |  +------------------+
              | +--------+---------+
              |          |
              |          v
              | +------------------+
              | | Return result +  |
              | | browser_state    |
              | | to Claude        |
              +--+------------------+
```

**Claude uses the Anthropic SDK's `tool_runner`** which handles this loop automatically.
Our code just provides the browser driver and receives the final answer.

```python
# This is the entire agent loop — 5 lines
runner = client.beta.messages.tool_runner(
    model="claude-sonnet-5-5",
    tools=[browser],                    # our driver
    messages=[{"role": "user", "content": task}],
)
for message in runner:                  # loop runs until Claude is done
    # emit status events to mobile
```

---

## 3. The Browser Driver — What It Implements

Our `VedaBrowserDriver` is a subclass of Anthropic's `BetaAbstractBrowserToolset20260801`.
It implements 10 of the 27+ available browser tools, connecting each to Chrome via CDP:

| Tool | What Claude calls it for | Our CDP implementation |
|---|---|---|
| `navigate` | Load a URL, go back/forward | `Page.navigate` + wait for DOMContentLoaded |
| `screenshot` | See the visual layout | `Page.captureScreenshot` → PNG |
| `read_page` | Understand page structure, get element refs | JavaScript: query all headings, links, buttons, inputs → `[ref_N]` tags |
| `left_click` | Click a button/link by ref or coordinates | `Input.dispatchMouseEvent` (mouseMoved → mousePressed → mouseReleased) |
| `type` | Enter text in a field | `Input.insertText` per character |
| `key` | Press Enter, Tab, Escape, etc. | `Input.dispatchKeyEvent` with key codes |
| `scroll` | Scroll the page | `Input.dispatchMouseEvent` type=mouseWheel |
| `get_page_text` | Read all visible text | `document.body.innerText` |
| `wait` | Pause before next step | `time.sleep` (0-30 seconds) |
| `_browser_state` | Report tab URL/title after every action | `location.href` + `document.title` |

### Element References — How Claude "Sees" the Page

When Claude calls `read_page`, our JavaScript scans the DOM and assigns `ref_N` tags:

```
- heading "Medium" [ref_1]
- link "Sign in" [ref_5]
- link "Start reading" [ref_10]
- button "Sign in with email" [ref_28]
- textbox "" [ref_37] (type="email", placeholder="Your email")
- button "Continue" [ref_39]
```

Claude then clicks by reference: `left_click(target={type: "ref", ref: "ref_5"})`.
This is more reliable than pixel coordinates because it survives layout shifts.

### Anti-Bot-Detection

The driver includes stealth measures to reduce bot detection:

```python
# Chrome launch flags
"--disable-blink-features=AutomationControlled"
"--user-agent=Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ..."

# CDP script injected on every page load
Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
window.chrome = { runtime: {} };
```

This is enough for sites like Medium but not for aggressive detectors like
Cloudflare Turnstile (Priceline, Google). Production solution: Browserbase.

---

## 4. Persistent Sessions — Multi-Turn Conversations

The browser stays open between chat messages. This enables flows like login with OTP:

```
MESSAGE 1: "Sign in to medium.com with 287262@ust.com"

  Server: Chrome launches → navigates → enters email → clicks Continue
  Server: Keeps Chrome open, stores session in _sessions[customer_id]
  Chat:   "Medium sent a code to your email. Reply with the code."

  ┌───────────────────────────────────────────┐
  │  Chrome is STILL OPEN on the code page    │
  │  Session stored in memory                 │
  │  Messages: [user_msg_1, assistant_msg_1]  │
  └───────────────────────────────────────────┘

MESSAGE 2: "the code is 717917"

  Server: Finds existing session → same Chrome, same page
  Server: Messages: [user_1, assistant_1, user_2] → sent to Claude
  Server: Claude sees code boxes still on screen → types code → clicks Submit
  Chat:   "You're signed in! What would you like to do?"

MESSAGE 3: "Show me trending articles"

  Server: Same Chrome, now logged in → navigates to trending
  Chat:   "Here are the trending articles: ..."
```

### Session Lifecycle

```
First browser message → Chrome launches → session stored
     ↓
Follow-up messages → same Chrome, messages accumulate
     ↓
Session health check on each reuse:
  - WebSocket alive?
  - Chrome process running?
  - CDP responds to page_info?
  → If dead: auto-close, start fresh (no error to user)
     ↓
5 minutes of inactivity → session auto-cleaned
     ↓
Or: POST /browser/end-session → immediate cleanup
```

### Auto-Recovery

If Chrome crashes or the WebSocket dies between messages, the next request:
1. Detects the dead connection via `_is_session_alive()`
2. Closes the stale session
3. Launches a fresh Chrome
4. Tells the user: "Previous session expired. Starting fresh..."

The user never sees a broken state.

---

## 5. End-to-End Sequence — Medium Login Flow

```
User          VedaChat       useVedaChat       Backend           Chrome (CDP)      Claude API        Medium.com
 |               |               |               |                   |                |                  |
 | "Go to medium |               |               |                   |                |                  |
 |  and login    |               |               |                   |                |                  |
 |  with email"  |               |               |                   |                |                  |
 |-------------->|               |               |                   |                |                  |
 |               |--isBrowser    |               |                   |                |                  |
 |               |  Task()=true->|               |                   |                |                  |
 |               |               |               |                   |                |                  |
 |               |               |--POST-------->|                   |                |                  |
 |               |               |  /browser/task|                   |                |                  |
 |               |               |  {task:"..."}  |                   |                |                  |
 |               |               |               |                   |                |                  |
 |               |               |               |--launch Chrome--->|                |                  |
 |               |               |               |  (headless, CDP)  |                |                  |
 |               |               |               |                   |                |                  |
 |               |               |               |--tool_runner----->|                |                  |
 |               |               |               |  (browser+task)   |-----navigate-->|                  |
 |               |               |               |                   |  medium.com    |                  |
 |               |               |               |                   |                |-----GET -------->|
 |               |               |               |                   |<---HTML--------|<----- 200 -------|
 |  SSE: "Nav    |               |               |                   |                |                  |
 |   to medium"  |<--------------|---------SSE---|                   |                |                  |
 |               |               |               |                   |                |                  |
 |               |               |               |                   |--read_page---->|                  |
 |               |               |               |                   |  (JS: find all |                  |
 |               |               |               |                   |   refs)        |                  |
 |               |               |               |                   |<--refs---------|                  |
 |               |               |               |                   |                |                  |
 |               |               |               |                   |--left_click--->|                  |
 |               |               |               |                   |  ref_5 "Sign   |                  |
 |               |               |               |                   |  in"           |                  |
 |  SSE: "Click  |               |               |                   |                |                  |
 |   Sign in"    |<--------------|---------SSE---|                   |                |                  |
 |               |               |               |                   |                |                  |
 |               |               |               |                   | (several more  |                  |
 |               |               |               |                   |  clicks: "Sign |                  |
 |               |               |               |                   |  in with email"|                  |
 |               |               |               |                   |  → type email  |                  |
 |               |               |               |                   |  → click       |                  |
 |               |               |               |                   |  Continue)     |                  |
 |               |               |               |                   |                |--email sent----->|
 |               |               |               |                   |                |<--code page------|
 |               |               |               |                   |                |                  |
 |               |               |               |--Claude response->|                |                  |
 |               |               |               |  "Medium sent a   |                |                  |
 |               |               |               |   code. Reply     |                |                  |
 |               |               |               |   with the code." |                |                  |
 |               |               |               |                   |                |                  |
 |               |               |               |--save session---->|  (Chrome stays |                  |
 |               |               |               |  _sessions[cust]  |   open on code |                  |
 |               |               |               |                   |   entry page)  |                  |
 |  SSE: result  |               |               |                   |                |                  |
 |  "Medium sent |<--------------|---------SSE---|                   |                |                  |
 |   a code..."  |               |               |                   |                |                  |
 |               |               |               |                   |                |                  |
 |  browserSession               |               |                   |                |                  |
 |  ActiveRef=   |               |               |                   |                |                  |
 |  true         |               |               |                   |                |                  |
 |               |               |               |                   |                |                  |
 |  USER CHECKS EMAIL, GETS CODE                 |                   |                |                  |
 |               |               |               |                   |                |                  |
 | "the code is  |               |               |                   |                |                  |
 |  717917"      |               |               |                   |                |                  |
 |-------------->|               |               |                   |                |                  |
 |               |--browserSession               |                   |                |                  |
 |               |  Active=true->|               |                   |                |                  |
 |               |               |--POST-------->|                   |                |                  |
 |               |               |  /browser/task|                   |                |                  |
 |               |               |  {task:"code  |                   |                |                  |
 |               |               |   is 717917"} |                   |                |                  |
 |               |               |               |                   |                |                  |
 |               |               |               |--reuse session--->|  SAME Chrome   |                  |
 |               |               |               |  _sessions[cust]  |  SAME page     |                  |
 |               |               |               |                   |                |                  |
 |               |               |               |--tool_runner----->|                |                  |
 |               |               |               |  messages=[       |                |                  |
 |               |               |               |   user_1,         |--left_click--->|                  |
 |               |               |               |   assistant_1,    |  ref_42 (code  |                  |
 |               |               |               |   user_2          |  box)          |                  |
 |               |               |               |  ]                |                |                  |
 |               |               |               |                   |--type--------->|                  |
 |               |               |               |                   |  "717917"      |                  |
 |               |               |               |                   |                |-----verify------>|
 |               |               |               |                   |                |<----logged in----|
 |               |               |               |                   |                |                  |
 |  SSE: result  |               |               |                   |                |                  |
 |  "You're      |<--------------|---------SSE---|                   |                |                  |
 |   signed in!" |               |               |                   |                |                  |
```

---

## 6. URL Policy — Security

Claude can only visit domains in the allowed list. Any other URL is blocked before
the browser opens it:

```python
DEFAULT_ALLOWED_DOMAINS = [
    "priceline.com", "www.priceline.com",
    "example.com", "iana.org",
    "booking.com", "www.booking.com",
    "expedia.com", "www.expedia.com",
    "wikipedia.org", "en.wikipedia.org",
    "medium.com", "www.medium.com",
]
```

If Claude tries to navigate to an unlisted domain:
```
ToolError: blocked: evil.com is not on an allowed host
```

Claude reads this error and adapts (tries a different approach or tells the user).

---

## 7. Mobile Integration — Keyword Detection

The mobile app detects browser tasks via regex in `useVedaChat.ts`:

```typescript
const BROWSER_KEYWORDS = /\b(browse|priceline|medium.*login|
  go\s+to\s+\w+\.(?:com|org|net)|go\s+to\s+(?:medium|priceline|booking)|
  log\s*in\s+(?:to|on)\s+\w+|sign\s*in\s+(?:to|on)\s+\w+|...)\b/i;
```

**When matched:** Routes to `startBrowserStream()` → calls `POST /browser/task`

**When a session is active:** ALL follow-up messages route to the browser agent
(via `browserSessionActiveRef`), so the user can reply with an OTP code without
needing to use a keyword.

**When NOT matched:** Routes to the normal Veda chat agent (`POST /chat/stream`).

---

## 8. Directory Structure & Code Modules

```
backend/
├── app/
│   ├── agents/
│   │   └── browser/                        # --- BROWSER AGENT (core) ---
│   │       ├── __init__.py                 #   Package marker
│   │       ├── agent.py                    #   BrowserAgent stub for orchestrator discovery
│   │       ├── driver.py          ~390 ln  #   VedaBrowserDriver — THE single CDP browser driver
│   │       └── manifest.yaml               #   Agent registration (capability: browser)
│   ├── routers/
│   │   └── browser.py             ~250 ln  #   POST /browser/task (SSE), session management
│   └── main.py                             #   Router registration
scripts/
├── browser_test.py                ~100 ln  #   CLI test: python scripts/browser_test.py "task"
├── browser_interactive.py         ~120 ln  #   Multi-turn interactive terminal test
├── start.sh                                #   Start all servers
└── stop.sh                                 #   Stop all servers

mobile/src/
├── hooks/
│   └── useVedaChat.ts                      #   MODIFIED — keyword detection + startBrowserStream()
├── lib/
│   └── api.ts                              #   MODIFIED — streamBrowserTask() SSE client
└── components/
    └── dashboard/
        └── AskVedaButton.tsx               #   MODIFIED — enabled (was hardcoded disabled)

scripts/
├── start.sh                                #   Start all servers (backend + simulator + expo)
└── stop.sh                                 #   Stop all servers

research/
├── Browser-Agent/
│   └── Browser-Agent-Architecture.md       #   This document
└── Browser-Agent-Priceline/
    ├── README.md                           #   Architecture plan & success criteria
    └── SETUP_LOG.md                        #   Build journal — every challenge & resolution
```

**Single source of truth:** The browser driver lives in `app/agents/browser/driver.py`.
The test scripts in `browser_agent/` import from it — no code duplication.

### Backend Modules — Detail

| File | Lines | Purpose |
|---|---|---|
| `app/agents/browser/driver.py` | ~390 | `VedaBrowserDriver(BetaAbstractBrowserToolset20260801)` — launches Chrome, connects via CDP WebSocket, implements 10 browser tools, anti-bot stealth flags, element reference tracking via injected JS. **Single source** — used by both the Veda backend and the standalone test scripts. |
| `app/routers/browser.py` | ~250 | `POST /browser/task` SSE endpoint, `POST /browser/end-session`, persistent session management (`BrowserSession` dataclass), health check + auto-recovery, stale session cleanup |
| `app/agents/browser/agent.py` | ~30 | Stub `BrowserAgent(BaseAgent)` for orchestrator auto-discovery. Actual work happens in the router, not through the orchestrator dispatch |
| `app/agents/browser/manifest.yaml` | ~8 | Agent registration: `name: browser_agent`, `capability: browser`, `priority: 25` |
| `scripts/browser_test.py` | ~100 | CLI test script. Imports `VedaBrowserDriver` from `app.agents.browser.driver`. No duplicate driver code. |
| `scripts/browser_interactive.py` | ~120 | Multi-turn interactive terminal test. Same import. |

### Mobile Modules — Detail

| File | Change | Purpose |
|---|---|---|
| `useVedaChat.ts` | +60 lines | `isBrowserTask()` regex, `startBrowserStream()` handler, `browserSessionActiveRef` for multi-turn routing |
| `api.ts` | +25 lines | `streamBrowserTask()` — SSE client for `POST /browser/task` |
| `AskVedaButton.tsx` | 1 line | Removed `disabled` prop |

---

## 9. Technology Stack

| Technology | Where | Purpose |
|---|---|---|
| **Claude Browser Use SDK** (`browser_toolset_20260801`) | Backend | Gives Claude 27+ browser actions as native tool calls |
| **Anthropic Python SDK** (`anthropic >= 2.0`) | Backend | `tool_runner` manages the agent loop automatically |
| **Chrome DevTools Protocol (CDP)** | Backend ↔ Chrome | WebSocket connection to control the browser |
| **Google Chrome** (headless) | Backend server | Real Chromium browser, launched per session |
| **`websockets`** (Python) | Backend | CDP WebSocket client |
| **FastAPI + SSE** | Backend | Streaming status events to mobile |
| **React Native + Expo** | Mobile | Chat UI |
| **`expo/fetch`** | Mobile | SSE streaming client |

### Why CDP Instead of Playwright?

Playwright's bundled Chromium download failed on this machine (network restriction).
CDP gives us direct control over the system's Google Chrome without any download.
The driver is ~350 lines — simpler than a Playwright dependency.

---

## 10. Claude's Browser Tools — All 27+

Claude has access to these tools. We implement 10 (marked ✅). The SDK automatically
disables the rest and tells Claude they're unavailable:

| Category | Tool | Implemented | Notes |
|---|---|---|---|
| **Navigation** | `navigate` | ✅ | URL, back, forward, reload |
| | `screenshot` | ✅ | PNG capture |
| | `zoom` | ❌ | Cropped region zoom |
| **Pointer** | `left_click` | ✅ | By ref or coordinates |
| | `right_click` | ❌ | |
| | `middle_click` | ❌ | |
| | `double_click` | ❌ | |
| | `triple_click` | ❌ | |
| | `hover` | ❌ | |
| | `left_click_drag` | ❌ | |
| | `left_mouse_down` | ❌ | |
| | `left_mouse_up` | ❌ | |
| | `mouse_move` | ❌ | |
| **Keyboard** | `type` | ✅ | Via `Input.insertText` |
| | `key` | ✅ | Enter, Tab, Escape, etc. |
| **Page** | `read_page` | ✅ | Accessibility tree with refs |
| | `get_page_text` | ✅ | Full body text |
| | `find` | ❌ | Search elements by query |
| **Forms** | `form_input` | ❌ | Fill form field by ref |
| | `scroll` | ✅ | Mouse wheel |
| | `scroll_to` | ❌ | Scroll to element |
| | `select_option` | ❌ | Dropdown selection |
| **Tabs** | `new_tab` | ❌ | |
| | `switch_tab` | ❌ | |
| | `list_tabs` | ❌ | |
| | `close_tab` | ❌ | |
| **Wait** | `wait` | ✅ | 0-30 seconds |
| **Optional** | `javascript_exec` | ❌ | Requires `confirm` callback |
| | `file_upload` | ❌ | Requires `file_policy` |
| | `read_console` | ❌ | |
| | `read_network` | ❌ | |

---

## 11. Challenges Encountered & Resolutions

| # | Challenge | Resolution |
|---|---|---|
| 1 | `anthropic.tools.browser` not available on Python 3.9 | Installed Python 3.12 via `python-build-standalone` (no admin needed), created separate `.venv-browser` |
| 2 | Homebrew blocked (`brew install python` → 403) | Used `python-build-standalone` prebuilt binary from GitHub |
| 3 | Playwright Chromium download failed | Used system Google Chrome via CDP instead |
| 4 | `claude-sonnet-4-6` doesn't support browser toolset | Switched to `claude-sonnet-5-5` |
| 5 | Priceline Cloudflare bot detection | Added stealth flags; still blocked. Documented as known limitation, Browserbase for production |
| 6 | Google "unusual traffic" detection | Same as above — expected for headless browsers |
| 7 | `type()` dropping period characters | Switched from `Input.dispatchKeyEvent` to `Input.insertText` |
| 8 | OTP codes expiring between sessions | Built persistent sessions — Chrome stays open between messages |
| 9 | WebSocket keepalive timeout on idle sessions | Added `_is_session_alive()` health check with auto-recovery |
| 10 | iOS simulator touch not working | Use iOS 26.5 runtime on Xcode 26.x |
| 11 | Expo Go version mismatch | Use `npm ci` (not `npm install`), install Expo Go 57 on iOS 26.5 simulator |
| 12 | `start.sh` booting wrong simulator | Fixed grep to parse iOS 26.5 section of device list |

---

## 12. Test Results

| Test | Site | What Claude Did | Result | Time |
|---|---|---|---|---|
| Standalone | example.com | Navigate, read page, summarize | ✅ Full success | 7.8s |
| Standalone | priceline.com | Navigate, screenshot, detect bot wall | ✅ Honest report | 12.7s |
| Standalone | medium.com (no login) | Navigate, click topics, read trending | ✅ 5 articles returned | 29.0s |
| Standalone | medium.com (login) | Navigate, sign in, enter email, ask for code | ✅ Code prompt reached | 24.7s |
| Standalone | medium.com (login + code) | Full flow: email → code → submit | ✅ Code entered (expired in test) | 38.1s |
| Backend SSE | example.com | Authenticated, streamed, result returned | ✅ Full success | 6.6s |
| Mobile E2E | priceline.com | Chat → browser agent → result in chat | ✅ Bot detection reported | 12.7s |
| Mobile E2E | medium.com | Chat → login → ask for code → enter code | ✅ Multi-turn works | ~40s |

---

## 13. Known Limitations

| Limitation | Impact | Solution Path |
|---|---|---|
| **Bot detection** (Priceline, Google) | Cannot access sites with Cloudflare Turnstile | Browserbase (Anthropic partner) for production |
| **No file upload/download** | Cannot upload documents or download files | Implement `file_upload` tool with `file_policy` |
| **Single tab only** | Cannot open multiple tabs simultaneously | Implement tab management tools |
| **No credential vault** | Credentials passed in plain text via chat | Build secure vault (per the HLD/LLD design doc) |
| **No formal task state machine** | Sessions tracked in-memory dict, no persistence | Add database-backed task states |
| **Server-only browser** | Cannot use user's own cookies/sessions | Hybrid approach: phone WebView + Claude brain |
| **Python 3.12 requirement** | Separate venv needed alongside main 3.9 backend | Upgrade main backend to 3.12 |
| **Model restriction** | Only `claude-sonnet-5-5` supports browser toolset | Anthropic may add support to more models |

---

## 14. What's Next

| Priority | Feature | Effort |
|---|---|---|
| **P0** | Browserbase integration for bot-detection bypass | 1 day |
| **P1** | Implement `screenshot` as primary observation (currently uses `read_page`) | 0.5 day |
| **P2** | Add more tools: `form_input`, `find`, `select_option`, `scroll_to` | 1 day |
| **P3** | Credential vault — secure per-site credential storage | 2 days |
| **P4** | Multi-tab support | 1 day |
| **P5** | Hybrid mode: phone WebView + Claude brain (bypasses all bot detection) | 3 days |
| **P6** | Task state persistence (database-backed, survives server restart) | 2 days |
| **P7** | Formal HITL protocol with question_id routing | 2 days |

---

## 15. For the Presentation

### The One-Liner
> "We built a browser agent where Claude drives a real Chrome browser on our server.
> The user types what they want in chat, Claude navigates real websites, and results
> stream back — no browser visible, no third-party brain, fully autonomous."

### The Three Demo Moments
1. **Medium.com trending articles** — Claude navigates, adapts to login wall, finds
   alternative route, returns real article titles
2. **Medium.com login** — Claude enters email, asks user for OTP in chat, user replies,
   Claude enters code in the same browser session. Full human-in-the-loop.
3. **Priceline honest failure** — Claude hits bot detection, reports it honestly,
   suggests alternatives. This IS the right behavior per the design doc.

### The Competitive Framing
> "No one else has a browser agent embedded in a telecom companion app. OpenAI Operator
> is US-only. Google's is US-centric. Muse is consumer-only. We have the infrastructure
> proven, Claude as the brain, and the system design for production-grade features
> (vault, HITL, takeover) ready to build."
