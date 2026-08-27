"""Workflow orchestration: chains roaming and insurance agents in sequence.

Note: Current implementation uses the existing roaming and insurance agents.
For MVP, the workflow acts as a coordinator that:
  1. Loads flight details
  2. Shows roaming agent normally (no changes to roaming flow)
  3. After roaming, shows insurance agent (triggers auto-fetching of insurance)
  4. Emits workflow completion

This leverages existing agent streams rather than embedding sub-graphs,
keeping integration simpler and reducing state transformation complexity.
"""

from langgraph.graph import END, StateGraph
from langgraph.types import StreamWriter

from app.agents.workflow.state import WorkflowAgentState
from app.agents.roaming.trip import extract_trip_context


def node_load_details(state: WorkflowAgentState, writer: StreamWriter) -> dict:
    """Load and display flight details."""
    writer({"kind": "status", "text": "Loading flight details…"})

    calendar_event = state.get("calendar_event", {})
    country, days, trip_details = extract_trip_context(calendar_event)

    # Format for display
    from datetime import datetime
    try:
        departure_date = datetime.fromisoformat(trip_details["departure_date"].replace("Z", "+00:00"))
        departure_str = departure_date.strftime("%b %d")
    except Exception:
        departure_str = "Unknown date"

    if trip_details.get("is_round_trip") and trip_details.get("return_date"):
        try:
            return_date = datetime.fromisoformat(trip_details["return_date"].replace("Z", "+00:00"))
            return_str = return_date.strftime("%b %d")
        except Exception:
            return_str = "Unknown date"
        trip_summary = (
            f"Round-trip: {trip_details.get('departure_city', '')} ({departure_str}) "
            f"→ {trip_details.get('destination_city', '')} ({return_str})\n"
            f"Destination: {country} | Duration: {days} days"
        )
    else:
        trip_summary = (
            f"One-way flight: {trip_details.get('departure_city', '')} ({departure_str}) "
            f"→ {trip_details.get('destination_city', '')}\n"
            f"Destination: {country} | Duration: {days} days"
        )

    writer({"kind": "status", "text": trip_summary})

    return {
        "current_step": "roaming",
        "completed_steps": ["load_details"],
        "destination_country": country,
        "trip_duration_days": days,
        "trip_details": trip_details,
    }


def node_workflow_ready(state: WorkflowAgentState, writer: StreamWriter) -> dict:
    """Mark workflow as ready - this node is reached at the end."""
    # Emit completion status
    writer({"kind": "status", "text": "You're all set for your trip!"})
    return {
        "current_step": "complete",
        "completed_steps": state.get("completed_steps", []) + ["roaming", "insurance"],
    }


def build_workflow_graph():
    """Build the workflow graph.

    For MVP, this is a simple graph that just loads details,
    then relies on the orchestrator to run roaming/insurance agents.
    The workflow endpoints will handle the full coordination.
    """
    graph = StateGraph(WorkflowAgentState)

    # Add nodes
    graph.add_node("load_details", node_load_details)

    # Set entry point
    graph.set_entry_point("load_details")
    graph.add_edge("load_details", END)

    return graph.compile()


# Export compiled graph
workflow_graph = build_workflow_graph()
