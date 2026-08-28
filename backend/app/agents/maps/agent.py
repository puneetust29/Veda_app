from __future__ import annotations

import logging
import pathlib

from app.agents.base.contracts import AgentContext, AgentMode, AgentResult, BaseAgent
from app.agents.base.manifest import load_manifest
from app.config import get_settings

from .maps_client import geocode, get_route
from .schemas import LatLng, MapsResult

logger = logging.getLogger(__name__)
_MANIFEST_PATH = pathlib.Path(__file__).parent / "manifest.yaml"


class MapsAgent(BaseAgent):
    def __init__(self) -> None:
        self.manifest = load_manifest(_MANIFEST_PATH)

    def execute(self, ctx: AgentContext, mode: AgentMode) -> AgentResult:
        settings = get_settings()
        api_key = settings.google_maps_api_key

        flight = ctx.context.get("calendar_event", {})
        origin = flight.get("origin", "")
        destination = flight.get("destination", "")

        logger.info("[maps_agent] origin='%s' destination='%s'", origin, destination)

        if not origin or not destination:
            result = MapsResult(
                origin=origin,
                destination=destination,
                summary="Unable to show map — missing origin or destination.",
            )
            ctx.emit({"type": "maps_result", "data": result.model_dump()})
            ctx.emit({"type": "done", "data": {"status": "ok"}})
            return AgentResult(
                agent="maps_agent",
                version="0.1.0",
                status="ok",
                summary=result.summary,
                raw=result.model_dump(),
            )

        origin_latlng = None
        destination_latlng = None
        geocode_ok = False

        if api_key:
            raw_origin = geocode(origin, api_key)
            raw_dest = geocode(destination, api_key)
            if raw_origin:
                origin_latlng = LatLng(**raw_origin)
            if raw_dest:
                destination_latlng = LatLng(**raw_dest)
            geocode_ok = bool(origin_latlng and destination_latlng)
        else:
            logger.warning("[maps_agent] GOOGLE_MAPS_API_KEY not set — skipping geocode")

        route_ok = False
        distance_km = None
        duration_mins = None
        encoded_polyline = None

        if api_key and geocode_ok:
            route = get_route(origin, destination, api_key)
            if route:
                route_ok = True
                distance_km = round(route["distance_m"] / 1000, 1)
                duration_mins = max(1, round(route["duration_secs"] / 60))
                encoded_polyline = route["encoded_polyline"]
                logger.info(
                    "[maps_agent] route: %.1f km, %d min", distance_km, duration_mins
                )

        if route_ok:
            summary = f"{origin} → {destination}: {distance_km} km, ~{duration_mins} min drive"
        elif geocode_ok:
            summary = f"{origin} → {destination}: locations found, route unavailable"
        else:
            summary = f"{origin} → {destination}"

        result = MapsResult(
            origin=origin,
            destination=destination,
            origin_latlng=origin_latlng,
            destination_latlng=destination_latlng,
            distance_km=distance_km,
            duration_mins=duration_mins,
            encoded_polyline=encoded_polyline,
            summary=summary,
            geocode_ok=geocode_ok,
            route_ok=route_ok,
        )

        logger.info("[maps_agent] done — %s", summary)
        ctx.emit({"type": "maps_result", "data": result.model_dump()})
        ctx.emit({"type": "done", "data": {"status": "ok"}})

        return AgentResult(
            agent="maps_agent",
            version="0.1.0",
            status="ok",
            summary=summary,
            raw=result.model_dump(),
        )

    async def execute_action(self, ctx: AgentContext, action: str) -> AgentResult:
        return AgentResult(
            agent="maps_agent",
            version="0.1.0",
            status="error",
            summary="Actions not implemented",
            raw={"error": "not_implemented"},
        )


AGENT = MapsAgent()
