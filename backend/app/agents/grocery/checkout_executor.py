"""
Playwright-based automated checkout executor for Pepesto's /checkout API.

The Pepesto /checkout API is a turn-based browser automation protocol:
  1. POST /checkout with session_id + screenshot → get Instruction
  2. Execute the Instruction in a real browser (Playwright)
  3. Take a screenshot → POST /checkout again with result + screenshot
  4. Repeat until a Done/Error terminal instruction is received

This module uses Playwright's synchronous API to match the blocking execution
model used by the rest of Veda's agents.
"""
from __future__ import annotations

import base64
import json
import logging
import os
import time
from typing import Callable, Optional

from app.agents.grocery.pepesto_client import PepetoClient
from app.config import get_settings

logger = logging.getLogger(__name__)

MAX_ITERATIONS = 40
SCREENSHOT_MAX_WAIT_SEC = 5.0


def _screenshot_b64(page) -> str:
    """Capture a compressed JPEG screenshot (960×600, quality 70) and return base64.
    Smaller size speeds up Pepesto's vision processing significantly. Never raises."""
    try:
        # JPEG is ~10x smaller than PNG for typical web pages
        data = page.screenshot(type="jpeg", quality=70, full_page=False,
                               clip={"x": 0, "y": 0, "width": 1280, "height": 800})
        b64 = base64.b64encode(data).decode("utf-8")
        logger.info("[checkout_exec] screenshot captured | size=%d bytes (b64=%d chars)", len(data), len(b64))
        return b64
    except Exception as e:
        logger.warning("[checkout_exec] screenshot failed: %r", e)
        return ""


class CheckoutExecutor:
    """
    Drives the Pepesto /checkout API loop using a headless Playwright browser.

    Args:
        session_id:  The Pepesto session_id returned by /session.
        client:      An authenticated PepetoClient instance.
        supermarket: Supermarket domain (e.g. "asda.com"), used to detect login pages.
        on_event:    Optional callback invoked with {"kind": ..., "text": ...}
                     events so callers can stream progress back to users.
    """

    def __init__(
        self,
        session_id: str,
        client: PepetoClient,
        supermarket: str = "asda.com",
        on_event: Optional[Callable[[dict], None]] = None,
    ) -> None:
        self.session_id = session_id
        self.client = client
        self.supermarket = supermarket
        self.on_event = on_event or (lambda e: None)
        settings = get_settings()
        self._creds: dict[str, str] = {
            "asda.com": {"email": settings.asda_email, "password": settings.asda_password},
        }.get(supermarket, {})
        # Path to Playwright storage_state JSON saved by save_asda_session.py
        raw_path = settings.asda_auth_state_path
        if raw_path and not os.path.isabs(raw_path):
            # Resolve relative to backend/
            raw_path = os.path.join(os.path.dirname(__file__), "..", "..", "..", raw_path)
            raw_path = os.path.normpath(raw_path)
        self._auth_state_path: str = raw_path if raw_path and os.path.exists(raw_path) else ""

    def _emit(self, text: str, kind: str = "status") -> None:
        logger.info("[checkout_exec] %s", text)
        self.on_event({"kind": kind, "text": text})

    def _credential(self, field_hint: str) -> str:
        """Return the stored credential matching the field hint, or empty string."""
        hint = field_hint.lower()
        if any(kw in hint for kw in ("email", "username", "user", "login")):
            return self._creds.get("email", "")
        if any(kw in hint for kw in ("password", "pass", "pwd")):
            return self._creds.get("password", "")
        return ""

    def _maybe_dismiss_cookies(self, page) -> bool:
        """Click the cookie consent 'Accept' button using Playwright native click.
        Returns True if a button was found and clicked."""
        for sel in (
            "#onetrust-accept-btn-handler",
            "button[id*='accept'][id*='all']",
            "button[aria-label*='Accept all']",
        ):
            try:
                page.click(sel, timeout=3_000)
                logger.info("[checkout_exec] dismissed cookie consent via: %s", sel)
                time.sleep(1)
                return True
            except Exception:
                continue
        return False

    def _maybe_autofill_login(self, page) -> bool:
        """
        If we detect a supermarket login page, inject credentials via JavaScript
        and submit the form. Returns True if we submitted a form.

        Uses JS injection because the login form is React-rendered and may not
        be accessible via Playwright element selectors at domcontentloaded time.
        Polls for up to 8 seconds for the form to appear.
        """
        if not self._creds:
            return False
        url = page.url or ""
        # Detect known supermarket login hosts/paths
        login_signals = ("login.asda.com", "sign-in", "signin", "login", "account/login", "account/signin")
        if not any(kw in url.lower() for kw in login_signals):
            return False

        email = self._creds.get("email", "")
        password = self._creds.get("password", "")
        if not email or not password:
            return False

        self._emit("Detecting login form…")

        # First try: Playwright native fill — handles React controlled inputs correctly
        for email_sel, pass_sel in [
            ("#signInName", "#password"),
            ("input[type='email']", "input[type='password']"),
        ]:
            try:
                page.fill(email_sel, email, timeout=15_000)
                page.fill(pass_sel, password, timeout=5_000)
                time.sleep(0.5)
                for btn_sel in ("#next", "button[type='submit']", "button#signIn"):
                    try:
                        page.click(btn_sel, timeout=3_000)
                        logger.info("[checkout_exec] autofill: clicked %s", btn_sel)
                        break
                    except Exception:
                        continue
                time.sleep(6)
                try:
                    page.wait_for_load_state("networkidle", timeout=10_000)
                except Exception:
                    pass
                self._emit("Login submitted — waiting for redirect…")
                return True
            except Exception as e:
                logger.debug("[checkout_exec] native fill %s failed: %r", email_sel, e)
                continue

        # Fallback: JS injection
        # Build the JS to poll for the form, fill it, and submit
        fill_js = f"""
async () => {{
    // Poll up to 10s for the email/password inputs to appear
    let el_email = null, el_pass = null;
    const EMAIL_SELECTORS = ['#signInName', '#email', 'input[type="email"]', 'input[name="Email or phone number"]', 'input[id*="email"]'];
    const PASS_SELECTORS  = ['#password', 'input[type="password"]', 'input[name="password"]', 'input[id*="pass"]'];
    for (let i = 0; i < 20; i++) {{
        for (const sel of EMAIL_SELECTORS) {{
            const el = document.querySelector(sel);
            if (el && el.offsetParent !== null) {{ el_email = el; break; }}
        }}
        for (const sel of PASS_SELECTORS) {{
            const el = document.querySelector(sel);
            if (el && el.offsetParent !== null) {{ el_pass = el; break; }}
        }}
        if (el_email && el_pass) break;
        await new Promise(r => setTimeout(r, 500));
    }}
    if (!el_email || !el_pass) return 'form_not_found';

    // Fill email
    el_email.value = {json.dumps(email)};
    el_email.dispatchEvent(new Event('input', {{bubbles: true}}));
    el_email.dispatchEvent(new Event('change', {{bubbles: true}}));

    // Fill password
    el_pass.value = {json.dumps(password)};
    el_pass.dispatchEvent(new Event('input', {{bubbles: true}}));
    el_pass.dispatchEvent(new Event('change', {{bubbles: true}}));

    await new Promise(r => setTimeout(r, 500));

    // Submit — try submit button first, then form.submit()
    const SUBMIT_SELECTORS = [
        'button[type="submit"]', 'input[type="submit"]',
        '#next', 'button#signIn', 'button:has-text("Sign in")',
        'button:has-text("Log in")', 'button:has-text("Continue")',
    ];
    for (const sel of SUBMIT_SELECTORS) {{
        try {{
            const btn = document.querySelector(sel);
            if (btn) {{ btn.click(); return 'submitted_via_' + sel; }}
        }} catch(e) {{}}
    }}
    // Fallback: submit the form directly
    const form = el_email.closest('form');
    if (form) {{ form.submit(); return 'form.submit'; }}
    return 'no_submit_found';
}}
"""
        try:
            result = page.evaluate(fill_js)
            logger.info("[checkout_exec] autofill JS result: %r", result)
            if result and result != "form_not_found":
                self._emit("Logging in to Asda…")
                # Wait for navigation after submit
                try:
                    page.wait_for_load_state("networkidle", timeout=12_000)
                except Exception:
                    pass
                self._emit("Login submitted — waiting for redirect…")
                return True
            else:
                logger.info("[checkout_exec] autofill: form not found at %s", url)
                return False
        except Exception as e:
            logger.warning("[checkout_exec] autofill JS error: %r", e)
            return False

    def _execute_instruction(self, page, instruction: dict) -> tuple[str, str]:
        """
        Execute one Pepesto instruction and return (result_text, error_text).
        Returns ("__DONE__", "") when a terminal Done/Complete instruction is seen.
        """
        # ── LoadPage ──────────────────────────────────────────────────────────
        if "LoadPage" in instruction:
            spec = instruction["LoadPage"]
            url = spec.get("url", "")
            wait_ms = spec.get("max_wait_msec", 5000)
            actual_wait = min(wait_ms / 1000, 10)  # cap at 10s regardless of what Pepesto asks
            self._emit(f"Navigating to {url}…")
            try:
                logger.info("[checkout_exec] page.goto(%s)…", url)
                page.goto(url, timeout=30_000, wait_until="domcontentloaded")
                logger.info("[checkout_exec] goto done | sleeping %.1fs…", actual_wait)
                time.sleep(actual_wait)
                logger.info("[checkout_exec] sleep done | waiting for networkidle…")
                try:
                    page.wait_for_load_state("networkidle", timeout=8_000)
                    logger.info("[checkout_exec] networkidle reached")
                except Exception:
                    logger.info("[checkout_exec] networkidle timed out (ok for SPAs)")
                # Dismiss cookie consent — then wait for page to re-settle
                dismissed = self._maybe_dismiss_cookies(page)
                if dismissed:
                    try:
                        page.wait_for_load_state("networkidle", timeout=8_000)
                    except Exception:
                        pass
                # After navigation, try auto-filling login if we're on a login page
                autofilled = self._maybe_autofill_login(page)
                logger.info("[checkout_exec] autofill=%s", autofilled)
                if autofilled:
                    # Give Pepesto a clear signal that login was submitted
                    new_url = page.url or url
                    return f"login_submitted | now on: {new_url}", ""
                return f"Loaded {url}", ""
            except Exception as e:
                logger.error("[checkout_exec] LoadPage error: %r", e)
                return "", f"LoadPage failed: {e}"

        # ── RunJs ─────────────────────────────────────────────────────────────
        # Pepesto's primary interaction model: sends obfuscated JS that:
        #   • extracts minimal DOM HTML (for page-state understanding)
        #   • fires touch/click events at specific coordinates
        #   • fills form fields with text
        # We execute it in the page context and return the result as prev_result.
        if "RunJs" in instruction:
            spec = instruction["RunJs"]
            js_code = spec.get("js", "")
            func_name = spec.get("func", "")
            max_ms = spec.get("max_execute_time_msec", 5000)
            if not js_code or not func_name:
                return "", "RunJs: missing js or func"
            self._emit(f"Executing {func_name}…")
            logger.info("[checkout_exec] RunJs func=%r | code_size=%d chars", func_name, len(js_code))
            try:
                # Wrap in async arrow so Playwright can handle both sync and async returns
                full_script = f"async () => {{ {js_code}\nreturn await {func_name}(); }}"
                result = page.evaluate(full_script)
                result_str = str(result)[:4000] if result is not None else ""
                logger.info("[checkout_exec] RunJs result (first 300 chars): %s", result_str[:300])
                return result_str, ""
            except Exception as e:
                logger.warning("[checkout_exec] RunJs failed: %r", e)
                return "", f"RunJs failed: {e}"

        # ── AwaitJsOutChange ───────────────────────────────────────────────────
        # Poll a JS function every check_interval_msec until its output changes
        # from current_content. Used after touch/click to wait for page updates.
        if "AwaitJsOutChange" in instruction:
            spec = instruction["AwaitJsOutChange"]
            js_spec = spec.get("spec", {})
            js_code = js_spec.get("js", "")
            func_name = js_spec.get("func", "extract")
            current_content = spec.get("current_content", "unknown")
            check_interval_ms = spec.get("check_interval_msec", 1400)
            max_ms = js_spec.get("max_execute_time_msec", 5000)
            self._emit("Waiting for page to update…")
            logger.info("[checkout_exec] AwaitJsOutChange | func=%r | interval=%dms | current=%r",
                        func_name, check_interval_ms, current_content[:60] if current_content else "")
            # Poll for up to 20 seconds regardless of Pepesto's requested timeout
            deadline = time.time() + 20
            full_script = f"async () => {{ {js_code}\nreturn await {func_name}(); }}"
            last_result = current_content
            while time.time() < deadline:
                try:
                    new_content = page.evaluate(full_script)
                    new_content = str(new_content)[:4000] if new_content is not None else ""
                    if new_content and new_content != current_content and new_content != "unknown":
                        logger.info("[checkout_exec] AwaitJsOutChange: content changed! new=%r", new_content[:100])
                        return new_content, ""
                    last_result = new_content or last_result
                except Exception as e:
                    logger.debug("[checkout_exec] AwaitJsOutChange eval error: %r", e)
                time.sleep(check_interval_ms / 1000)
            logger.info("[checkout_exec] AwaitJsOutChange timed out — returning last seen content")
            return last_result[:4000] if last_result else "timeout", ""

        # ── Click ─────────────────────────────────────────────────────────────
        if "Click" in instruction:
            spec = instruction["Click"]
            selector = spec.get("selector", "")
            coords = spec.get("coordinates", {})
            label = selector or str(coords)
            self._emit(f"Clicking {label}…")
            try:
                if selector:
                    page.click(selector, timeout=10_000)
                elif coords:
                    page.mouse.click(float(coords.get("x", 0)), float(coords.get("y", 0)))
                else:
                    return "", "Click: missing selector and coordinates"
                time.sleep(0.5)
                return "Clicked", ""
            except Exception as e:
                return "", f"Click failed: {e}"

        # ── Type ──────────────────────────────────────────────────────────────
        if "Type" in instruction:
            spec = instruction["Type"]
            selector = spec.get("selector", "")
            text = spec.get("text", "")
            # Substitute placeholder markers or infer from selector name
            subst = self._credential(text) or self._credential(selector)
            if subst:
                text = subst
            self._emit(f"Typing into {selector or 'field'}…")
            try:
                if selector:
                    page.fill(selector, text, timeout=10_000)
                return "Typed", ""
            except Exception as e:
                return "", f"Type failed: {e}"

        # ── SelectOption ──────────────────────────────────────────────────────
        if "SelectOption" in instruction:
            spec = instruction["SelectOption"]
            selector = spec.get("selector", "")
            value = spec.get("value", "")
            try:
                page.select_option(selector, value, timeout=10_000)
                return "Selected", ""
            except Exception as e:
                return "", f"SelectOption failed: {e}"

        # ── SleepInstruction ──────────────────────────────────────────────────
        # Pepesto asks us to pause briefly (e.g. after a tap, before re-extracting DOM)
        if "SleepInstruction" in instruction:
            spec = instruction["SleepInstruction"]
            ms = spec.get("msec", spec.get("sleep_msec", 2000))
            actual = min(ms / 1000, 10)
            logger.info("[checkout_exec] SleepInstruction: sleeping %.1fs", actual)
            time.sleep(actual)
            return "slept", ""

        # ── Wait ──────────────────────────────────────────────────────────────
        if "Wait" in instruction:
            ms = instruction["Wait"].get("msec", 2000)
            self._emit(f"Waiting {ms}ms…")
            time.sleep(ms / 1000)
            return f"Waited {ms}ms", ""

        # ── Scroll ────────────────────────────────────────────────────────────
        if "Scroll" in instruction:
            spec = instruction["Scroll"]
            direction = spec.get("direction", "down")
            amount = spec.get("amount", 300)
            delta_y = amount if direction == "down" else -amount
            page.mouse.wheel(0, delta_y)
            return "Scrolled", ""

        # ── Terminal: Done / Complete / Success ───────────────────────────────
        for done_key in ("Done", "Complete", "Success", "OrderPlaced", "Finished"):
            if done_key in instruction:
                return "__DONE__", ""

        # ── Terminal: Error ───────────────────────────────────────────────────
        for err_key in ("Error", "Failure", "Failed"):
            if err_key in instruction:
                msg = instruction[err_key]
                if not isinstance(msg, str):
                    msg = str(msg)
                return "", msg

        # Unknown instruction — log and continue; Pepesto may recover
        logger.warning("[checkout_exec] Unknown instruction type: %s", list(instruction.keys()))
        return f"Unknown instruction: {list(instruction.keys())}", ""

    def run(self) -> dict:
        """
        Run the full Pepesto /checkout loop until Done or error.

        Returns:
            {"success": bool, "message": str, "iterations": int}
        """
        from playwright.sync_api import sync_playwright

        self._emit("Starting automated checkout…")

        with sync_playwright() as pw:
            browser = pw.chromium.launch(
                headless=True,
                args=["--no-sandbox", "--disable-dev-shm-usage"],
            )
            ctx_kwargs: dict = {
                "viewport": {"width": 1280, "height": 800},
                "user_agent": (
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/120.0.0.0 Safari/537.36"
                ),
            }
            if self._auth_state_path:
                ctx_kwargs["storage_state"] = self._auth_state_path
                logger.info("[checkout_exec] using saved Asda auth state: %s", self._auth_state_path)
                self._emit("Resuming saved Asda session…")
            else:
                logger.info("[checkout_exec] no saved auth state — will attempt login if needed")
            context = browser.new_context(**ctx_kwargs)
            page = context.new_page()

            prev_result = ""
            prev_error = ""

            try:
                for i in range(MAX_ITERATIONS):
                    logger.info(
                        "[checkout_exec] ── iteration %d/%d | url=%s | result=%r | error=%r",
                        i + 1, MAX_ITERATIONS, page.url or "blank",
                        prev_result[:80], prev_error[:80],
                    )

                    logger.info("[checkout_exec] taking screenshot…")
                    screenshot = _screenshot_b64(page)
                    logger.info("[checkout_exec] screenshot done | calling Pepesto /checkout…")
                    self._emit(f"Step {i + 1}: checking with Pepesto…")

                    try:
                        response = self.client.checkout(
                            session_id=self.session_id,
                            prev_result=prev_result,
                            prev_error=prev_error,
                            screenshot_b64=screenshot,
                        )
                        logger.info("[checkout_exec] /checkout response received | keys=%s", list(response.keys()))
                    except Exception as api_err:
                        logger.error("[checkout_exec] /checkout API call failed: %r", api_err)
                        self._emit(f"API error: {api_err}")
                        return {"success": False, "error": str(api_err), "iterations": i + 1}

                    # Pepesto wraps the response in "proto" on some endpoints
                    proto = response.get("proto", response)
                    instruction = proto.get("Instruction", {})

                    if not instruction:
                        # Check for a top-level terminal status
                        status = proto.get("status", "")
                        if status in ("done", "complete", "success", "order_placed"):
                            self._emit("Order placed successfully!")
                            return {"success": True, "message": "Order placed", "iterations": i + 1}
                        logger.warning("[checkout_exec] No Instruction in response: %r", proto)
                        return {"success": False, "error": "No instruction received from Pepesto", "iterations": i + 1}

                    prev_result, prev_error = self._execute_instruction(page, instruction)

                    if prev_result == "__DONE__":
                        self._emit("Order placed successfully!")
                        return {"success": True, "message": "Order placed", "iterations": i + 1}

                    if prev_error:
                        # Send the error back to Pepesto — it may be able to recover
                        logger.warning("[checkout_exec] Instruction error (sending to Pepesto): %r", prev_error)
                        prev_result = ""

                return {"success": False, "error": "Max iterations reached without completion", "iterations": MAX_ITERATIONS}

            finally:
                try:
                    browser.close()
                except Exception:
                    pass
