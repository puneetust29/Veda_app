from __future__ import annotations

import json
import logging
import os
import re
import shlex
import shutil
from typing import Any, Optional


from app.config import get_settings
from app.tools.mcp_client import McpClientError, StdioMcpClient

logger = logging.getLogger(__name__)


def _resolve_mcp_command(command: str) -> str:
    if not command:
        return command
    if os.path.sep in command:
        return command

    resolved = shutil.which(command)
    if resolved:
        return resolved

    if command == "npx":
        candidates = [
            os.path.join(os.environ.get("NVM_BIN", ""), "npx") if os.environ.get("NVM_BIN") else "",
            os.path.expanduser("~/.nvm/versions/node/v24.19.0/bin/npx"),
            os.path.expanduser("~/.nvm/versions/node/current/bin/npx"),
        ]
        for candidate in candidates:
            if candidate and os.path.isfile(candidate) and os.access(candidate, os.X_OK):
                logger.info("uber mcp command fallback resolved | command=%s | resolved=%s", command, candidate)
                return candidate

    logger.warning("uber mcp command unresolved | command=%s | path=%s", command, os.environ.get("PATH", ""))
    return command


def _mcp_process_config() -> tuple[str, list[str], dict[str, str], str, float]:
    settings = get_settings()
    configured_command = settings.uber_mcp_command or "npx"
    command = _resolve_mcp_command(configured_command)
    args = shlex.split(settings.uber_mcp_args or "mcp-uber")

    env = os.environ.copy()
    env.update({
        "UBER_CLIENT_ID": settings.uber_client_id,
        "UBER_REDIRECT_URI": settings.uber_redirect_uri,
        "UBER_ENVIRONMENT": settings.uber_mcp_environment,
    })
    if settings.uber_client_secret:
        env["UBER_CLIENT_SECRET"] = settings.uber_client_secret
    if settings.uber_server_token:
        env["UBER_SERVER_TOKEN"] = settings.uber_server_token

    command_dir = os.path.dirname(command)
    if command_dir:
        env["PATH"] = f"{command_dir}:{env.get('PATH', '')}" if env.get("PATH") else command_dir

    logger.info(
        "uber mcp config prepared | configured_command=%s | resolved_command=%s | args=%s | environment=%s | has_client_secret=%s | has_server_token=%s | timeout_seconds=%.1f",
        configured_command,
        command,
        args,
        settings.uber_mcp_environment,
        bool(settings.uber_client_secret),
        bool(settings.uber_server_token),
        settings.uber_mcp_timeout_seconds,
    )
    return command, args, env, settings.uber_mcp_protocol_version, settings.uber_mcp_timeout_seconds


def uber_mcp_is_configured() -> bool:
    settings = get_settings()
    configured = bool((settings.uber_mcp_command or "").strip() and (settings.uber_client_id or "").strip())
    logger.debug("uber mcp configured=%s", configured)
    return configured


def _session() -> StdioMcpClient:
    command, args, env, protocol_version, timeout_seconds = _mcp_process_config()
    return StdioMcpClient(
        command=command,
        args=args,
        env=env,
        protocol_version=protocol_version,
        timeout_seconds=timeout_seconds,
    )


def _tool_result_text(result: dict) -> str:
    parts: list[str] = []
    for item in result.get("content", []):
        if isinstance(item, dict) and item.get("type") == "text":
            text = item.get("text")
            if isinstance(text, str) and text.strip():
                parts.append(text.strip())
    return "\n".join(parts).strip()


def _extract_url(text: str) -> Optional[str]:
    match = re.search(r"https?://\S+", text)
    return match.group(0) if match else None


def _extract_json_payload(result: dict) -> Any:
    structured = result.get("structuredContent")
    if structured is not None:
        return structured

    text = _tool_result_text(result)
    if not text:
        return None

    if text.startswith("Error:"):
        raise McpClientError(text)

    try:
        return json.loads(text)
    except json.JSONDecodeError as exc:
        raise McpClientError(f"MCP tool did not return JSON: {text}") from exc


def list_uber_mcp_tools() -> list[dict[str, Any]]:
    if not uber_mcp_is_configured():
        logger.info("uber mcp tools skipped | reason=not_configured")
        return []
    with _session() as client:
        tools = client.list_tools()
    logger.info("uber mcp tools loaded | count=%d", len(tools))
    return tools


def get_uber_auth_url(*, user_id: str) -> str:
    if not uber_mcp_is_configured():
        raise McpClientError("Uber MCP is not configured")

    logger.info("uber mcp auth url request | user_id=%s", user_id)
    with _session() as client:
        result = client.call_tool("uber_get_auth_url", {"userId": user_id})

    text = _tool_result_text(result)
    if text.startswith("Error:"):
        raise McpClientError(text)

    auth_url = _extract_url(text)
    if not auth_url:
        raise McpClientError("Uber MCP auth tool did not return a URL")
    logger.info("uber mcp auth url success | user_id=%s", user_id)
    return auth_url


def set_uber_access_token(*, user_id: str, access_token: str) -> None:
    if not uber_mcp_is_configured():
        raise McpClientError("Uber MCP is not configured")

    logger.info("uber mcp set access token | user_id=%s | token_present=%s", user_id, bool(access_token))
    with _session() as client:
        result = client.call_tool(
            "uber_set_access_token",
            {"userId": user_id, "accessToken": access_token},
        )

    text = _tool_result_text(result)
    if text.startswith("Error:"):
        raise McpClientError(text)
    logger.info("uber mcp set access token complete | user_id=%s", user_id)


def get_uber_price_estimates(
    *,
    user_id: str,
    access_token: str,
    start_latitude: float,
    start_longitude: float,
    end_latitude: float,
    end_longitude: float,
) -> list[dict[str, Any]]:
    if not uber_mcp_is_configured():
        raise McpClientError("Uber MCP is not configured")

    logger.info(
        "uber mcp price estimates request | user_id=%s | token_present=%s | start=(%.5f, %.5f) | end=(%.5f, %.5f)",
        user_id,
        bool(access_token),
        start_latitude,
        start_longitude,
        end_latitude,
        end_longitude,
    )
    with _session() as client:
        client.call_tool(
            "uber_set_access_token",
            {"userId": user_id, "accessToken": access_token},
        )
        result = client.call_tool(
            "uber_get_price_estimates",
            {
                "userId": user_id,
                "startLatitude": start_latitude,
                "startLongitude": start_longitude,
                "endLatitude": end_latitude,
                "endLongitude": end_longitude,
            },
        )

    payload = _extract_json_payload(result)
    if isinstance(payload, dict) and isinstance(payload.get("prices"), list):
        estimates = [item for item in payload["prices"] if isinstance(item, dict)]
        logger.info("uber mcp price estimates success | user_id=%s | count=%d", user_id, len(estimates))
        return estimates
    if isinstance(payload, list):
        estimates = [item for item in payload if isinstance(item, dict)]
        logger.info("uber mcp price estimates success | user_id=%s | count=%d", user_id, len(estimates))
        return estimates
    raise McpClientError("Uber MCP price estimate tool returned an unexpected payload")


def _estimate_sort_key(estimate: dict[str, Any]) -> tuple[bool, float]:
    low = estimate.get("low_estimate")
    if isinstance(low, (int, float)):
        return (False, float(low))
    return (True, float("inf"))


def _estimate_duration_minutes(estimate: dict[str, Any]) -> Optional[int]:
    duration_seconds = estimate.get("duration")
    if isinstance(duration_seconds, (int, float)) and duration_seconds >= 0:
        minutes = int(round(float(duration_seconds) / 60.0))
        return max(1, minutes)
    return None


def maybe_get_ride_quote(
    *,
    user_id: str,
    pickup_latitude: Optional[float],
    pickup_longitude: Optional[float],
    dropoff_latitude: Optional[float],
    dropoff_longitude: Optional[float],
    access_token: Optional[str] = None,
) -> dict[str, Any]:
    """Returns a lightweight MCP-derived quote/auth payload for the Uber agent.

    The agent can always continue with deep-link handoff, so MCP failures are returned
    as structured data instead of raising into the graph.
    """
    logger.info(
        "uber mcp quote attempt | user_id=%s | pickup_coords_present=%s | dropoff_coords_present=%s | token_present=%s",
        user_id,
        pickup_latitude is not None and pickup_longitude is not None,
        dropoff_latitude is not None and dropoff_longitude is not None,
        bool(access_token),
    )
    if not uber_mcp_is_configured():
        logger.info("uber mcp quote skipped | user_id=%s | reason=not_configured", user_id)
        return {"mcp_available": False}

    if not access_token:
        try:
            auth_url = get_uber_auth_url(user_id=user_id)
            logger.info("uber mcp quote returning connect url | user_id=%s", user_id)
            return {
                "mcp_available": True,
                "connect_uber_url": auth_url,
                "quote_status": "Connect Uber to unlock live ride estimates.",
            }
        except McpClientError as exc:
            logger.warning("uber mcp auth URL lookup failed | user_id=%s | error=%s", user_id, exc)
            return {
                "mcp_available": True,
                "quote_status": "Uber live estimates are unavailable right now.",
                "mcp_error": str(exc),
            }

    if None in (pickup_latitude, pickup_longitude, dropoff_latitude, dropoff_longitude):
        logger.info("uber mcp quote skipped | user_id=%s | reason=missing_coordinates", user_id)
        return {
            "mcp_available": True,
            "quote_status": "Share pickup and destination coordinates to fetch a live Uber estimate.",
        }

    try:
        estimates = get_uber_price_estimates(
            user_id=user_id,
            access_token=access_token,
            start_latitude=float(pickup_latitude),
            start_longitude=float(pickup_longitude),
            end_latitude=float(dropoff_latitude),
            end_longitude=float(dropoff_longitude),
        )
    except McpClientError as exc:
        logger.warning("uber mcp price estimate lookup failed | user_id=%s | error=%s", user_id, exc)
        return {
            "mcp_available": True,
            "quote_status": "Uber live estimates are unavailable right now.",
            "mcp_error": str(exc),
        }

    if not estimates:
        logger.info("uber mcp quote empty | user_id=%s", user_id)
        return {
            "mcp_available": True,
            "quote_status": "No live Uber estimates were returned for this route.",
        }

    best = sorted(estimates, key=_estimate_sort_key)[0]
    logger.info(
        "uber mcp quote success | user_id=%s | estimate_count=%d | selected_product=%s | selected_estimate=%s",
        user_id,
        len(estimates),
        best.get("localized_display_name") or best.get("display_name") or "Uber",
        best.get("estimate") or "See Uber for pricing",
    )
    return {
        "mcp_available": True,
        "live_quote": {
            "product_name": best.get("localized_display_name") or best.get("display_name") or "Uber",
            "estimate": best.get("estimate") or "See Uber for pricing",
            "currency_code": best.get("currency_code"),
            "eta_minutes": _estimate_duration_minutes(best),
        },
        "quote_status": f"Live Uber quote via MCP from {len(estimates)} product option(s).",
    }
