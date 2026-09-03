"""GroceryAgent LangGraph.

Two-node graph:
  understand_intent → build_basket → END

Phase 1 (no API key): uses /predirect — free, produces a Pepesto deep link.
Phase 2 (with API key): uses /products → matched SKUs with live prices.
"""
from __future__ import annotations

import base64
import json
import logging
import re

from langchain_anthropic import ChatAnthropic
from langgraph.graph import END, StateGraph
from langgraph.types import StreamWriter

from app.agents.grocery.pepesto_client import PepetoClient
from app.agents.grocery.prompts import SUPERMARKET_NAMES, grocery_intent_prompt, supermarket_search_url
from app.agents.grocery.schemas import GroceryIntent, GroceryResultCard
from app.agents.grocery.state import GroceryAgentState
from app.config import get_settings

logger = logging.getLogger(__name__)


def _decode_session_token(token: str) -> dict:
    """Pepesto session tokens are base64-encoded JSON containing product_id (direct supermarket URL)."""
    try:
        # Add padding if needed
        padding = 4 - len(token) % 4
        padded = token + ("=" * padding) if padding != 4 else token
        return json.loads(base64.b64decode(padded).decode("utf-8"))
    except Exception as e:
        logger.warning("[grocery] failed to decode session token: %r", e)
        return {}


def _llm():
    settings = get_settings()
    if settings.anthropic_api_key:
        return ChatAnthropic(model=settings.anthropic_model, api_key=settings.anthropic_api_key, temperature=0)
    raise RuntimeError("No LLM key configured — set ANTHROPIC_API_KEY in backend/.env")


def _client() -> PepetoClient:
    return PepetoClient(api_key=get_settings().pepesto_api_key)


_SUPERMARKET_CHOICES = [
    {"label": "🛒 Tesco", "value": "Tesco"},
    {"label": "🛍 Sainsbury's", "value": "Sainsbury's"},
    {"label": "🛒 Asda", "value": "Asda"},
    {"label": "🌿 Waitrose", "value": "Waitrose"},
    {"label": "🛒 Morrisons", "value": "Morrisons"},
]

_SUPERMARKET_MENTIONED = re.compile(
    r"\b(tesco|sainsbury|asda|waitrose|morrison)\b", re.IGNORECASE
)


def node_understand_intent(state: dict, writer: StreamWriter) -> dict:
    logger.info("[grocery] node_understand_intent START | message=%r", state.get("user_message", "")[:100])
    writer({"kind": "status", "text": "Understanding your grocery list…"})
    llm = _llm().with_structured_output(GroceryIntent)

    user_message = state.get("user_message", "")
    history = state.get("history", [])

    # Check if a supermarket has been mentioned anywhere in the full conversation
    all_text = user_message + " " + " ".join(h.get("text", "") for h in history)
    supermarket_mentioned = bool(_SUPERMARKET_MENTIONED.search(all_text))
    logger.info("[grocery] supermarket_mentioned=%s | all_text_snippet=%r", supermarket_mentioned, all_text[:120])

    prompt = grocery_intent_prompt(user_message=user_message, history=history)
    intent: GroceryIntent = llm.invoke(prompt)
    logger.info(
        "[grocery] intent extracted | customer=%s | items=%r | supermarket=%s | reply=%r | supermarket_mentioned=%s",
        state.get("customer_id"), intent.items, intent.supermarket, intent.reply_to_user[:80], supermarket_mentioned,
    )

    if not supermarket_mentioned:
        # Ask the user which supermarket they prefer
        writer({"kind": "text", "role": "agent", "text": f"I've got your list: {', '.join(intent.items)}. Which supermarket would you like?"})
        writer({
            "kind": "choice",
            "question": "Choose your supermarket:",
            "choices": _SUPERMARKET_CHOICES,
        })
    else:
        writer({"kind": "text", "role": "agent", "text": intent.reply_to_user})

    return {
        "items": intent.items,
        "supermarket_domain": intent.supermarket,
        "supermarket_name": intent.supermarket_name,
        "reply": intent.reply_to_user,
        "supermarket_mentioned": supermarket_mentioned,
    }


def node_build_basket(state: dict, writer: StreamWriter) -> dict:
    logger.info(
        "[grocery] node_build_basket START | items=%r | supermarket=%s | has_key=%s",
        state.get("items", []), state.get("supermarket_domain"), bool(get_settings().pepesto_api_key),
    )
    writer({"kind": "status", "text": f"Building your basket at {state.get('supermarket_name', 'Tesco')}…"})

    client = _client()
    items: list[str] = state.get("items", [])
    supermarket_domain: str = state.get("supermarket_domain", "tesco.com")
    supermarket_name: str = state.get("supermarket_name", "Tesco")
    customer_id: str = str(state.get("customer_id") or "")

    shopping_list = ", ".join(items)
    checkout_mode = "predirect"
    checkout_url = ""
    product_items = []
    missing_items = []
    total_formatted = None

    has_key = bool(get_settings().pepesto_api_key)
    logger.info("[grocery] has_pepesto_key=%s | shopping_list=%r", has_key, shopping_list)

    if has_key:
        try:
            writer({"kind": "status", "text": "Matching products to live prices…"})
            logger.info("[grocery] calling /products | supermarket=%s | list=%r", supermarket_domain, shopping_list)
            result = client.products(
                supermarket_domain=supermarket_domain,
                manual_shopping_list=shopping_list,
                user_id=customer_id,
            )
            logger.info("[grocery] /products response | top-level keys=%s | item_count=%d",
                        list(result.keys()), len(result.get("items", [])))

            total_pence = 0
            for item_data in result.get("items", []):
                item_name = item_data.get("item_name", "")
                products = item_data.get("products", [])
                logger.info("[grocery] item=%r | candidates=%d", item_name, len(products))
                if not products:
                    logger.warning("[grocery] no match for item=%r — adding to missing", item_name)
                    missing_items.append(item_name)
                    continue
                top = products[0]
                product = top.get("product", {})
                price_obj = product.get("price", {})
                price_pence = price_obj.get("price", 0) if isinstance(price_obj, dict) else int(price_obj)
                total_pence += price_pence

                # Decode session token to get the direct supermarket product URL
                session_token = top.get("session_token", "")
                token_data = _decode_session_token(session_token) if session_token else {}
                product_url = token_data.get("product_id", "")
                logger.info("[grocery] item=%r | product_url from token: %s", item_name, product_url or "NONE")
                matched = {
                    "item_name": item_name,
                    "product_name": product.get("product_name", ""),
                    "price": price_pence,
                    "price_formatted": f"£{price_pence / 100:.2f}",
                    "image_url": product.get("pepesto_hosted_image_url") or product.get("image_url", ""),
                    "product_url": product_url,
                    "num_units": 1,
                    "session_token": top.get("session_token", ""),
                }
                product_items.append(matched)
                logger.info("[grocery] matched | item=%r → product=%r | price=%dp | product_url=%s",
                            item_name, matched["product_name"], price_pence, product_url or "NONE")

            total_formatted = f"£{total_pence / 100:.2f}"
            logger.info("[grocery] /products SUCCESS | matched=%d | missing=%d | total=%s",
                        len(product_items), len(missing_items), total_formatted)

            skus = [{"session_token": p["session_token"], "quantity": p["num_units"]}
                    for p in product_items if p.get("session_token")]

            if skus:
                # Use Pepesto /session with charge_user=True to get a hosted web payment
                # URL (Stripe-based). Pepesto charges the user then places the Tesco order.
                # This is the only way to migrate the matched basket into Tesco without
                # requiring the Pepesto app — the payment_redirect_url is a real web page.
                logger.info("[grocery] calling /session | charge_user=True | skus=%d | total_pence=%d", len(skus), total_pence)
                try:
                    session_result = client.session(
                        supermarket_domain=supermarket_domain,
                        skus=skus,
                        charge_user=True,
                        charge_user_amount=total_pence / 100.0,
                        unresolved_items=missing_items or None,
                    )
                    logger.info("[grocery] /session response keys: %s", list(session_result.keys()))
                    payment_redirect_url = session_result.get("payment_redirect_url", "")
                    logger.info("[grocery] payment_redirect_url: %s", payment_redirect_url if payment_redirect_url else "EMPTY")
                    if payment_redirect_url:
                        checkout_url = payment_redirect_url
                        checkout_mode = "session"
                        logger.info("[grocery] checkout via Pepesto hosted payment page")
                    else:
                        checkout_url = supermarket_search_url(supermarket_domain, [p["item_name"] for p in product_items] or items)
                        logger.warning("[grocery] no payment_redirect_url in session response — falling back to search URL")
                except Exception as sess_err:
                    logger.error("[grocery] /session FAILED: %r — falling back to search URL", sess_err)
                    checkout_url = supermarket_search_url(supermarket_domain, [p["item_name"] for p in product_items] or items)
            else:
                checkout_url = supermarket_search_url(supermarket_domain, items)
                logger.info("[grocery] no skus — using search URL: %s", checkout_url)
            checkout_mode = "products"

        except Exception as e:
            import traceback
            logger.error("[grocery] /products FAILED | error=%r\n%s", e, traceback.format_exc())
            has_key = False

    if not has_key:
        checkout_url = supermarket_search_url(supermarket_domain, items)
        checkout_mode = "predirect"
        logger.info("[grocery] predirect fallback | url=%s", checkout_url)

    card = GroceryResultCard(
        supermarket=supermarket_domain,
        supermarket_name=supermarket_name,
        items=product_items,
        missing_items=missing_items,
        total_formatted=total_formatted,
        checkout_url=checkout_url,
        checkout_mode=checkout_mode,
        message=state.get("reply", ""),
    )

    logger.info(
        "[grocery] basket built | mode=%s | items=%d | missing=%d | total=%s",
        checkout_mode, len(product_items), len(missing_items), total_formatted,
    )
    logger.info("[grocery] checkout_url (full): %s", checkout_url if checkout_url else "EMPTY")

    writer({
        "kind": "grocery_basket",
        "supermarket": card.supermarket,
        "supermarket_name": card.supermarket_name,
        "items": card.items,
        "missing_items": card.missing_items,
        "total_formatted": card.total_formatted,
        "checkout_url": card.checkout_url,
        "checkout_mode": card.checkout_mode,
        "message": card.message,
    })

    return {"card": card.model_dump()}


def _route_after_intent(state: dict) -> str:
    return "build_basket" if state.get("supermarket_mentioned") else END


def build_grocery_graph():
    graph = StateGraph(GroceryAgentState)
    graph.add_node("understand_intent", node_understand_intent)
    graph.add_node("build_basket", node_build_basket)
    graph.set_entry_point("understand_intent")
    graph.add_conditional_edges("understand_intent", _route_after_intent, {"build_basket": "build_basket", END: END})
    graph.add_edge("build_basket", END)
    return graph.compile()


grocery_graph = build_grocery_graph()
