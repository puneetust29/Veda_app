"""GroceryAgent LangGraph.

Two-node graph:
  understand_intent → build_basket → END

Phase 1 (no API key): uses /predirect — free, produces a Pepesto deep link.
Phase 2 (with API key): uses /products → matched SKUs with live prices.
"""
from __future__ import annotations

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

    # Check if a supermarket is mentioned anywhere in the conversation
    all_text = user_message + " " + " ".join(h.get("text", "") for h in history)
    supermarket_mentioned = bool(_SUPERMARKET_MENTIONED.search(all_text))

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

    if has_key:
        # Phase 2: /products → matched SKUs with live prices
        try:
            writer({"kind": "status", "text": "Matching products to live prices…"})
            result = client.products(
                supermarket_domain=supermarket_domain,
                manual_shopping_list=shopping_list,
                user_id=customer_id,
            )
            missing_items = result.get("missing_items", [])
            currency = result.get("currency", "GBP")
            total_pence = 0

            for item_data in result.get("items", []):
                products = item_data.get("products", [])
                if not products:
                    missing_items.append(item_data.get("item_name", ""))
                    continue
                top = products[0]
                product = top.get("product", {})
                price = product.get("price", 0)
                total_pence += price * top.get("num_units_to_buy", 1)
                product_items.append({
                    "item_name": item_data.get("item_name", ""),
                    "product_name": product.get("product_name", ""),
                    "price": price,
                    "price_formatted": f"£{price / 100:.2f}" if currency == "GBP" else f"{price / 100:.2f} {currency}",
                    "image_url": product.get("image_url", ""),
                    "num_units": top.get("num_units_to_buy", 1),
                    "session_token": product.get("session_token", ""),
                })

            if currency == "GBP":
                total_formatted = f"£{total_pence / 100:.2f}"
            else:
                total_formatted = f"{total_pence / 100:.2f} {currency}"

            # Build checkout via /predirect for now (session checkout needs more mobile work)
            predirect_result = client.predirect(shopping_list=shopping_list, supermarket_domain=supermarket_domain)
            checkout_url = predirect_result.get("redirect_url", "")
            checkout_mode = "products"

        except Exception as e:
            logger.warning("[grocery] /products failed, falling back to /predirect: %s", e)
            has_key = False

    if not has_key:
        # Phase 1: no API key — open the supermarket's own search page in-app
        checkout_url = supermarket_search_url(supermarket_domain, items)
        checkout_mode = "predirect"
        logger.info("[grocery] no API key — using direct supermarket URL: %s", checkout_url)

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
        "[grocery] basket built | mode=%s | items=%d | missing=%d | total=%s | url=%s",
        checkout_mode, len(product_items), len(missing_items), total_formatted, checkout_url[:80] if checkout_url else "",
    )

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
