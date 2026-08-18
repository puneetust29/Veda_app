"""Prompt strings for the roaming agent's LLM nodes, extracted verbatim from graph.py
so the graph module stays focused on topology/control-flow."""


def recommend_prompt(destination_country: str, trip_duration_days: int, roaming_catalog: list, judge_feedback: str = "") -> str:
    feedback_note = ""
    if judge_feedback:
        feedback_note = (
            f"\n\nYour previous recommendation was rejected: {judge_feedback}. "
            "Pick a different, better-fitting plan."
        )

    return (
        "You are a telecom roaming plan advisor. A customer is travelling to "
        f"{destination_country} for {trip_duration_days} days.\n\n"
        f"Available roaming plans (JSON):\n{roaming_catalog}\n\n"
        "Pick the single best-fitting plan id for this trip, balancing data allowance "
        "vs. trip length vs. price. Prefer a plan whose duration_days covers the whole "
        "trip without being wastefully long, and enough data_gb for typical use."
        f"{feedback_note}"
    )


def judge_prompt(trip_duration_days: int, destination_country: str, candidate_plan: dict, reasoning: str) -> str:
    return (
        "You are reviewing a roaming-plan recommendation before it is subscribed on a "
        "customer's behalf.\n\n"
        f"Trip: {trip_duration_days} days to {destination_country}.\n"
        f"Recommended plan: {candidate_plan}\n"
        f"Advisor's reasoning: {reasoning}\n\n"
        "Approve only if the plan's duration_days covers the trip length and the data "
        "allowance is reasonable for the trip length. Reject with clear feedback otherwise."
    )
