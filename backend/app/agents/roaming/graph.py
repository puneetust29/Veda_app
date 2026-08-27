from __future__ import annotations

from langchain_anthropic import ChatAnthropic
from langgraph.graph import END, StateGraph
from langgraph.types import StreamWriter

from app.agents.roaming.prompts import followup_prompt, judge_prompt, recommend_prompt
from app.agents.roaming.schemas import FollowUpVerdict, JudgeVerdict, PlanRecommendation
from app.agents.roaming.state import RoamingAgentState
from app.agents.roaming.trip import extract_trip_context
from app.config import get_settings
from app.tools.mobile import fetch_roaming_catalog, subscribe_roaming_plan
from app.utils.airport_mapper import normalize_country_name

MAX_RETRIES = 2


def _llm():
    settings = get_settings()
    return ChatAnthropic(
        model=settings.anthropic_model,
        api_key=settings.anthropic_api_key,
    )


def node_extract_trip_context(state: RoamingAgentState, writer: StreamWriter) -> dict:
    # Emitted before any Anthropic call -- this is the first user-visible event on the
    # /chat/stream path, deliberately dependency-free so it lands well within a client's
    # inactivity timeout even on a cold LLM start. `writer` is LangGraph's injected
    # no-op under .invoke() (verified against langgraph/utils/runnable.py), so this is
    # inert for the legacy blocking routes.
    writer({"kind": "status", "text": "Reading your flight details…"})
    country, days, trip_details = extract_trip_context(state["calendar_event"])

    # Format trip details for display
    from datetime import datetime
    try:
        departure_date = datetime.fromisoformat(trip_details["departure_date"].replace("Z", "+00:00"))
        departure_str = departure_date.strftime("%b %d")
    except Exception:
        departure_str = "Unknown date"

    if trip_details["is_round_trip"] and trip_details["return_date"]:
        try:
            return_date = datetime.fromisoformat(trip_details["return_date"].replace("Z", "+00:00"))
            return_str = return_date.strftime("%b %d")
        except Exception:
            return_str = "Unknown date"
        trip_summary = (
            f"Round-trip: {trip_details['departure_city']} ({departure_str}) "
            f"→ {trip_details['destination_city']} ({return_str})\n"
            f"Destination: {country} | Duration: {days} days"
        )
    else:
        trip_summary = (
            f"One-way flight: {trip_details['departure_city']} ({departure_str}) "
            f"→ {trip_details['destination_city']}\n"
            f"Destination: {country} | Duration: {days} days"
        )

    writer({"kind": "status", "text": trip_summary})
    return {
        "destination_country": country,
        "trip_duration_days": days,
        "trip_details": trip_details,
    }


def node_check_home_country(state: RoamingAgentState, writer: StreamWriter) -> dict:
    customer_country = normalize_country_name((state.get("customer") or {}).get("country", ""))
    destination = state.get("destination_country", "")
    is_home = bool(customer_country) and customer_country.strip().lower() == destination.strip().lower()
    if is_home:
        writer(
            {
                "kind": "status",
                "text": f"{destination} is your home country — no roaming plan needed.",
            }
        )
    return {"is_home_country": is_home}


def route_after_home_check(state: RoamingAgentState) -> str:
    return "home" if state.get("is_home_country") else "needs_plan"


def node_fetch_catalog(state: RoamingAgentState, writer: StreamWriter) -> dict:
    writer({"kind": "tool_started", "tool": "mobile.get_roaming_plans"})
    catalog = fetch_roaming_catalog(state["destination_country"])
    writer({"kind": "tool_completed", "tool": "mobile.get_roaming_plans", "count": len(catalog)})
    if not catalog:
        writer(
            {
                "kind": "status",
                "text": f"No roaming plans are currently available for "
                f"{state['destination_country']}.",
            }
        )
    return {"roaming_catalog": catalog}


def route_after_fetch_catalog(state: RoamingAgentState) -> str:
    # No point running recommend/judge against an empty catalog -- that just burns
    # MAX_RETRIES rounds of LLM calls to arrive at the same "no plan" outcome.
    return "empty" if not state.get("roaming_catalog") else "has_plans"


def _next_tier_plan(catalog: list[dict], trip_duration_days: int) -> dict | None:
    """Shortest plan whose duration_days covers the trip; if the trip outlasts every
    plan in the catalog, fall back to the longest one available."""
    covering = [p for p in catalog if p["duration_days"] >= trip_duration_days]
    if covering:
        return min(covering, key=lambda p: p["duration_days"])
    if catalog:
        return max(catalog, key=lambda p: p["duration_days"])
    return None


def node_recommend_plan(state: RoamingAgentState, writer: StreamWriter) -> dict:
    llm = _llm().with_structured_output(PlanRecommendation)

    # Re-fetch catalog for current destination (in case it changed during follow-up pivot)
    catalog = fetch_roaming_catalog(state["destination_country"])
    suggested_plan = _next_tier_plan(catalog, state["trip_duration_days"])

    prompt = recommend_prompt(
        destination_country=state["destination_country"],
        trip_duration_days=state["trip_duration_days"],
        roaming_catalog=catalog,
        judge_feedback=state.get("judge_feedback", ""),
        suggested_plan=suggested_plan,
    )

    writer(
        {
            "kind": "status",
            "text": f"Comparing {len(catalog)} roaming plans for a "
            f"{state['trip_duration_days']}-day trip…",
        }
    )

    result = llm.invoke(prompt)
    chosen = next((p for p in catalog if p["id"] == result.plan_id), None)
    return {"candidate_plan": chosen, "reasoning": result.reasoning, "roaming_catalog": catalog}


def node_judge(state: RoamingAgentState, writer: StreamWriter) -> dict:
    llm = _llm().with_structured_output(JudgeVerdict)

    prompt = judge_prompt(
        trip_duration_days=state["trip_duration_days"],
        destination_country=state["destination_country"],
        candidate_plan=state["candidate_plan"],
        reasoning=state["reasoning"],
    )

    verdict = llm.invoke(prompt)
    retry_count = state.get("retry_count", 0) + (0 if verdict.approved else 1)

    if verdict.approved:
        writer({"kind": "status", "text": "Double-checked — this plan fits."})
    elif retry_count < MAX_RETRIES:
        writer(
            {
                "kind": "status",
                "text": f"Second opinion: {verdict.feedback} Trying another plan…",
            }
        )

    return {
        "judge_approved": verdict.approved,
        "judge_feedback": verdict.feedback,
        "retry_count": retry_count,
    }


def node_handle_follow_up(state: RoamingAgentState, writer: StreamWriter) -> dict:
    llm = _llm().with_structured_output(FollowUpVerdict)

    prompt = followup_prompt(
        destination_country=state["destination_country"],
        trip_duration_days=state["trip_duration_days"],
        roaming_catalog=state["roaming_catalog"],
        user_message=state["user_message"],
        prior_candidate_plan=state.get("prior_candidate_plan"),
        prior_reasoning=state.get("prior_reasoning", ""),
        prior_judge_feedback=state.get("prior_judge_feedback", ""),
    )

    verdict = llm.invoke(prompt)

    if verdict.reply:
        writer({"kind": "text", "role": "agent", "text": verdict.reply})

    if verdict.on_topic and verdict.target_country:
        return {"destination_country": verdict.target_country, "followup_route": "new_country"}

    return {
        "followup_route": "answered" if verdict.on_topic else "off_topic",
        "followup_reply": verdict.reply,
    }


def route_after_follow_up(state: RoamingAgentState) -> str:
    return state.get("followup_route", "answered")


def route_after_judge(state: RoamingAgentState) -> str:
    if state.get("judge_approved"):
        return "approved"
    if state.get("retry_count", 0) >= MAX_RETRIES:
        return "give_up"
    return "retry"


def node_subscribe(state: RoamingAgentState) -> dict:
    result = subscribe_roaming_plan(
        customer_id=state["customer"]["id"],
        roaming_plan_id=state["candidate_plan"]["id"],
        calendar_event_id=state["calendar_event"]["id"],
        agent_reasoning={
            "reasoning": state["reasoning"],
            "judge_feedback": state["judge_feedback"],
        },
    )
    return {"subscription_result": result}


def build_follow_up_graph():
    """Follow-up chat flow: extract trip context -> fetch catalog -> handle follow-up.
    If the user wants a different country's plans, pivot to recommend/judge chain
    (destination_country was updated by handle_follow_up, so recommend_plan will use it).
    """
    graph = StateGraph(RoamingAgentState)
    graph.add_node("extract_trip_context", node_extract_trip_context)
    graph.add_node("check_home_country", node_check_home_country)
    graph.add_node("fetch_catalog", node_fetch_catalog)
    graph.add_node("handle_follow_up", node_handle_follow_up)
    graph.add_node("recommend_plan", node_recommend_plan)
    graph.add_node("judge", node_judge)

    graph.set_entry_point("extract_trip_context")
    graph.add_edge("extract_trip_context", "check_home_country")
    graph.add_conditional_edges(
        "check_home_country",
        route_after_home_check,
        {"home": END, "needs_plan": "fetch_catalog"},
    )
    graph.add_edge("fetch_catalog", "handle_follow_up")
    graph.add_conditional_edges(
        "handle_follow_up",
        route_after_follow_up,
        {"answered": END, "off_topic": END, "new_country": "recommend_plan"},
    )
    graph.add_edge("recommend_plan", "judge")
    graph.add_conditional_edges(
        "judge",
        route_after_judge,
        {"approved": END, "retry": "recommend_plan", "give_up": END},
    )
    return graph.compile()


def build_recommend_graph():
    """Steps 1-4: extract trip context -> fetch catalog -> recommend -> judge (with retry)."""
    graph = StateGraph(RoamingAgentState)
    graph.add_node("extract_trip_context", node_extract_trip_context)
    graph.add_node("check_home_country", node_check_home_country)
    graph.add_node("fetch_catalog", node_fetch_catalog)
    graph.add_node("recommend_plan", node_recommend_plan)
    graph.add_node("judge", node_judge)

    graph.set_entry_point("extract_trip_context")
    graph.add_edge("extract_trip_context", "check_home_country")
    graph.add_conditional_edges(
        "check_home_country",
        route_after_home_check,
        {"home": END, "needs_plan": "fetch_catalog"},
    )
    graph.add_conditional_edges(
        "fetch_catalog",
        route_after_fetch_catalog,
        {"empty": END, "has_plans": "recommend_plan"},
    )
    graph.add_edge("recommend_plan", "judge")
    graph.add_conditional_edges(
        "judge",
        route_after_judge,
        {"approved": END, "retry": "recommend_plan", "give_up": END},
    )
    return graph.compile()


def build_subscribe_graph():
    """Step 5: subscribe the already-judged plan."""
    graph = StateGraph(RoamingAgentState)
    graph.add_node("subscribe_plan", node_subscribe)
    graph.set_entry_point("subscribe_plan")
    graph.add_edge("subscribe_plan", END)
    return graph.compile()


follow_up_graph = build_follow_up_graph()
recommend_graph = build_recommend_graph()
subscribe_graph = build_subscribe_graph()
