"""LangGraph for travel insurance plan recommendation and judgment."""
from typing import TypedDict, Optional
from langchain_anthropic import ChatAnthropic
from langgraph.graph import END, StateGraph
from langgraph.types import StreamWriter
import logging

from app.agents.roaming.trip import extract_trip_context
from app.agents.travel_insurance.prompts import recommend_prompt
from app.agents.travel_insurance.schemas import PlanRecommendation
from app.config import get_settings
from app.tools.insurance import fetch_insurance_catalog

logger = logging.getLogger(__name__)


class TravelInsuranceAgentState(TypedDict, total=False):
    """State for travel insurance recommendation flow."""
    run_id: str
    customer_id: str
    conversation_id: Optional[str]
    mode: str
    context: dict
    customer: dict
    calendar_event: dict
    user_message: Optional[str]
    destination_country: str
    trip_duration_days: int
    trip_details: dict
    insurance_catalog: list
    candidate_plan: Optional[dict]
    reasoning: str


def _llm():
    settings = get_settings()
    return ChatAnthropic(
        model=settings.anthropic_model,
        api_key=settings.anthropic_api_key,
    )


def node_extract_trip_context(state: TravelInsuranceAgentState, writer: StreamWriter) -> dict:
    """Extract trip destination and duration from calendar event."""
    logger.info(f"[graph] extract_trip_context START")
    try:
        country, days, trip_details = extract_trip_context(state["calendar_event"])
        logger.info(f"[graph] extract_trip_context: country={country}, days={days}")
        return {
            "destination_country": country,
            "trip_duration_days": days,
            "trip_details": trip_details,
        }
    except Exception as e:
        logger.exception(f"[graph] extract_trip_context FAILED: {e}")
        raise


def node_fetch_catalog(state: TravelInsuranceAgentState, writer: StreamWriter) -> dict:
    """Fetch travel insurance plans for the destination country."""
    logger.info(f"[graph] fetch_catalog START: country={state.get('destination_country')}")
    try:
        writer({"kind": "tool_started", "tool": "insurance.get_plans"})
        catalog = fetch_insurance_catalog(state["destination_country"])
        logger.info(f"[graph] fetch_catalog: got {len(catalog)} plans")
        writer({"kind": "tool_completed", "tool": "insurance.get_plans", "count": len(catalog)})
        if not catalog:
            writer(
                {
                    "kind": "status",
                    "text": f"No travel insurance plans available for {state['destination_country']}.",
                }
            )
        return {"insurance_catalog": catalog}
    except Exception as e:
        logger.exception(f"[graph] fetch_catalog FAILED: {e}")
        raise


def route_after_fetch_catalog(state: TravelInsuranceAgentState) -> str:
    """Route based on whether catalog has plans."""
    return "empty" if not state.get("insurance_catalog") else "has_plans"


def _next_tier_plan(catalog: list[dict], trip_duration_days: int) -> dict | None:
    """Shortest plan whose coverageDurationDays covers the trip; else longest available."""
    covering = [p for p in catalog if p.get("coverageDurationDays", 0) >= trip_duration_days]
    if covering:
        return min(covering, key=lambda p: p.get("coverageDurationDays", 999))
    if catalog:
        return max(catalog, key=lambda p: p.get("coverageDurationDays", 0))
    return None


def node_recommend_plan(state: TravelInsuranceAgentState, writer: StreamWriter) -> dict:
    """Recommend a travel insurance plan using LLM."""
    logger.info(f"[graph] recommend_plan START")
    try:
        llm = _llm().with_structured_output(PlanRecommendation)

        catalog = fetch_insurance_catalog(state["destination_country"])
        suggested_plan = _next_tier_plan(catalog, state["trip_duration_days"])
        logger.info(f"[graph] recommend_plan: catalog={len(catalog)}, anchor={suggested_plan.get('planName') if suggested_plan else 'none'}")

        prompt = recommend_prompt(
            destination_country=state["destination_country"],
            trip_duration_days=state["trip_duration_days"],
            insurance_catalog=catalog,
            suggested_plan=suggested_plan,
        )

        writer(
            {
                "kind": "status",
                "text": f"Comparing {len(catalog)} insurance plans for {state['trip_duration_days']}-day trip…",
            }
        )

        result = llm.invoke(prompt)
        logger.info(f"[graph] LLM returned plan_id={result.plan_id}")
        chosen = next((p for p in catalog if p.get("id") == result.plan_id), None)
        if not chosen:
            logger.warning(f"[graph] plan_id {result.plan_id} not in catalog!")
        logger.info(f"[graph] recommend_plan: chosen={chosen.get('planName') if chosen else 'none'}")
        return {"candidate_plan": chosen, "reasoning": result.reasoning, "insurance_catalog": catalog}
    except Exception as e:
        logger.exception(f"[graph] recommend_plan FAILED: {e}")
        raise


def build_recommend_graph():
    """Build the recommend graph: extract trip context -> fetch catalog -> recommend -> END."""
    graph = StateGraph(TravelInsuranceAgentState)
    graph.add_node("extract_trip_context", node_extract_trip_context)
    graph.add_node("fetch_catalog", node_fetch_catalog)
    graph.add_node("recommend_plan", node_recommend_plan)

    graph.set_entry_point("extract_trip_context")
    graph.add_edge("extract_trip_context", "fetch_catalog")
    graph.add_conditional_edges(
        "fetch_catalog",
        route_after_fetch_catalog,
        {"empty": END, "has_plans": "recommend_plan"},
    )
    graph.add_edge("recommend_plan", END)
    return graph.compile()


recommend_graph = build_recommend_graph()
