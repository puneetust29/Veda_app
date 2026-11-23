"""CDP browser driver for the Veda browser agent.

Drives one Chromium tab over the Chrome DevTools Protocol.
Adapted from Anthropic's quickstart with additions for real-world
sites: screenshot, type, key, form_input, scroll.

Emits status events via on_step callback for SSE streaming to mobile.
"""
from __future__ import annotations

import base64
import json
import os
import re
import shutil
import subprocess
import tempfile
import time
from pathlib import Path
from typing import IO, Any, Callable, Optional

from anthropic.tools import ToolError
from anthropic.tools.browser import (
    BetaAbstractBrowserToolset20260801,
    BetaBrowserNavigateResult,
    BetaBrowserState,
    BetaScreenshotResult,
    BetaToolsetCallContext,
    BetaURLContext,
    BetaURLPolicy,
)
from anthropic.types.beta import (
    BetaBrowserGetPageTextInput,
    BetaBrowserKeyInput,
    BetaBrowserLeftClickInput,
    BetaBrowserNavigateInput,
    BetaBrowserReadPageInput,
    BetaBrowserScreenshotInput,
    BetaBrowserScrollInput,
    BetaBrowserTypeInput,
    BetaBrowserWaitInput,
)
from typing_extensions import override
from websockets.sync.client import connect
from urllib.parse import urlsplit

COMMAND_TIMEOUT_S = 30
TAB_ID = "tab_1"


def find_chrome() -> str:
    """Find Chrome/Chromium on this system."""
    configured = os.environ.get("CHROME_PATH")
    if configured:
        return configured
    mac_chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
    if os.path.exists(mac_chrome):
        return mac_chrome
    for name in ("google-chrome", "google-chrome-stable", "chromium", "chromium-browser"):
        found = shutil.which(name)
        if found:
            return found
    raise RuntimeError("No Chrome binary found. Set CHROME_PATH.")


def make_url_policy(allowed_domains: list[str]) -> BetaURLPolicy:
    """Create a URL policy that allows only the specified domains and subdomains."""
    hosts = [h.strip().lower().rstrip(".") for h in allowed_domains if h.strip()]

    def policy(_ctx: BetaURLContext, url: str) -> None:
        if url.lower() == "about:blank":
            return
        with_scheme = url if re.match(r"[a-z][a-z0-9+.-]*:", url, re.I) else f"https://{url}"
        try:
            parts = urlsplit(with_scheme.replace("\\", "/"))
        except ValueError:
            raise ToolError(f"blocked: {url} could not be parsed") from None
        host = (parts.hostname or "").lower()
        on_allowed = any(host == a or host.endswith("." + a) for a in hosts)
        if parts.scheme not in ("http", "https") or not on_allowed:
            raise ToolError(f"blocked: {url} is not on an allowed host")

    return policy


class VedaBrowserDriver(BetaAbstractBrowserToolset20260801):
    """CDP-driven browser for the Veda platform."""

    def __init__(
        self,
        *,
        headless: bool = True,
        on_step: Optional[Callable[[str], None]] = None,
        allowed_domains: Optional[list[str]] = None,
        **options: Any,
    ) -> None:
        if allowed_domains and "url_policy" not in options:
            options["url_policy"] = make_url_policy(allowed_domains)
        super().__init__(**options)

        self._process: subprocess.Popen[bytes] | None = None
        self._profile_dir: str | None = None
        self._log: IO[bytes] | None = None
        self._socket: Any | None = None
        self._session_id = ""
        self._next_id = 1
        self._events: list[dict[str, Any]] = []
        self._on_step = on_step or (lambda msg: None)

        try:
            self._connect(self._launch(headless))
        except BaseException:
            self.close()
            raise

    def _launch(self, headless: bool) -> str:
        binary = find_chrome()
        self._profile_dir = tempfile.mkdtemp(prefix="veda-browser-")
        self._log = open(Path(self._profile_dir) / "chrome.log", "w+b")
        self._process = subprocess.Popen(
            [
                binary,
                *(["--headless=new"] if headless else []),
                "--remote-debugging-port=0",
                f"--user-data-dir={self._profile_dir}",
                "--no-first-run",
                "--no-default-browser-check",
                "--disable-background-networking",
                "--disable-extensions",
                "--disable-sync",
                "--window-size=1280,800",
                # Anti-bot-detection flags
                "--disable-blink-features=AutomationControlled",
                "--disable-features=IsolateOrigins,site-per-process",
                "--disable-infobars",
                f"--user-agent=Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
                *(["--no-sandbox"] if hasattr(os, "geteuid") and os.geteuid() == 0 else []),
                "about:blank",
            ],
            stdout=subprocess.DEVNULL,
            stderr=self._log,
        )
        port_file = Path(self._profile_dir) / "DevToolsActivePort"
        deadline = time.monotonic() + 20
        while time.monotonic() < deadline:
            if port_file.exists():
                lines = port_file.read_text().split("\n")
                if len(lines) >= 2 and lines[0].strip().isdigit() and lines[1].startswith("/"):
                    return f"ws://127.0.0.1:{lines[0].strip()}{lines[1].strip()}"
            if self._process.poll() is not None:
                break
            time.sleep(0.05)
        self._log.seek(0)
        output = self._log.read().decode(errors="replace").strip()
        raise RuntimeError(f"Chrome did not start: {output.splitlines()[-1] if output else 'no output'}")

    def _connect(self, ws_url: str) -> None:
        self._socket = connect(ws_url, max_size=None, proxy=None)
        target_id = self._send("Target.createTarget", {"url": "about:blank"})["targetId"]
        self._session_id = self._send("Target.attachToTarget", {"targetId": target_id, "flatten": True})["sessionId"]
        self._send("Page.enable")
        self._send("Page.setLifecycleEventsEnabled", {"enabled": True})
        self._send("Runtime.enable")
        # Remove navigator.webdriver flag that bot detectors check
        self._send("Page.addScriptToEvaluateOnNewDocument", {
            "source": """
                Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
                Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
                Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
                window.chrome = { runtime: {} };
            """
        })

    @override
    def close(self) -> None:
        super().close()
        if self._socket is not None:
            try:
                self._send("Browser.close")
            except Exception:
                pass
            self._socket.close()
            self._socket = None
        if self._process is not None:
            self._process.terminate()
            try:
                self._process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self._process.kill()
            self._process = None
        if self._log is not None:
            self._log.close()
            self._log = None
        if self._profile_dir is not None:
            shutil.rmtree(self._profile_dir, ignore_errors=True)
            self._profile_dir = None

    def _send(self, method: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
        assert self._socket is not None
        msg_id = self._next_id
        self._next_id += 1
        cmd: dict[str, Any] = {"id": msg_id, "method": method, "params": params or {}}
        if self._session_id and not method.startswith(("Target.", "Browser.")):
            cmd["sessionId"] = self._session_id
        self._socket.send(json.dumps(cmd))
        deadline = time.monotonic() + COMMAND_TIMEOUT_S
        try:
            while True:
                message = self._receive(deadline)
                if message.get("id") != msg_id:
                    continue
                if "error" in message:
                    raise ToolError(f"{method} failed: {message['error'].get('message', 'unknown')}")
                return message.get("result", {})
        except TimeoutError:
            raise ToolError(f"{method} timed out") from None

    def _receive(self, deadline: float) -> dict[str, Any]:
        assert self._socket is not None
        raw = self._socket.recv(timeout=max(0.0, deadline - time.monotonic()))
        message: dict[str, Any] = json.loads(raw)
        if message.get("method") == "Page.lifecycleEvent" and message["params"].get("name") == "DOMContentLoaded":
            self._events.append(message)
        return message

    def _evaluate(self, expression: str) -> Any:
        result = self._send("Runtime.evaluate", {"expression": expression, "returnByValue": True})
        if "exceptionDetails" in result:
            details = result["exceptionDetails"].get("exception", {}).get("description") or "error"
            raise ToolError(f"page script failed: {details}")
        return result.get("result", {}).get("value")

    def _page_info(self) -> tuple[str, str]:
        info = self._evaluate("({ url: location.href, title: document.title })") or {}
        return str(info.get("url", "about:blank")), str(info.get("title", ""))

    # ── Tool implementations ─────────────────────────────────────────────

    @override
    def navigate(self, context: BetaToolsetCallContext, input: BetaBrowserNavigateInput) -> BetaBrowserNavigateResult:
        if input.url in ("back", "forward", "reload"):
            self._evaluate({"back": "history.back()", "forward": "history.forward()"}.get(input.url, "location.reload()"))
            time.sleep(1)
            url, title = self._page_info()
            self._on_step(f"Navigated: {input.url}")
            return BetaBrowserNavigateResult(url=url, title=title or None)

        url = input.url if re.match(r"[a-z][a-z0-9+.-]*:", input.url, re.I) else f"https://{input.url}"
        self._events.clear()
        self._on_step(f"Navigating to {url}")
        started = self._send("Page.navigate", {"url": url})
        if started.get("errorText"):
            raise ToolError(f"navigate failed: {started['errorText']}")
        loader_id = started.get("loaderId")
        if loader_id is not None:
            deadline = time.monotonic() + COMMAND_TIMEOUT_S
            try:
                while not any(e["params"].get("loaderId") == loader_id for e in self._events):
                    self._receive(deadline)
            except TimeoutError:
                raise ToolError(f"page did not load within {COMMAND_TIMEOUT_S}s") from None
        self._events.clear()
        url, title = self._page_info()
        self._on_step(f"Loaded: {title or url}")
        return BetaBrowserNavigateResult(url=url, title=title or None)

    @override
    def screenshot(self, context: BetaToolsetCallContext, input: BetaBrowserScreenshotInput) -> BetaScreenshotResult:
        self._on_step("Taking screenshot")
        result = self._send("Page.captureScreenshot", {"format": "png"})
        return BetaScreenshotResult(image=base64.b64decode(result["data"]))

    @override
    def read_page(self, context: BetaToolsetCallContext, input: BetaBrowserReadPageInput) -> str:
        self._on_step("Reading page")
        return self._evaluate(READ_PAGE) or ""

    @override
    def left_click(self, context: BetaToolsetCallContext, input: BetaBrowserLeftClickInput) -> None:
        if input.target.type == "ref":
            point = self._evaluate(RESOLVE_REF % json.dumps(input.target.ref))
            if not point:
                raise ToolError(f"Unknown ref: {input.target.ref}. Call read_page again.")
            x, y = point["x"], point["y"]
            self._on_step(f"Clicking {input.target.ref}")
        else:
            x, y = input.target.x, input.target.y
            self._on_step(f"Clicking ({x}, {y})")
        self._send("Input.dispatchMouseEvent", {"type": "mouseMoved", "x": x, "y": y})
        for kind in ("mousePressed", "mouseReleased"):
            self._send("Input.dispatchMouseEvent", {"type": kind, "x": x, "y": y, "button": "left", "clickCount": 1})
        time.sleep(0.3)

    @override
    def type(self, context: BetaToolsetCallContext, input: BetaBrowserTypeInput) -> None:
        text = input.text
        self._on_step(f"Typing '{text[:30]}{'...' if len(text) > 30 else ''}'")
        # Use insertText for reliable character entry — handles all characters
        # including periods, @, special chars that keyDown/keyUp may drop
        for char in text:
            self._send("Input.insertText", {"text": char})
            time.sleep(0.02)

    @override
    def key(self, context: BetaToolsetCallContext, input: BetaBrowserKeyInput) -> None:
        key_map = {
            "Enter": {"key": "Enter", "code": "Enter", "windowsVirtualKeyCode": 13},
            "Tab": {"key": "Tab", "code": "Tab", "windowsVirtualKeyCode": 9},
            "Escape": {"key": "Escape", "code": "Escape", "windowsVirtualKeyCode": 27},
            "Backspace": {"key": "Backspace", "code": "Backspace", "windowsVirtualKeyCode": 8},
            "ArrowDown": {"key": "ArrowDown", "code": "ArrowDown", "windowsVirtualKeyCode": 40},
            "ArrowUp": {"key": "ArrowUp", "code": "ArrowUp", "windowsVirtualKeyCode": 38},
        }
        info = key_map.get(input.key, {"key": input.key, "code": input.key, "windowsVirtualKeyCode": 0})
        self._on_step(f"Pressing {input.key}")
        self._send("Input.dispatchKeyEvent", {"type": "keyDown", **info})
        self._send("Input.dispatchKeyEvent", {"type": "keyUp", **info})
        time.sleep(0.1)

    @override
    def scroll(self, context: BetaToolsetCallContext, input: BetaBrowserScrollInput) -> None:
        coord = input.target
        if coord.type == "ref":
            point = self._evaluate(RESOLVE_REF % json.dumps(coord.ref))
            if not point:
                raise ToolError(f"Unknown ref: {coord.ref}")
            x, y = point["x"], point["y"]
        else:
            x, y = coord.x, coord.y
        delta_x = getattr(input, "delta_x", 0) or 0
        delta_y = getattr(input, "delta_y", -300) or -300
        self._on_step("Scrolling")
        self._send("Input.dispatchMouseEvent", {"type": "mouseWheel", "x": x, "y": y, "deltaX": delta_x, "deltaY": delta_y})
        time.sleep(0.3)

    @override
    def get_page_text(self, context: BetaToolsetCallContext, input: BetaBrowserGetPageTextInput) -> str:
        self._on_step("Reading page text")
        return self._evaluate("document.body ? document.body.innerText : ''") or ""

    @override
    def wait(self, context: BetaToolsetCallContext, input: BetaBrowserWaitInput) -> None:
        if not 0 <= input.duration <= 30:
            raise ToolError("duration: must be between 0 and 30 seconds")
        self._on_step(f"Waiting {input.duration}s")
        time.sleep(input.duration)

    @override
    def _browser_state(self, context: BetaToolsetCallContext) -> BetaBrowserState:
        try:
            url, title = self._page_info()
        except Exception:
            url, title = "about:blank", ""
        return BetaBrowserState(tabs=[{"tab_id": TAB_ID, "url": url, "title": title, "active": True}])


# ── JavaScript helpers ───────────────────────────────────────────────────

READ_PAGE = """(() => {
    const refs = (window.__refs ||= { next: 1, byRef: new Map(), byElement: new WeakMap() });
    const roles = { A: 'link', BUTTON: 'button', INPUT: 'textbox', SELECT: 'combobox', TEXTAREA: 'textbox' };
    const name = (el) => (el.getAttribute('aria-label') || el.innerText || el.value || el.placeholder || '')
        .trim().replace(/\\s+/g, ' ').slice(0, 80);
    const lines = [];
    const selector = 'h1, h2, h3, a[href], button, input, select, textarea, [role=button], [role=link], [role=tab], label';
    for (const el of document.querySelectorAll(selector)) {
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) continue;
        let ref = refs.byElement.get(el);
        if (!ref) { ref = 'ref_' + refs.next++; refs.byElement.set(el, ref); refs.byRef.set(ref, el); }
        const role = el.getAttribute('role') || roles[el.tagName] || 'heading';
        const extra = [];
        if (el.tagName === 'INPUT') {
            extra.push('type="' + (el.type || 'text') + '"');
            if (el.placeholder) extra.push('placeholder="' + el.placeholder + '"');
        }
        lines.push('- ' + role + ' "' + name(el) + '" [' + ref + ']' + (extra.length ? ' (' + extra.join(', ') + ')' : ''));
    }
    return lines.join('\\n');
})()"""

RESOLVE_REF = """((ref) => {
    const el = window.__refs && window.__refs.byRef.get(ref);
    if (!el || !el.isConnected) return null;
    el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
})(%s)"""
