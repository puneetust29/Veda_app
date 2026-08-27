"""Prompt strings for the roaming agent's LLM nodes, extracted verbatim from graph.py
so the graph module stays focused on topology/control-flow."""
from __future__ import annotations

import json


def recommend_prompt(
    destination_country: str,
    trip_duration_days: int,
    roaming_catalog: list,
    judge_feedback: str = "",
    suggested_plan: dict | None = None,
) -> str:
    feedback_note = ""
    if judge_feedback:
        feedback_note = (
            f"\n\nYour previous recommendation was rejected: {judge_feedback}. "
            "Pick a different, better-fitting plan."
        )

    tier_note = ""
    if suggested_plan:
        tier_note = (
            f"\n\nTiering rule: plans only come in fixed durations, so pick the shortest "
            f"plan whose duration_days is >= the trip length (or the longest available plan "
            f"if the trip outlasts every option). By that rule, the plan to pick here is "
            f"'{suggested_plan['plan_name']}' (id: {suggested_plan['id']}, "
            f"{suggested_plan['duration_days']} days) unless another plan clearly fits better."
        )

    return (
        "You are a telecom roaming plan advisor. A customer is travelling to "
        f"{destination_country} for {trip_duration_days} days.\n\n"
        f"Available roaming plans (JSON):\n{json.dumps(roaming_catalog, indent=2)}\n\n"
        "Pick the single best-fitting plan id for this trip, balancing data allowance "
        "vs. trip length vs. price. Prefer a plan whose duration_days covers the whole "
        "trip without being wastefully long, and enough data_gb for typical use."
        f"{tier_note}"
        f"{feedback_note}"
    )


def judge_prompt(trip_duration_days: int, destination_country: str, candidate_plan: dict, reasoning: str) -> str:
    return (
        "You are reviewing a roaming-plan recommendation before it is subscribed on a "
        "customer's behalf.\n\n"
        f"Trip: {trip_duration_days} days to {destination_country}.\n"
        f"Recommended plan: {json.dumps(candidate_plan)}\n"
        f"Advisor's reasoning: {reasoning}\n\n"
        "Approve if the plan's duration_days is >= the trip length and the data allowance "
        "is reasonable. Roaming plans only come in fixed tiers (e.g. 7/14/30 days) — if this "
        "is the shortest tier that still covers the trip, APPROVE it even though it runs "
        "longer than the trip itself; that is expected, not a flaw. Reject only if a "
        "shorter plan in the same catalog also covers the trip and wasn't chosen, or if the "
        "data allowance is clearly unreasonable for the trip length."
    )


def followup_prompt(
    destination_country: str,
    trip_duration_days: int,
    roaming_catalog: list,
    user_message: str,
    prior_candidate_plan: dict,
    prior_reasoning: str,
    prior_judge_feedback: str,
) -> str:
    return (
        "You are a telecom roaming plan advisor in a follow-up conversation.\n\n"
        f"Trip: {trip_duration_days} days to {destination_country}.\n\n"
        f"Available roaming plans for {destination_country} (JSON):\n{json.dumps(roaming_catalog, indent=2)}\n\n"
        f"Previously recommended plan: {json.dumps(prior_candidate_plan)}\n"
        f"Your reasoning: {prior_reasoning}\n"
        f"AI reviewer's feedback: {prior_judge_feedback}\n\n"
        f"Customer's message: {user_message}\n\n"
        "Respond to the customer's question or request. If they ask about roaming plans for this trip, "
        "answer directly based on the catalog and prior recommendation. If they explicitly ask for plans "
        "from a different country (e.g., 'what about France?' or 'show me options for Germany'), set "
        "target_country to that country's name (standard English capitalization, e.g., 'France', 'Japan'). "
        "If the message is off-topic (not about roaming plans for this trip), set on_topic=false and write "
        "a brief redirect in reply, e.g., 'I can only help with roaming plans for this trip — please start "
        "a new chat with Veda for anything else.'\n\n"
        "Always fill the 'reply' field with a short, friendly response in all cases."
    )
