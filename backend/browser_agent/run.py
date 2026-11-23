"""Standalone test for the browser agent.

Usage:
    cd backend
    .venv-browser/bin/python browser_agent/run.py "Go to example.com and tell me what you see"

Set HEADLESS=0 to watch the browser.
Set ANTHROPIC_API_KEY in .env or environment.

Uses the same VedaBrowserDriver as the Veda backend (app/agents/browser/driver.py).
"""
from __future__ import annotations

import os
import sys
import time
from pathlib import Path
from urllib.parse import urlsplit

from dotenv import load_dotenv

# Load .env from backend directory
env_path = Path(__file__).resolve().parent.parent / ".env"
if env_path.exists():
    load_dotenv(env_path)

# Add backend to path so we can import the real driver
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from anthropic import Anthropic
from anthropic.tools import ToolError
from anthropic.tools.browser import BetaURLContext, BetaURLPolicy

from app.agents.browser.driver import VedaBrowserDriver

# ── Configuration ─────────────────────────────────────────────────────────

_DEFAULT_DOMAINS = "priceline.com,www.priceline.com,google.com,www.google.com,example.com,iana.org"
ALLOWED_DOMAINS = [d.strip() for d in os.environ.get("ALLOWED_DOMAINS", _DEFAULT_DOMAINS).split(",") if d.strip()]

MODEL = os.environ.get("MODEL", "claude-sonnet-5-5")
HEADLESS = os.environ.get("HEADLESS", "1") != "0"


def priceline_policy(allowed_hosts: list[str]) -> BetaURLPolicy:
    """URL policy: only allow Priceline and specified domains."""
    hosts = [h.strip().lower().rstrip(".") for h in allowed_hosts if h.strip()]

    def policy(_context: BetaURLContext, url: str) -> None:
        if url.lower() == "about:blank":
            return
        import re

        with_scheme = (
            url if re.match(r"[a-z][a-z0-9+.-]*:", url, re.I) else f"https://{url}"
        )
        try:
            parts = urlsplit(with_scheme.replace("\\", "/"))
        except ValueError:
            raise ToolError(f"blocked: {url} could not be parsed") from None

        host = (parts.hostname or "").lower()
        on_allowed = any(
            host == allowed or host.endswith("." + allowed) for allowed in hosts
        )
        if parts.scheme not in ("http", "https") or not on_allowed:
            raise ToolError(f"blocked: {url} is not on an allowed host")

    return policy


def on_step(message: str) -> None:
    """Print status updates as the browser agent works."""
    print(f"  {message}", flush=True)


def main() -> None:
    task = " ".join(sys.argv[1:]) if len(sys.argv) > 1 else None
    if not task:
        print("Usage: python run.py \"<task>\"")
        print("Example: python run.py \"Go to priceline.com and search for hotels in Tokyo\"")
        sys.exit(1)

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        print("❌ ANTHROPIC_API_KEY not set. Add it to backend/.env or export it.")
        sys.exit(1)

    print(f"{'='*60}")
    print(f"  VEDA BROWSER AGENT — Standalone Test")
    print(f"{'='*60}")
    print(f"  Task:     {task}")
    print(f"  Model:    {MODEL}")
    print(f"  Headless: {HEADLESS}")
    print(f"  Domains:  {', '.join(ALLOWED_DOMAINS)}")
    print(f"{'='*60}")
    print()

    t0 = time.time()

    print("🚀 Launching Chrome...", flush=True)
    try:
        client = Anthropic()
        browser = VedaBrowserDriver(
            headless=HEADLESS,
            url_policy=priceline_policy(ALLOWED_DOMAINS),
            on_step=on_step,
        )
    except Exception as error:
        print(f"❌ Failed to start: {error}", file=sys.stderr)
        sys.exit(1)

    print("✅ Chrome launched. Starting agent loop...\n", flush=True)

    system_prompt = (
        "You are Veda, an AI travel companion. You are browsing the web on behalf of the user. "
        "Navigate to the requested website, interact with it like a human would, and complete the task. "
        "Use read_page to understand page structure and find interactive elements. "
        "Use screenshot when you need to see the visual layout. "
        "Use left_click with element references (ref_N) when possible — it's more reliable than coordinates. "
        "When filling search forms, use type to enter text and key to press Enter. "
        "After getting results, summarize them clearly for the user with prices and key details. "
        "Be efficient — don't take unnecessary steps."
    )

    with browser:
        runner = client.beta.messages.tool_runner(
            model=MODEL,
            max_tokens=4096,
            system=system_prompt,
            tools=[browser],
            messages=[{"role": "user", "content": task}],
        )

        step_count = 0
        for message in runner:
            step_count += 1
            # The runner yields Message objects; print the final text
            if hasattr(message, "content"):
                for block in message.content:
                    if hasattr(block, "text"):
                        print(f"\n{'='*60}")
                        print(f"  🤖 CLAUDE'S ANSWER")
                        print(f"{'='*60}")
                        print(block.text)
                    elif hasattr(block, "name"):
                        # Tool use block — just log it
                        tool_input = getattr(block, "input", {})
                        input_summary = str(tool_input)[:100]
                        print(f"  🔧 Tool: {block.name}({input_summary})")

    elapsed = time.time() - t0
    print(f"\n{'='*60}")
    print(f"  ✅ Done in {elapsed:.1f}s ({step_count} steps)")
    print(f"{'='*60}")


if __name__ == "__main__":
    main()
