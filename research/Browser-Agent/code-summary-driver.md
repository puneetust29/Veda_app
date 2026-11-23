# driver.py -- Code Summary

**File:** `backend/app/agents/browser/driver.py`
**Lines:** ~390
**Purpose:** The hands of the browser agent. Launches Chrome, connects via CDP, and executes Claude's browser commands.

---

## What This File Does

This is the single browser driver for the entire project. When Claude says "click this button" or "type this text", this file is what actually makes it happen in Chrome.

It is a subclass of Anthropic's `BetaAbstractBrowserToolset20260801` -- the official base class for Claude's Browser Use SDK. By overriding methods like `navigate`, `left_click`, `type`, etc., we tell the SDK how to execute each browser action in our Chrome instance.

---

## Key Parts

### 1. find_chrome()

Finds the Chrome binary on the system. Checks:
- `CHROME_PATH` environment variable (explicit override)
- `/Applications/Google Chrome.app` (macOS default)
- `google-chrome`, `chromium` on PATH (Linux)

If none found, raises an error.

### 2. make_url_policy(allowed_domains)

Creates a security gate. Before Claude can navigate to any URL, this function checks if the domain is in the allowed list. If not, it raises `ToolError` and Claude sees "blocked: X is not on an allowed host".

This prevents Claude from visiting malicious or unintended sites.

### 3. VedaBrowserDriver class

The main class. Lifecycle:

```
__init__()
    |
    v
_launch() -- starts Chrome as a subprocess
    |        creates a temp profile directory
    |        waits for Chrome to write its WebSocket address
    |        returns the WebSocket URL
    v
_connect() -- opens WebSocket to Chrome
    |         creates a new browser tab
    |         enables CDP domains (Page, Runtime)
    |         injects anti-bot-detection JavaScript
    v
Ready to receive tool calls from Claude
    |
    v
close() -- sends Browser.close to Chrome
           terminates the process
           deletes the temp profile
```

### 4. CDP Communication

Two core methods that everything else uses:

**_send(method, params)** -- Sends a CDP command and waits for the response.
Example: `self._send("Page.navigate", {"url": "https://medium.com"})`

The method assigns an incrementing ID to each message, sends it as JSON over WebSocket, and waits for a response with the matching ID. Times out after 30 seconds.

**_evaluate(expression)** -- Runs JavaScript in the page and returns the result.
Example: `self._evaluate("document.title")` returns `"Medium"`

Internally calls `Runtime.evaluate` via `_send`.

### 5. Tool Implementations (10 methods)

Each method is called by Claude via the SDK. Our code translates Claude's request into CDP commands:

**navigate(url):**
- If "back"/"forward"/"reload": runs `history.back()` etc. via JavaScript
- Otherwise: calls `Page.navigate` with the URL
- Waits for `DOMContentLoaded` lifecycle event (page parsed, not fully loaded)
- Returns the final URL and page title

**screenshot():**
- Calls `Page.captureScreenshot` with format "png"
- Returns the raw PNG bytes
- Claude sees this as an image and can reason about visual layout

**read_page():**
- Runs the READ_PAGE JavaScript (see section 6)
- Returns a text list of all interactive elements with ref tags
- This is how Claude "sees" buttons, links, inputs without a screenshot

**left_click(target):**
- If target is a ref (like "ref_5"): runs RESOLVE_REF JavaScript to find the element's x,y position, scrolls it into view
- If target is coordinates: uses them directly
- Sends three CDP mouse events: mouseMoved, mousePressed, mouseReleased
- Waits 0.3s for the page to react

**type(text):**
- Uses `Input.insertText` for each character
- This was changed from `Input.dispatchKeyEvent` because keyDown/keyUp was dropping period characters in email addresses
- 0.02s delay between characters to simulate human typing

**key(key_name):**
- Maps key names (Enter, Tab, Escape, Backspace, ArrowDown, ArrowUp) to their virtual key codes
- Sends keyDown + keyUp CDP events

**scroll(target, delta):**
- Finds the scroll position (by ref or coordinates)
- Sends a mouseWheel event with the scroll delta

**get_page_text():**
- Returns `document.body.innerText` -- all visible text on the page
- Simpler than read_page but no element references

**wait(duration):**
- Sleeps for 0-30 seconds
- Claude uses this to wait for page transitions or animations

**_browser_state():**
- Called by the SDK after every tool execution
- Returns the current tab's URL and title
- Claude uses this to track where the browser is

### 6. JavaScript Helpers

Two JavaScript snippets injected into pages:

**READ_PAGE:** Scans the DOM for all interactive elements:
- Queries: `h1, h2, h3, a[href], button, input, select, textarea, [role=button], [role=link], [role=tab], label`
- Skips elements with zero width/height (hidden)
- Assigns each visible element a unique `ref_N` tag
- Stores the mapping in `window.__refs` so refs survive between calls
- Returns a text list like:
  ```
  - link "Sign in" [ref_5]
  - textbox "" [ref_37] (type="email", placeholder="Your email")
  ```

**RESOLVE_REF:** Given a ref tag, finds the element, scrolls it into view, and returns its center coordinates:
- Looks up the ref in `window.__refs.byRef`
- Calls `scrollIntoView` to make sure it's visible
- Returns `{x: centerX, y: centerY}` from `getBoundingClientRect()`
- Returns null if the element is gone (stale ref)

### 7. Anti-Bot-Detection

Two layers:

**Chrome launch flags:**
- `--disable-blink-features=AutomationControlled` -- removes the "controlled by automated software" banner
- Realistic user-agent string (Chrome 131 on macOS)
- `--disable-infobars` -- hides automation info bars

**Injected JavaScript (runs on every new page):**
- `navigator.webdriver = undefined` -- hides the automation flag that bot detectors check
- `navigator.plugins = [1,2,3,4,5]` -- fakes plugin list (headless Chrome has empty plugins)
- `navigator.languages = ['en-US', 'en']` -- realistic language list
- `window.chrome = { runtime: {} }` -- fakes the Chrome extension API object

Enough for sites like Medium. Not enough for Cloudflare Turnstile (Priceline, Google).

---

## Dependencies

| Import | Purpose |
|---|---|
| `anthropic.tools.browser.BetaAbstractBrowserToolset20260801` | Base class from Claude's Browser Use SDK |
| `anthropic.tools.ToolError` | Error type that Claude reads and adapts to |
| `websockets.sync.client.connect` | WebSocket connection to Chrome's CDP |
| `subprocess` | Launch Chrome process |
| `base64` | Decode screenshot data |
| `json` | CDP message serialization |
