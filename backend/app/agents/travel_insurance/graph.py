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
    trip_start_date: str
    trip_end_date: str
    insurance_catalog: list
    candidate_plan: Optional[dict]
    reasoning: str


def _llm():
    settings = get_settings()
    if settings.anthropic_api_key:
        return ChatAnthropic(model=settings.anthropic_model, api_key=settings.anthropic_api_key, temperature=0)
    raise RuntimeError("No LLM key configured — set ANTHROPIC_API_KEY or OPENAI_API_KEY in backend/.env")


def _format_date(date_str: str) -> str:
    """Format ISO date to readable format: 'December 25th 2024'."""
    from datetime import datetime
    try:
        dt = datetime.fromisoformat(date_str.replace('Z', '+00:00'))
        day = dt.day
        suffix = 'st' if day % 10 == 1 and day != 11 else 'nd' if day % 10 == 2 and day != 12 else 'rd' if day % 10 == 3 and day != 13 else 'th'
        return dt.strftime(f'%{day}{suffix} %B %Y').replace(f'%{day}', f'{day}{suffix}')
    except:
        return date_str


def node_extract_trip_context(state: TravelInsuranceAgentState, writer: StreamWriter) -> dict:
    """Extract trip destination, duration, and dates from calendar event."""
    logger.info(f"[graph] extract_trip_context START")
    try:
        country, days, trip_details = extract_trip_context(state["calendar_event"])

        # Extract and format trip dates
        start_datetime = state["calendar_event"].get("start_datetime", "")
        end_datetime = state["calendar_event"].get("end_datetime", "")
        trip_start_date = _format_date(start_datetime) if start_datetime else "Unknown"
        trip_end_date = _format_date(end_datetime) if end_datetime else "Unknown"

        logger.info(f"[graph] extract_trip_context: country={country}, days={days}, dates={trip_start_date} to {trip_end_date}")
        return {
            "destination_country": country,
            "trip_duration_days": days,
            "trip_details": trip_details,
            "trip_start_date": trip_start_date,
            "trip_end_date": trip_end_date,
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


def _next_tier_plan(catalog: list[dict], trip_duration_days: int) -> Optional[dict]:
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
            return {"candidate_plan": None, "reasoning": result.reasoning, "insurance_catalog": catalog}

        # Apply dynamic coverage dates based on actual trip dates
        chosen_copy = dict(chosen)
        chosen_copy["coverageStart"] = state.get("trip_start_date", chosen.get("coverageStart"))
        chosen_copy["coverageEnd"] = state.get("trip_end_date", chosen.get("coverageEnd"))

        logger.info(f"[graph] recommend_plan: chosen={chosen_copy.get('planName')}, coverage={chosen_copy.get('coverageStart')} to {chosen_copy.get('coverageEnd')}")
        return {"candidate_plan": chosen_copy, "reasoning": result.reasoning, "insurance_catalog": catalog}
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
