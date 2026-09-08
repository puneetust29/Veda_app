from __future__ import annotations

import logging
import pathlib

from app.agents.base.contracts import AgentContext, AgentMode, AgentResult, BaseAgent
from app.agents.base.manifest import load_manifest
from app.config import get_settings

from .maps_client import geocode, get_nearby_places, get_route
from .schemas import LatLng, MapsResult, NearbyPlace, RouteOption

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

        # ── Routing (all 3 modes) ────────────────────────────────────────────
        route_ok = False
        distance_km = None
        duration_mins = None
        encoded_polyline = None
        routes: list[RouteOption] = []

        if api_key and geocode_ok:
            for mode in ["DRIVE", "TRANSIT", "WALK"]:
                logger.info("  [route] requesting %s route: '%s' → '%s'", mode, origin, destination)
                route = get_route(origin, destination, api_key, mode)
                if route:
                    dist = round(route["distance_m"] / 1000, 1) if route["distance_m"] else None
                    mins = max(1, round(route["duration_secs"] / 60))
                    polyline = route["encoded_polyline"]
                    routes.append(RouteOption(mode=mode, duration_mins=mins, distance_km=dist, encoded_polyline=polyline))
                    logger.info("  [route] %s OK ✓ — %s km, %d min", mode, dist, mins)
                    if mode == "DRIVE":
                        route_ok = True
                        distance_km = dist
                        duration_mins = mins
                        encoded_polyline = polyline
                else:
                    logger.warning("  [route] %s — no route returned", mode)
        elif geocode_ok:
            logger.info("  [route] SKIP — no api_key")
        else:
            logger.info("  [route] SKIP — geocode did not succeed")

        # ── Nearby Places ────────────────────────────────────────────────────
        nearby_places: list[NearbyPlace] = []
        if api_key and destination_latlng:
            logger.info("  [places] fetching nearby places at destination lat=%.4f lng=%.4f", destination_latlng.lat, destination_latlng.lng)
            raw_places = get_nearby_places(destination_latlng.lat, destination_latlng.lng, api_key)
            nearby_places = [NearbyPlace(**p) for p in raw_places]
            logger.info("  [places] %d places found", len(nearby_places))

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
            routes=routes,
            nearby_places=nearby_places,
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
