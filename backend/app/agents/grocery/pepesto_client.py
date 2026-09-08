"""Pepesto REST API client.

All calls are synchronous (httpx sync) to match the blocking execution model
used by the rest of Veda's agents. The API key is optional — endpoints that
work without a key (/predirect) are always available.
"""
from __future__ import annotations

import logging
import time
from typing import Any, Optional

import httpx

logger = logging.getLogger(__name__)

PEPESTO_BASE = "https://s.pepesto.com/api"
TIMEOUT = 15.0
CHECKOUT_TIMEOUT = 240.0  # /checkout sends screenshot + DOM for vision/LLM processing — needs longer


class PepetoClient:
    def __init__(self, api_key: str = "") -> None:
        self._api_key = api_key

    @property
    def _headers(self) -> dict:
        if self._api_key:
            return {"Authorization": f"Bearer {self._api_key}", "Content-Type": "application/json"}
        return {"Content-Type": "application/json"}

    def _post(self, path: str, payload: dict, auth_required: bool = True) -> dict:
        if auth_required and not self._api_key:
            raise RuntimeError(f"Pepesto API key required for {path}. Set PEPESTO_API_KEY in backend/.env")
        url = f"{PEPESTO_BASE}/{path.lstrip('/')}"
        payload_summary = {k: (str(v)[:80] if isinstance(v, str) else v) for k, v in payload.items()}
        logger.info("[pepesto] ▶ POST %s | auth=%s | payload=%r", url, auth_required, payload_summary)
        t0 = time.perf_counter()
        resp = httpx.post(url, json=payload, headers=self._headers, timeout=TIMEOUT)
        elapsed_ms = int((time.perf_counter() - t0) * 1000)
        if resp.is_success:
            logger.info(
                "[pepesto] ✅ %s → HTTP %d | body_size=%d bytes | elapsed=%dms",
                path, resp.status_code, len(resp.content), elapsed_ms,
            )
        else:
            logger.error(
                "[pepesto] ❌ %s → HTTP %d | body_size=%d bytes | elapsed=%dms | body=%r",
                path, resp.status_code, len(resp.content), elapsed_ms, resp.text[:500],
            )
        resp.raise_for_status()
        data = resp.json()
        top_keys = list(data.keys()) if isinstance(data, dict) else type(data).__name__
        logger.info("[pepesto] %s parsed | top_keys=%s", path, top_keys)
        return data

    # ── Free endpoints (no API key needed) ─────────────────────────────────

    def predirect(self, shopping_list: str, supermarket_domain: str = "tesco.com") -> dict:
        """Shopping list → deep link into Pepesto app. Free, no API key."""
        return self._post(
            "predirect",
            {"shopping_list": shopping_list, "supermarket_domain": supermarket_domain},
            auth_required=False,
        )

    # ── Paid endpoints (require API key + credits) ──────────────────────────

    def credits(self) -> dict:
        """Check remaining credit balance."""
        return self._post("credits", {})

    def parse(self, recipe_url: str = "", recipe_text: str = "", locale: str = "en-GB") -> dict:
        """Parse a recipe URL or text into structured ingredients + kg_token."""
        payload: dict[str, Any] = {"locale": locale}
        if recipe_url:
            payload["recipe_url"] = recipe_url
        elif recipe_text:
            payload["recipe_text"] = recipe_text
        else:
            raise ValueError("Either recipe_url or recipe_text is required")
        return self._post("parse", payload)

    def suggest(self, query: str, supermarket_domain: str = "tesco.com", portions: int = 2, locale: str = "en-GB") -> dict:
        """Search 1M+ recipe database. Returns 3 recipes with kg_tokens."""
        return self._post("suggest", {
            "query": query,
            "personalization": {
                "locale": locale,
                "portions": portions,
                "supermarket_domain": supermarket_domain,
            },
        })

    def products(
        self,
        supermarket_domain: str,
        recipe_kg_tokens: Optional[list[str]] = None,
        manual_shopping_list: str = "",
        user_id: str = "",
    ) -> dict:
        """Map kg_tokens / free-text list → matched SKUs with live prices."""
        payload: dict[str, Any] = {"supermarket_domain": supermarket_domain}
        if recipe_kg_tokens:
            payload["recipe_kg_tokens"] = recipe_kg_tokens
        if manual_shopping_list:
            payload["manual_shopping_list"] = manual_shopping_list
        if user_id:
            payload["user_id"] = user_id
        return self._post("products", payload)

    def oneshot(
        self,
        supermarket_domain: str,
        content_urls: Optional[list[str]] = None,
        content_text: str = "",
    ) -> dict:
        """Recipe → redirect_url for Pepesto's cart UI (one call)."""
        payload: dict[str, Any] = {"supermarket_domain": supermarket_domain}
        if content_urls:
            payload["content_urls"] = content_urls
        if content_text:
            payload["content_text"] = content_text
        return self._post("oneshot", payload)

    def session(
        self,
        supermarket_domain: str,
        skus: list[dict],
        charge_user: bool = False,
        charge_user_amount: float = 0.0,
        charge_user_webhook: str = "",
        unresolved_items: Optional[list[str]] = None,
    ) -> dict:
        """Create a checkout session. Returns session_id and optionally payment_redirect_url."""
        payload: dict[str, Any] = {
            "supermarket_domain": supermarket_domain,
            "skus": skus,
            "charge_user": charge_user,
        }
        if charge_user and charge_user_amount:
            payload["charge_user_amount"] = charge_user_amount
        if charge_user_webhook:
            payload["charge_user_webhook"] = charge_user_webhook
        if unresolved_items:
            payload["unresolved_items"] = unresolved_items
        return self._post("session", payload)

    def mcheckout(
        self,
        supermarket_domain: str,
        skus: list[dict],
        return_url: str = "",
    ) -> dict:
        """Mobile hosted checkout — returns mobile_hosted_url to open in-app browser."""
        payload: dict[str, Any] = {
            "supermarket_domain": supermarket_domain,
            "skus": skus,
        }
        if return_url:
            payload["return_url"] = return_url
        return self._post("mcheckout", payload)

    def search(self, supermarket_domain: str, products: list[str]) -> dict:
        """Async product search across broader inventory. Returns search_session_id."""
        return self._post("search", {
            "supermarket_domain": supermarket_domain,
            "products": products,
        })

    def retrieve(self, search_session_id: str) -> dict:
        """Poll for async /search results. Returns status + products when ready."""
        return self._post("retrieve", {"search_session_id": search_session_id})

    def catalog(self, supermarket_domain: str) -> dict:
        """Full SKU dump for a supermarket. Costs credits."""
        return self._post("catalog", {"supermarket_domain": supermarket_domain})

    def promotions(self, supermarket_domain: str) -> dict:
        """Promotional products for a retailer."""
        return self._post("promotions", {"supermarket_domain": supermarket_domain})

    def checkout(
        self,
        session_id: str,
        prev_result: str = "",
        prev_error: str = "",
        screenshot_b64: str = "",
    ) -> dict:
        """One iteration of the automated WebView checkout loop. FREE."""
        payload: dict[str, Any] = {
            "continue_session_id": session_id,
            "prev_turn_response": {"result": prev_result, "error": prev_error},
        }
        if screenshot_b64:
            payload["screenshot"] = screenshot_b64
        url = f"{PEPESTO_BASE}/checkout"
        logger.info("[pepesto] ▶ POST checkout | session_id=%s | has_screenshot=%s | payload_size~=%d chars",
                    session_id, bool(screenshot_b64), len(str(payload)))
        t0 = time.perf_counter()
        resp = httpx.post(url, json=payload, headers=self._headers, timeout=CHECKOUT_TIMEOUT)
        elapsed_ms = int((time.perf_counter() - t0) * 1000)
        if resp.is_success:
            logger.info(
                "[pepesto] ✅ checkout → HTTP %d | body_size=%d bytes | elapsed=%dms",
                resp.status_code, len(resp.content), elapsed_ms,
            )
        else:
            logger.error(
                "[pepesto] ❌ checkout → HTTP %d | body_size=%d bytes | elapsed=%dms | body=%r",
                resp.status_code, len(resp.content), elapsed_ms, resp.text[:500],
            )
        resp.raise_for_status()
        data = resp.json()
        logger.info("[pepesto] checkout parsed | top_keys=%s", list(data.keys()) if isinstance(data, dict) else type(data).__name__)
        return data
