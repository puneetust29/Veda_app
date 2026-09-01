"""Prompts for travel insurance recommendation and judgment."""
from typing import Optional


def recommend_prompt(
    destination_country: str,
    trip_duration_days: int,
    insurance_catalog: list[dict],
    suggested_plan: Optional[dict] = None,
) -> str:
    """Build the recommendation prompt for the insurance agent's LLM."""
    catalog_str = "\n".join(
        [
            f"  - ID: {p.get('id')}, Provider: {p.get('provider')}, Plan: {p.get('planName')}, "
            f"Duration: {p.get('coverageDurationDays')} days, Premium: £{p.get('premiumAmount')}, "
            f"Type: {p.get('planType')}"
            for p in insurance_catalog
        ]
    )

    suggested_note = ""
    if suggested_plan:
        suggested_note = f"\n\nSuggested tier: {suggested_plan.get('planName')} (ID: {suggested_plan.get('id')}) — the shortest plan covering the {trip_duration_days}-day trip, unless another plan clearly fits better based on coverage and value."

    return f"""You are recommending a travel insurance plan for a trip to {destination_country} lasting {trip_duration_days} days.

Available plans:
{catalog_str}

Consider:
- Coverage duration must support the {trip_duration_days}-day trip
- Premium cost vs. benefits
- Plan features relative to destination (adventure activities, medical coverage, etc.)
{suggested_note}

Choose the best plan ID and provide a brief reasoning."""
