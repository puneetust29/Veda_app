# Browser Agent — Priceline Integration

**Branch:** `feature/browser-agent-priceline`
**Date:** November 2026
**Goal:** Build a browser agent that can navigate Priceline.com on behalf of the user — search flights, hotels, compare prices — using Claude's official Browser Use SDK.

---

## 1. What We're Building

A chat-driven browser agent where:
- User types a travel task in VedaChat (e.g. "Find me hotels in Tokyo on Priceline")
- Claude drives a **headless Chromium** on the server via Playwright/CDP
- Claude sees the page (screenshots + accessibility tree), decides what to click/type
- Status updates stream back to the user's chat in real time
- Results (hotels, flights, prices) are returned as structured chat messages
- **The user never sees a browser** — just chat

---

## 2. Technology: Claude Browser Use SDK

### What it is
Anthropic's official toolset (`browser_toolset_20260801`) that gives Claude 27+ browser actions as native tool calls. Claude calls `navigate`, `read_page`, `left_click`, `type`, `screenshot`, etc. — our code executes them in a real browser.

### How it works
```
┌──────────────┐     API calls      ┌──────────────────┐
│   Claude     │◄──────────────────►│   Our Backend    │
│   (the brain)│  tool_use/result   │                  │
│              │                    │  ┌────────────┐  │
│  Decides:    │                    │  │ Chromium   │  │
│  - navigate  │                    │  │ (headless) │  │
│  - click     │                    │  │            │  │
│  - type      │                    │  │ Playwright │  │
│  - read_page │                    │  │ or CDP     │  │
│  - screenshot│                    │  └────────────┘  │
└──────────────┘                    └──────────────────┘
```

### Key SDK components
| Component | What it does |
|---|---|
| `BetaAbstractBrowserToolset20260801` | Base class — subclass it to implement your driver |
| `tool_runner` | Runs the agent loop automatically (Claude ↔ browser) |
| `url_policy` | Controls which URLs Claude can visit |
| `configs` | Enable/disable individual browser actions |
| `confirm` | Gate consequential actions (optional human approval) |

### Member tools Claude gets (27 default + 4 optional)
| Category | Tools |
|---|---|
| **Navigation** | `navigate`, `screenshot`, `zoom` |
| **Pointer** | `left_click`, `right_click`, `middle_click`, `double_click`, `triple_click`, `hover`, `left_click_drag`, `left_mouse_down`, `left_mouse_up`, `mouse_move` |
| **Keyboard** | `type`, `key` |
| **Page reading** | `read_page`, `get_page_text`, `find` |
| **Forms** | `form_input`, `scroll`, `scroll_to`, `select_option` |
| **Tabs** | `new_tab`, `switch_tab`, `list_tabs`, `close_tab` |
| **Wait** | `wait` |
| **Optional** | `javascript_exec`, `file_upload`, `read_console`, `read_network` |

### Two targeting modes
1. **Element references** — `read_page` returns elements tagged as `[ref_1]`, `[ref_2]`, etc. Claude can click `ref_2` by name. More reliable than coordinates.
2. **Viewport coordinates** — Claude sees a screenshot and clicks at pixel (x, y). Fallback for canvas/iframe content.

---

## 3. Architecture for Veda

### Backend
```
backend/app/
├── agents/
│   └── browser/                    # NEW — browser agent
│       ├── __init__.py
│       ├── agent.py                # BrowserAgent(BaseAgent) — entry point
│       ├── driver.py               # PricelineBrowserDriver — Playwright-based driver
│       ├── manifest.yaml           # Agent registration (capability: "browser")
│       ├── prompts.py              # System prompts for Priceline tasks
│       └── state.py                # BrowserAgentState
├── routers/
│   └── browser.py                  # NEW — POST /browser/task (SSE endpoint)
```

### Mobile
```
mobile/src/
├── hooks/
│   └── useVedaChat.ts              # MODIFY — add "priceline"/"browse" keyword detection
├── components/chat/
│   └── ChatItemView.tsx            # MODIFY — render browser status events
```

### Data Flow
```
Mobile (VedaChat)
    │ POST /chat/stream { message: "Find hotels in Tokyo on Priceline", capability: "browser" }
    │
    ▼
Backend (conversation.py → orchestrator → BrowserAgent)
    │
    │ 1. Launch Playwright Chromium (headless)
    │ 2. Create CdpBrowser/PlaywrightDriver instance
    │ 3. Build tool_runner with Claude + browser toolset
    │ 4. Run the loop:
    │    Claude: "navigate to priceline.com"     → emit SSE status
    │    Claude: "read_page"                     → emit SSE status
    │    Claude: "left_click ref_3 (Hotels)"     → emit SSE status
    │    Claude: "type 'Tokyo' in search"        → emit SSE status
    │    Claude: "read_page" → extract results   → emit SSE results
    │    Claude: final text answer               → emit SSE done
    │
    ▼
Mobile receives SSE events, renders in chat
```

---

## 4. Implementation Plan

### Phase 1: Backend — Browser Driver (standalone test first)
1. Install dependencies: `anthropic>=2.0`, `playwright`, `websockets`
2. Install Chromium: `playwright install chromium`
3. Write `driver.py` — Playwright-based browser driver implementing:
   - `navigate` — load URLs
   - `screenshot` — capture viewport as PNG
   - `read_page` — return accessibility tree with refs
   - `left_click` — click by ref or coordinates
   - `type` — type text into focused element
   - `form_input` — fill form fields
   - `scroll` — scroll the page
   - `get_page_text` — full page text
   - `wait` — pause
   - `_browser_state` — report tab state
4. Write standalone test script: `python test_browser.py "Search for hotels in Tokyo on priceline.com"`
5. **Verify it works before integrating with Veda**

### Phase 2: Backend — Veda Integration
1. Write `agent.py` — BrowserAgent extending BaseAgent
2. Write `routers/browser.py` — SSE endpoint for browser tasks
3. Wire into orchestrator via `manifest.yaml`
4. Stream status events back through existing chat SSE infrastructure

### Phase 3: Mobile — Chat Integration
1. Add keyword detection in `useVedaChat.ts` for browser/priceline tasks
2. Render browser status updates in chat (reuse existing status rendering)
3. Test end-to-end: type message → see browser progress → get results

---

## 5. URL Policy for Priceline

```python
ALLOWED_DOMAINS = [
    "priceline.com",       # Main site
    "www.priceline.com",   # WWW variant
]
```

For the POC, we restrict Claude to Priceline only. No other sites.

---

## 6. What the User Experiences

```
User: "Find me a hotel in Tokyo for Dec 15-22 on Priceline"

Chat: 🌐 Opening Priceline...
Chat: 🔍 Searching for hotels in Tokyo...
Chat: ⌨️ Setting dates: Dec 15 - Dec 22
Chat: 📖 Reading search results...
Chat: ✅ Found hotels in Tokyo (Dec 15-22):

      1. Shinjuku Granbell Hotel
         ⭐ 4.2 | $89/night | Total: $623
         Free cancellation

      2. Hotel Gracery Shinjuku
         ⭐ 4.5 | $120/night | Total: $840
         Breakfast included

      3. Park Hyatt Tokyo
         ⭐ 4.8 | $450/night | Total: $3,150
         Luxury pick

      Want me to look at details for any of these?
```

---

## 7. Requirements

| Requirement | Status |
|---|---|
| `anthropic` Python SDK >= 2.0 (with `anthropic.tools.browser`) | 📦 Need to install |
| Playwright + Chromium | 📦 Need to install |
| `websockets` (for CDP) | 📦 Need to install |
| `ANTHROPIC_API_KEY` with browser use support | 🔑 Need from user |
| Model: `claude-sonnet-5-5` or newer | ✅ Supported |
| Backend: FastAPI + SSE streaming | ✅ Already on develop |
| Mobile: VedaChat + ChatItemView | ✅ Already on develop |

---

## 8. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Priceline blocks headless browsers | Use realistic viewport (1280x720), standard UA, consider Browserbase if needed |
| Claude gets stuck on complex pages | Max iteration limit (30 steps), timeout per task (120s), graceful failure |
| CAPTCHAs / bot detection | Report honestly to user, suggest manual alternative |
| Credential security | Never log passwords, inject at point of use only, never send to Claude in prompts |
| Slow response (Claude + browser round-trips) | Stream status updates so user sees progress, not a blank wait |
| Token cost (screenshots are expensive) | Use `read_page` (text) over `screenshot` (image) when possible |

---

## 9. What Makes This Different From Grocery/Uber

| | Grocery (Pepesto) | Uber (uber-mcp) | Priceline (Claude Browser Use) |
|---|---|---|---|
| **Who is the brain?** | Pepesto (third-party) | uber-mcp (third-party) | **Claude (our LLM)** |
| **Who drives the browser?** | Pepesto's JS / our WebView | uber-mcp's Chromium | **Our Playwright, Claude decides** |
| **Third-party dependency?** | Yes — Pepesto API | Yes — uber-mcp | **No — just Claude API** |
| **Works on any website?** | No — 25 supermarkets only | No — Uber login only | **Yes — any website** |
| **Our IP?** | Infrastructure only | Orchestration only | **Full stack — brain + hands** |

---

## 10. Success Criteria for Demo

- [ ] Claude navigates to priceline.com successfully
- [ ] Claude searches for hotels in a destination
- [ ] Claude reads and returns search results with prices
- [ ] Status updates stream to mobile chat in real time
- [ ] End-to-end: user types in VedaChat → sees results in chat
- [ ] No browser visible to the user — chat only
- [ ] Completes within 60 seconds

---

## 11. References

- [Claude Browser Use SDK](https://platform.claude.com/docs/en/agents-and-tools/tool-use/browser-use-sdk)
- [Claude Browser Use Tool](https://platform.claude.com/docs/en/agents-and-tools/tool-use/browser-use-tool)
- [Anthropic Quickstart — CDP Browser Driver](https://github.com/anthropics/claude-quickstarts/tree/main/browser-toolset)
- [Browser Use Partner Integration](https://github.com/browser-use/browser-use/tree/main/examples/integrations/toolsets-for-claude)
- [Browserbase Stagehand Driver](https://github.com/browserbase/claude-cua-toolset)
