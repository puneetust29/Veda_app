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
        logger.info("━━━ maps_agent START ━━━")

        settings = get_settings()
        api_key = settings.google_maps_api_key
        logger.info("  api_key loaded: %s", "YES" if api_key else "NO — check GOOGLE_MAPS_API_KEY in backend/.env")

        flight = ctx.context.get("calendar_event", {})
        origin = flight.get("origin", "")
        destination = flight.get("destination", "")
        logger.info("  flight context — origin='%s'  destination='%s'", origin, destination)

        if not origin or not destination:
            logger.warning("  SKIP — missing origin or destination in calendar_event context")
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

        # ── Geocoding ────────────────────────────────────────────────────────
        origin_latlng = None
        destination_latlng = None
        geocode_ok = False

        if api_key:
            logger.info("  [geocode] looking up origin: '%s'", origin)
            raw_origin = geocode(origin, api_key)
            if raw_origin:
                origin_latlng = LatLng(**raw_origin)
                logger.info("  [geocode] origin OK → lat=%.4f  lng=%.4f", raw_origin["lat"], raw_origin["lng"])
            else:
                logger.warning("  [geocode] origin FAILED — '%s' returned no results", origin)

            logger.info("  [geocode] looking up destination: '%s'", destination)
            raw_dest = geocode(destination, api_key)
            if raw_dest:
                destination_latlng = LatLng(**raw_dest)
                logger.info("  [geocode] destination OK → lat=%.4f  lng=%.4f", raw_dest["lat"], raw_dest["lng"])
            else:
                logger.warning("  [geocode] destination FAILED — '%s' returned no results", destination)

            geocode_ok = bool(origin_latlng and destination_latlng)
            logger.info("  [geocode] result: %s", "BOTH OK ✓" if geocode_ok else "PARTIAL/FAILED ✗")
        else:
            logger.warning("  [geocode] SKIP — GOOGLE_MAPS_API_KEY not set in backend/.env")

        # ── Routing ──────────────────────────────────────────────────────────
        route_ok = False
        distance_km = None
        duration_mins = None
        encoded_polyline = None

        if api_key and geocode_ok:
            logger.info("  [route] requesting drive route: '%s' → '%s'", origin, destination)
            route = get_route(origin, destination, api_key)
            if route:
                route_ok = True
                distance_km = round(route["distance_m"] / 1000, 1)
                duration_mins = max(1, round(route["duration_secs"] / 60))
                encoded_polyline = route["encoded_polyline"]
                logger.info(
                    "  [route] OK ✓ — %.1f km, %d min, polyline %d chars",
                    distance_km, duration_mins, len(encoded_polyline or ""),
                )
            else:
                logger.warning(
                    "  [route] no drive route returned (international flight? routes API limitation)"
                )
        elif geocode_ok:
            logger.info("  [route] SKIP — no api_key")
        else:
            logger.info("  [route] SKIP — geocode did not succeed")

        # ── Result ───────────────────────────────────────────────────────────
        if route_ok:
            summary = f"{origin} → {destination}: {distance_km} km, ~{duration_mins} min drive"
        elif geocode_ok:
            summary = f"{origin} → {destination}: both locations found on map"
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

        logger.info("  emitting maps_result — geocode_ok=%s  route_ok=%s", geocode_ok, route_ok)
        logger.info("  summary: %s", summary)
        logger.info("━━━ maps_agent END ━━━")

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
