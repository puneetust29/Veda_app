"""Interactive browser agent — keeps the session alive for multi-turn conversations.

Usage:
    cd backend
    .venv-browser/bin/python ../scripts/browser_interactive.py

The browser stays open between turns. When Claude needs input (like an OTP code),
it asks you in the terminal. You reply, and Claude continues in the same browser.

Uses the same VedaBrowserDriver as the Veda backend (app/agents/browser/driver.py).

Type 'quit' or 'exit' to stop.
"""
from __future__ import annotations

import os
import sys
import re
from pathlib import Path
from urllib.parse import urlsplit

from dotenv import load_dotenv

# Add backend to path so we can import the real driver
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

env_path = Path(__file__).resolve().parent.parent / "backend" / ".env"
if env_path.exists():
    load_dotenv(env_path)

from anthropic import Anthropic
from anthropic.tools import ToolError
from anthropic.tools.browser import BetaURLContext, BetaURLPolicy

from app.agents.browser.driver import VedaBrowserDriver

MODEL = os.environ.get("MODEL", "claude-sonnet-5-5")
HEADLESS = os.environ.get("HEADLESS", "1") != "0"

DEFAULT_DOMAINS = [
    "medium.com", "www.medium.com",
    "priceline.com", "www.priceline.com",
    "booking.com", "www.booking.com",
    "example.com", "iana.org",
    "wikipedia.org", "en.wikipedia.org",
    "kayak.com", "www.kayak.com",
    "expedia.com", "www.expedia.com",
]


def make_policy(allowed_hosts: list[str]) -> BetaURLPolicy:
    hosts = [h.strip().lower().rstrip(".") for h in allowed_hosts if h.strip()]

    def policy(_ctx: BetaURLContext, url: str) -> None:
        if url.lower() == "about:blank":
            return
        with_scheme = url if re.match(r"[a-z][a-z0-9+.-]*:", url, re.I) else f"https://{url}"
        try:
            parts = urlsplit(with_scheme.replace("\\", "/"))
        except ValueError:
            raise ToolError(f"blocked: {url}") from None
        host = (parts.hostname or "").lower()
        on_allowed = any(host == a or host.endswith("." + a) for a in hosts)
        if parts.scheme not in ("http", "https") or not on_allowed:
            raise ToolError(f"blocked: {url} is not on an allowed host")

    return policy


def on_step(text: str) -> None:
    print(f"  🔧 {text}", flush=True)


SYSTEM_PROMPT = (
    "You are Veda, an AI travel companion browsing the web for the user. "
    "Complete tasks step by step. When you need information from the user "
    "(like a verification code, OTP, or a choice), ask clearly and wait for their reply. "
    "Do NOT end the conversation when waiting for user input — ask the question and stop. "
    "The user will reply with the information you need, then you continue in the same browser session. "
    "Use read_page to find interactive elements, left_click with refs, type to enter text. "
    "Be efficient and clear about what you're doing."
)


def main() -> None:
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        print("❌ ANTHROPIC_API_KEY not set.")
        sys.exit(1)

    domains_env = os.environ.get("ALLOWED_DOMAINS")
    domains = [d.strip() for d in domains_env.split(",") if d.strip()] if domains_env else DEFAULT_DOMAINS

    print(f"{'='*60}")
    print(f"  VEDA BROWSER AGENT — Interactive Mode")
    print(f"{'='*60}")
    print(f"  Model:    {MODEL}")
    print(f"  Headless: {HEADLESS}")
    print(f"  Domains:  {', '.join(domains[:5])}{'...' if len(domains) > 5 else ''}")
    print(f"  Type 'quit' to exit")
    print(f"{'='*60}\n")

    print("🚀 Launching Chrome...", flush=True)
    client = Anthropic()
    browser = VedaBrowserDriver(
        headless=HEADLESS,
        url_policy=make_policy(domains),
        on_step=on_step,
    )
    print("✅ Chrome ready. Browser session will stay open.\n", flush=True)

    messages = []

    with browser:
        while True:
            try:
                user_input = input("You: ").strip()
            except (EOFError, KeyboardInterrupt):
                print("\n👋 Bye!")
                break

            if not user_input:
                continue
            if user_input.lower() in ("quit", "exit", "q"):
                print("👋 Bye!")
                break

            messages.append({"role": "user", "content": user_input})

            print(f"\n  🤖 Claude is working...\n", flush=True)

            try:
                runner = client.beta.messages.tool_runner(
                    model=MODEL,
                    max_tokens=4096,
                    system=SYSTEM_PROMPT,
                    tools=[browser],
                    messages=messages,
                )

                assistant_text = ""
                for message in runner:
                    if hasattr(message, "content"):
                        for block in message.content:
                            if hasattr(block, "text") and block.text:
                                assistant_text = block.text
                            elif hasattr(block, "name"):
                                pass  # tool use — on_step handles logging

                if assistant_text:
                    messages.append({"role": "assistant", "content": assistant_text})
                    print(f"\n{'─'*60}")
                    print(f"Veda: {assistant_text}")
                    print(f"{'─'*60}\n")

            except Exception as e:
                print(f"\n  ❌ Error: {e}\n")

    print("Browser closed.")


if __name__ == "__main__":
    main()
