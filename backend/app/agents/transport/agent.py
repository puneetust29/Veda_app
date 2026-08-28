from __future__ import annotations

import pathlib
import sys

from app.agents.base.contracts import AgentContext, AgentMode, AgentResult, BaseAgent
from app.agents.base.manifest import load_manifest
from .schemas import JourneyLeg, JourneyOption, LineStatus, TransportResult
from .tfl_client import (
    CENTRAL_LONDON,
    detect_london_airport,
    get_journey,
    get_line_status,
    is_london,
)

_MANIFEST_PATH = pathlib.Path(__file__).parent / "manifest.yaml"

# Severity ≤ this threshold is considered a disruption worth highlighting
_DISRUPTION_SEVERITY_THRESHOLD = 9


def _parse_line_statuses(raw: list[dict]) -> list[LineStatus]:
    statuses = []
    for line in raw:
        line_statuses = line.get("lineStatuses", [])
        if not line_statuses:
            continue
        top = line_statuses[0]
        disruption_desc = top.get("reason") or None
        # Only include disruption text for actual disruptions
        severity = top.get("statusSeverity", 10)
        if severity >= _DISRUPTION_SEVERITY_THRESHOLD and disruption_desc:
            disruption_desc = None
        statuses.append(
            LineStatus(
                line_name=line.get("name", ""),
                status=top.get("statusSeverityDescription", ""),
                severity=severity,
                disruption=disruption_desc,
            )
        )
    return statuses


def _parse_journey_options(raw: list[dict]) -> list[JourneyOption]:
    options = []
    for journey in raw[:2]:  # at most 2 options
        legs = []
        for leg in journey.get("legs", []):
            mode = leg.get("mode", {}).get("name", "unknown")
            instruction = leg.get("instruction", {}).get("summary", "")
            duration = leg.get("duration", 0)
            if instruction:
                legs.append(JourneyLeg(mode=mode, instruction=instruction, duration_mins=duration))
        if legs:
            options.append(JourneyOption(duration_mins=journey.get("duration", 0), legs=legs))
    return options


def _build_summary(result: TransportResult) -> str:
    disrupted = [s for s in result.line_statuses if s.severity < _DISRUPTION_SEVERITY_THRESHOLD]
    good_count = len([s for s in result.line_statuses if s.severity >= _DISRUPTION_SEVERITY_THRESHOLD])

    if result.direction == "from_london":
        intro = f"Getting to {result.airport} today:"
    elif result.direction == "to_london":
        intro = f"Getting from {result.airport} into London today:"
    else:
        intro = "London transport today:"

    if not disrupted:
        return f"{intro} all {good_count} lines running normally."

    disruption_names = ", ".join(s.line_name for s in disrupted[:3])
    return f"{intro} {len(disrupted)} disruption(s) — {disruption_names}."


class TransportAgent(BaseAgent):
    def __init__(self) -> None:
        self.manifest = load_manifest(_MANIFEST_PATH)

    def execute(self, ctx: AgentContext, mode: AgentMode = "suggest") -> AgentResult:
        try:
            flight = ctx.context.get("calendar_event", {})
            origin = flight.get("origin", "") or ""
            destination = flight.get("destination", "") or ""

            # Detect whether this flight involves London at all
            origin_airport = detect_london_airport(origin)
            dest_airport = detect_london_airport(destination)
            london_origin = origin_airport or is_london(origin)
            london_dest = dest_airport or is_london(destination)

            if not london_origin and not london_dest:
                # Not a London trip — skip silently
                ctx.emit({"type": "done", "data": {"status": "skipped"}})
                return AgentResult(
                    agent="transport_agent",
                    version="0.1.0",
                    status="ok",
                    summary="No London leg detected — transport agent skipped.",
                )

            ctx.emit({"type": "status", "data": {"text": "Checking London transport status…"}})

            # Determine direction and airport for journey planning
            if origin_airport:
                direction = "from_london"
                airport_meta = origin_airport
            elif dest_airport:
                direction = "to_london"
                airport_meta = dest_airport
            else:
                direction = "from_london" if london_origin else "to_london"
                airport_meta = None

            # Fetch live line statuses
            raw_statuses = get_line_status()
            line_statuses = _parse_line_statuses(raw_statuses)

            # Fetch journey options if we know the airport
            journey_options: list[JourneyOption] = []
            if airport_meta:
                airport_loc = airport_meta["journey_loc"]
                try:
                    if direction == "from_london":
                        raw_journeys = get_journey(CENTRAL_LONDON, airport_loc)
                    else:
                        raw_journeys = get_journey(airport_loc, CENTRAL_LONDON)
                    journey_options = _parse_journey_options(raw_journeys)
                except Exception as e:
                    print(f"[transport_agent] Journey planning failed: {e}", file=sys.stderr)

            result = TransportResult(
                has_london=True,
                direction=direction,
                airport=airport_meta["name"] if airport_meta else None,
                line_statuses=line_statuses,
                journey_options=journey_options,
                summary=_build_summary(
                    TransportResult(
                        has_london=True,
                        direction=direction,
                        airport=airport_meta["name"] if airport_meta else None,
                        line_statuses=line_statuses,
                    )
                ),
            )

            ctx.emit({"type": "transport_result", "data": result.model_dump()})
            ctx.emit({"type": "done", "data": {"status": "ok"}})

            return AgentResult(
                agent="transport_agent",
                version="0.1.0",
                status="ok",
                summary=result.summary,
                raw=result.model_dump(),
            )

        except Exception as e:
            print(f"[transport_agent] Error: {e}", file=sys.stderr)
            ctx.emit({"type": "error", "data": {"code": "transport_agent_error", "retryable": False, "message": str(e)}})
            ctx.emit({"type": "done", "data": {"status": "failed"}})
            return AgentResult(
                agent="transport_agent",
                version="0.1.0",
                status="failed",
                error=str(e),
            )


AGENT = TransportAgent()
