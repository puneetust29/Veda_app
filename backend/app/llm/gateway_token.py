"""Gateway API key from Azure Key Vault (port of the standalone tokenGeneration.py).

The key is cached in-process indefinitely and re-fetched ONLY on an explicit refresh:
the gateway answering 401 (see gateway_chat.GatewayChatOpenAI), POST /dev/llm-token/refresh,
or `python -m app.llm.gateway_token --refresh`. There is no timer.

Thread-safe: LLM calls run under asyncio.to_thread (agents/base/runner.py), so several
threads may hit an expired key at the same moment. The lock plus `stale_key` coalesce
those into a single Key Vault round-trip. Same shape as integrations/deliveroo_auth.py.

The raw key is never logged or printed; use mask_key() for anything user-visible.
"""
from __future__ import annotations

import argparse
import logging
import threading
import time
from typing import Optional

from app.config import Settings, get_settings

log = logging.getLogger("app.llm.gateway_token")

_lock = threading.RLock()
_cache: dict[str, object] = {}  # key, fetched_at, fetch_count, refresh_count


def mask_key(key: Optional[str]) -> str:
    """'abcd...wxyz' for anything longer than 8 chars, '****' otherwise (as the original script)."""
    if not key:
        return ""
    return f"{key[:4]}...{key[-4:]}" if len(key) > 8 else "****"


def fetch_gateway_key(settings: Optional[Settings] = None) -> str:
    """Read the gateway key from Azure Key Vault. No caching — this is the test seam.

    Azure imports are lazy so deployed environments (which never set LLM_USE_GATEWAY)
    do not need the azure-* packages installed.
    """
    settings = settings or get_settings()
    if not settings.llm_gateway_configured:
        raise RuntimeError(
            "LLM gateway is enabled but Azure Key Vault is not configured — set AZURE_VAULT_URL, "
            "AZURE_TENANT_ID, AZURE_CLIENT_ID and AZURE_CLIENT_SECRET in backend/.env"
        )
    vault_url = settings.azure_vault_url
    if not vault_url.startswith("https://") or ".vault.azure.net" not in vault_url:
        raise RuntimeError(
            "AZURE_VAULT_URL must be an Azure Key Vault URL such as https://my-vault.vault.azure.net"
        )

    try:
        from azure.identity import ClientSecretCredential
        from azure.keyvault.secrets import SecretClient
    except ImportError as e:  # pragma: no cover - depends on the environment
        raise RuntimeError(
            "azure-identity / azure-keyvault-secrets are not installed — run "
            "`pip install -r requirements-local.txt` in backend/"
        ) from e

    verify = settings.llm_gateway_verify_ssl
    credential = ClientSecretCredential(
        tenant_id=settings.azure_tenant_id,
        client_id=settings.azure_client_id,
        client_secret=settings.azure_client_secret,
        connection_verify=verify,
    )
    client = SecretClient(vault_url=vault_url, credential=credential, connection_verify=verify)
    secret = client.get_secret(settings.llm_gateway_secret_name, settings.llm_gateway_secret_version or None)
    value = secret.value
    if not value:
        raise RuntimeError(f"Key Vault secret {settings.llm_gateway_secret_name!r} is empty")
    log.info("[llm] fetched gateway key %s (len=%d)", mask_key(value), len(value))
    return value


def _store(key: str, *, is_refresh: bool) -> None:
    _cache["key"] = key
    _cache["fetched_at"] = time.time()
    _cache["fetch_count"] = int(_cache.get("fetch_count", 0)) + 1
    if is_refresh:
        _cache["refresh_count"] = int(_cache.get("refresh_count", 0)) + 1


def get_gateway_key() -> str:
    """Return the cached key, fetching it once if the cache is empty."""
    key = _cache.get("key")
    if key:
        return str(key)
    with _lock:
        key = _cache.get("key")
        if key:
            return str(key)
        _store(fetch_gateway_key(), is_refresh=False)
        return str(_cache["key"])


def refresh_gateway_key(*, stale_key: Optional[str] = None) -> str:
    """Force a re-fetch.

    `stale_key` is the key the caller just saw rejected. If the cache already holds a
    different key, another thread refreshed first and we return that without another
    Key Vault round-trip.
    """
    with _lock:
        current = _cache.get("key")
        if stale_key is not None and current and current != stale_key:
            return str(current)
        _store(fetch_gateway_key(), is_refresh=True)
        return str(_cache["key"])


def token_info() -> dict:
    """Non-secret metadata about the cached key."""
    now = time.time()
    fetched_at = float(_cache.get("fetched_at", 0) or 0)
    key = _cache.get("key")
    return {
        "cached": bool(key),
        "fetched_ago_seconds": int(now - fetched_at) if fetched_at else None,
        "masked_key": mask_key(str(key)) if key else None,
        "fetch_count": int(_cache.get("fetch_count", 0)),
        "refresh_count": int(_cache.get("refresh_count", 0)),
    }


def reset_cache() -> None:
    """Test helper."""
    with _lock:
        _cache.clear()


def main(argv: Optional[list[str]] = None) -> int:
    """CLI replacement for the standalone tokenGeneration.py script.

    Prints masked key metadata and, with --ping, sends one message through the gateway.
    """
    parser = argparse.ArgumentParser(description="Fetch / inspect the LLM gateway key.")
    parser.add_argument("--refresh", action="store_true", help="force a re-fetch from Key Vault")
    parser.add_argument("--ping", action="store_true", help="send a one-line chat through the gateway")
    args = parser.parse_args(argv)

    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    logging.getLogger("azure").setLevel(logging.WARNING)  # the SDK dumps every header at INFO
    settings = get_settings()

    try:
        key = refresh_gateway_key() if args.refresh else get_gateway_key()
    except Exception as e:
        print(f"Error fetching gateway key: {e}")
        return 1

    info = token_info()
    print(f"Gateway URL:    {settings.llm_gateway_url}")
    print(f"Gateway model:  {settings.llm_gateway_model}")
    print(f"Key:            {mask_key(key)} (len={len(key)})")
    print(f"Fetch count:    {info['fetch_count']}  refresh count: {info['refresh_count']}")

    if args.ping:
        from app.llm.gateway_chat import build_gateway_chat_model

        try:
            reply = build_gateway_chat_model(settings).invoke("tell me a joke")
            print(f"Success: {reply.content}")
        except Exception as e:
            print(f"Error calling gateway: {e}")
            return 1
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
