from langchain_anthropic import ChatAnthropic
from langgraph.graph import END, StateGraph
from langgraph.types import StreamWriter

from app.agents.roaming.prompts import judge_prompt, recommend_prompt
from app.agents.roaming.schemas import JudgeVerdict, PlanRecommendation
from app.agents.roaming.state import RoamingAgentState
from app.agents.roaming.trip import extract_trip_context
from app.config import get_settings
from app.tools.mobile import fetch_roaming_catalog, subscribe_roaming_plan

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
    country, days = extract_trip_context(state["calendar_event"])
    writer({"kind": "status", "text": f"You're going to {country} for {days} days."})
    return {"destination_country": country, "trip_duration_days": days}


def node_fetch_catalog(state: RoamingAgentState, writer: StreamWriter) -> dict:
    writer({"kind": "tool_started", "tool": "mobile.get_roaming_plans"})
    catalog = fetch_roaming_catalog(state["destination_country"])
    writer({"kind": "tool_completed", "tool": "mobile.get_roaming_plans", "count": len(catalog)})
    return {"roaming_catalog": catalog}


def node_recommend_plan(state: RoamingAgentState, writer: StreamWriter) -> dict:
    llm = _llm().with_structured_output(PlanRecommendation)

    prompt = recommend_prompt(
        destination_country=state["destination_country"],
        trip_duration_days=state["trip_duration_days"],
        roaming_catalog=state["roaming_catalog"],
        judge_feedback=state.get("judge_feedback", ""),
    )

    writer(
        {
            "kind": "status",
            "text": f"Comparing {len(state['roaming_catalog'])} roaming plans for a "
            f"{state['trip_duration_days']}-day trip…",
        }
    )

    result = llm.invoke(prompt)
    chosen = next((p for p in state["roaming_catalog"] if p["id"] == result.plan_id), None)
    return {"candidate_plan": chosen, "reasoning": result.reasoning}


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


def build_recommend_graph():
    """Steps 1-4: extract trip context -> fetch catalog -> recommend -> judge (with retry)."""
    graph = StateGraph(RoamingAgentState)
    graph.add_node("extract_trip_context", node_extract_trip_context)
    graph.add_node("fetch_catalog", node_fetch_catalog)
    graph.add_node("recommend_plan", node_recommend_plan)
    graph.add_node("judge", node_judge)

    graph.set_entry_point("extract_trip_context")
    graph.add_edge("extract_trip_context", "fetch_catalog")
    graph.add_edge("fetch_catalog", "recommend_plan")
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


recommend_graph = build_recommend_graph()
subscribe_graph = build_subscribe_graph()
