"""Single construction point for every chat model in the backend.

    LLM_USE_GATEWAY=true   -> GatewayChatOpenAI on LLM_GATEWAY_URL with LLM_GATEWAY_MODEL
                              (local development; the `model` override is ignored on
                              purpose — one gateway model for everything).
    otherwise              -> ChatAnthropic(model or ANTHROPIC_MODEL, ANTHROPIC_API_KEY),
                              exactly the pre-gateway behaviour.

Each agent keeps its own module-level `_llm()` that delegates here; tests monkeypatch
that `_llm` symbol, so keep the seam.
"""
from __future__ import annotations

import logging
from typing import Optional

from langchain_core.language_models import BaseChatModel

from app.config import get_settings

log = logging.getLogger("app.llm")

NO_KEY_MESSAGE = (
    "No LLM key configured — set ANTHROPIC_API_KEY in backend/.env, "
    "or LLM_USE_GATEWAY=true with the AZURE_* Key Vault credentials"
)


def get_chat_model(*, model: Optional[str] = None, temperature: Optional[float] = None) -> BaseChatModel:
    settings = get_settings()

    if settings.llm_use_gateway:
        # Lazy: langchain_openai / openai only when the gateway is actually in use.
        from app.llm.gateway_chat import build_gateway_chat_model

        if model:
            log.debug("[llm] gateway mode ignores model override %s (using %s)", model, settings.llm_gateway_model)
        return build_gateway_chat_model(settings, temperature=temperature)

    if settings.anthropic_api_key:
        from langchain_anthropic import ChatAnthropic

        chosen = model or settings.anthropic_model
        log.info("[llm] provider=anthropic model=%s", chosen)
        kwargs = {"temperature": temperature} if temperature is not None else {}
        return ChatAnthropic(model=chosen, api_key=settings.anthropic_api_key, **kwargs)

    raise RuntimeError(NO_KEY_MESSAGE)


def llm_configured() -> bool:
    """True when get_chat_model() can return something (used by routes that degrade gracefully)."""
    settings = get_settings()
    return bool(settings.llm_use_gateway or settings.anthropic_api_key)


def provider_info() -> dict:
    """Non-secret description of the active provider, for /dev endpoints."""
    settings = get_settings()
    if settings.llm_use_gateway:
        return {
            "provider": "gateway",
            "gateway_url": settings.llm_gateway_url,
            "model": settings.llm_gateway_model,
            "verify_ssl": settings.llm_gateway_verify_ssl,
            "structured_method": settings.llm_gateway_structured_method,
            "configured": settings.llm_gateway_configured,
        }
    return {"provider": "anthropic", "model": settings.anthropic_model, "configured": bool(settings.anthropic_api_key)}
