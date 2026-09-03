"""
One-time Asda session setup.

Launches your real Chrome browser (no Playwright automation, so Cloudflare
Turnstile completes normally). After you log in manually, the script connects
via Chrome DevTools Protocol to save the full authenticated session — including
HttpOnly cookies — as a Playwright storage_state file.

Usage (run from the backend/ directory):
    source .venv/bin/activate
    python scripts/save_asda_session.py

After running, ensure backend/.env contains:
    ASDA_AUTH_STATE_PATH=asda_auth.json

Then restart the backend.
"""
import json
import os
import subprocess
import sys
import time

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.dirname(SCRIPT_DIR)
OUTPUT_PATH = os.path.join(BACKEND_DIR, "asda_auth.json")

CDP_PORT = 9223  # Using 9223 to avoid clashing with other debuggers

CHROME_CANDIDATES = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
]


def find_chrome() -> str:
    chrome = next((p for p in CHROME_CANDIDATES if os.path.exists(p)), None)
    if not chrome:
        sys.exit("Google Chrome not found. Install it from https://www.google.com/chrome/")
    return chrome


def wait_for_chrome(timeout: int = 10) -> bool:
    """Poll until Chrome's CDP endpoint is ready."""
    try:
        import urllib.request
        deadline = time.time() + timeout
        while time.time() < deadline:
            try:
                urllib.request.urlopen(f"http://localhost:{CDP_PORT}/json", timeout=1)
                return True
            except Exception:
                time.sleep(0.5)
    except Exception:
        pass
    return False


def main() -> None:
    chrome_path = find_chrome()

    print("=" * 60)
    print("  Asda session setup")
    print("=" * 60)
    print()
    print("IMPORTANT: Quit Chrome completely before continuing.")
    print("           (Chrome menu → Quit Google Chrome)")
    print()
    input("Press Enter once Chrome is fully closed… ")
    print()

    # Launch Chrome with a debug port only — NO Playwright flags,
    # so navigator.webdriver is not set and Cloudflare Turnstile passes.
    user_data_dir = os.path.expanduser("~/Library/Application Support/Google/Chrome")
    proc = subprocess.Popen(
        [
            chrome_path,
            f"--remote-debugging-port={CDP_PORT}",
            f"--user-data-dir={user_data_dir}",
            "--no-first-run",
            "--no-default-browser-check",
            "https://www.asda.com/account",
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )

    print("Chrome is opening — log in to Asda normally.")
    print("Cloudflare's verification will complete as it does in a regular browser.")
    print()

    if not wait_for_chrome():
        proc.terminate()
        sys.exit("Chrome didn't start in time. Try again.")

    input("Press Enter AFTER you have successfully signed in to Asda… ")
    print()
    print("Connecting to Chrome to save your session…")

    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        proc.terminate()
        sys.exit("playwright not installed — run: pip install playwright && playwright install chromium")

    try:
        with sync_playwright() as pw:
            # connect_over_cdp attaches to the already-running Chrome without
            # injecting automation flags — Cloudflare already finished by now.
            browser = pw.chromium.connect_over_cdp(f"http://localhost:{CDP_PORT}")
            contexts = browser.contexts

            if not contexts:
                proc.terminate()
                sys.exit("No browser context found. Make sure you're logged in and try again.")

            ctx = contexts[0]

            # Navigate to account page to make sure we have a live Asda page in context
            pages = ctx.pages
            asda_page = next(
                (p for p in pages if "asda.com" in p.url and "login.asda.com" not in p.url),
                None,
            )
            if not asda_page and pages:
                asda_page = pages[0]
                try:
                    asda_page.goto("https://www.asda.com/account", wait_until="domcontentloaded", timeout=15_000)
                    time.sleep(3)
                except Exception:
                    pass

            # Save full storage state — cookies (including HttpOnly) + localStorage
            ctx.storage_state(path=OUTPUT_PATH)

            with open(OUTPUT_PATH) as f:
                state = json.load(f)

            cookie_count = len(state.get("cookies", []))
            ls_count = sum(
                len(o.get("localStorage", []))
                for o in state.get("origins", [])
            )

            print(f"Session saved to: {OUTPUT_PATH}")
            print(f"  {cookie_count} cookies, {ls_count} localStorage entries")
            print()

            browser.disconnect()

    except Exception as e:
        proc.terminate()
        sys.exit(f"Failed to save session: {e}")

    proc.terminate()

    if cookie_count == 0:
        print("WARNING: No cookies were captured. Make sure you were fully logged in before pressing Enter.")
        print("Run the script again and sign in completely before continuing.")
    else:
        print("Done. Add this to backend/.env if not already set:")
        print()
        print("  ASDA_AUTH_STATE_PATH=asda_auth.json")
        print()
        print("Restart the backend, then tap 'Order for me' in the app.")


if __name__ == "__main__":
    main()
