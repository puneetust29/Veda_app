"""ChatOpenAI pointed at the OpenAI-compatible UST LLM gateway, with key refresh on 401.

Why a subclass: callers do `_llm().with_structured_output(Schema).invoke(prompt)` (or a
plain `.invoke`). `with_structured_output` composes `bind_tools(...) | parser`, and the
bound model still routes through this instance's `_generate`, so catching the 401 here
covers every call shape with zero caller changes.

Only `openai.AuthenticationError` (HTTP 401) triggers a refresh; the OpenAI SDK does not
retry 401s itself, so `max_retries` on the SDK does not interfere. One refresh, one
retry; a second 401 propagates.
"""
from __future__ import annotations

import logging
from typing import Any, AsyncIterator, Iterator, List, Literal, Optional

import httpx
import openai
from langchain_core.callbacks import AsyncCallbackManagerForLLMRun, CallbackManagerForLLMRun
from langchain_core.messages import BaseMessage
from langchain_core.outputs import ChatGenerationChunk, ChatResult
from langchain_openai import ChatOpenAI
from pydantic import SecretStr

from app.config import Settings
from app.llm import gateway_token

log = logging.getLogger("app.llm")

StructuredMethod = Literal["function_calling", "json_mode", "json_schema"]


class GatewayChatOpenAI(ChatOpenAI):
    """ChatOpenAI that swaps in a fresh gateway key and retries once when it gets a 401."""

    structured_method: StructuredMethod = "json_schema"
    # Stock ChatOpenAI always sends temperature (default 0.7). The gateway's Claude
    # deployments reject it ("`temperature` is deprecated for this model"), so we only
    # send it when a caller asks for one explicitly.
    temperature: Optional[float] = None  # type: ignore[assignment]

    @property
    def _default_params(self) -> dict[str, Any]:
        params = dict(super()._default_params)
        if self.temperature is None:
            params.pop("temperature", None)
        return params

    # -- key rotation -------------------------------------------------------------

    def _current_key(self) -> str:
        return str(self.root_client.api_key)

    def _apply_key(self, key: str) -> None:
        # openai.OpenAI reads `.api_key` when building the Authorization header on every
        # request, so updating the root clients is enough; `self.client` is just the
        # `chat.completions` resource holding a reference to the root client.
        self.openai_api_key = SecretStr(key)
        self.root_client.api_key = key
        self.root_async_client.api_key = key

    def _refresh_after_401(self) -> None:
        stale = self._current_key()
        new = gateway_token.refresh_gateway_key(stale_key=stale)
        self._apply_key(new)
        log.warning(
            "[llm] gateway returned 401 with key %s; refreshed to %s and retrying",
            gateway_token.mask_key(stale),
            gateway_token.mask_key(new),
        )

    # -- generation with one retry -------------------------------------------------

    def _generate(
        self,
        messages: List[BaseMessage],
        stop: Optional[List[str]] = None,
        run_manager: Optional[CallbackManagerForLLMRun] = None,
        **kwargs: Any,
    ) -> ChatResult:
        try:
            return super()._generate(messages, stop=stop, run_manager=run_manager, **kwargs)
        except openai.AuthenticationError:
            self._refresh_after_401()
            return super()._generate(messages, stop=stop, run_manager=run_manager, **kwargs)

    async def _agenerate(
        self,
        messages: List[BaseMessage],
        stop: Optional[List[str]] = None,
        run_manager: Optional[AsyncCallbackManagerForLLMRun] = None,
        **kwargs: Any,
    ) -> ChatResult:
        try:
            return await super()._agenerate(messages, stop=stop, run_manager=run_manager, **kwargs)
        except openai.AuthenticationError:
            self._refresh_after_401()
            return await super()._agenerate(messages, stop=stop, run_manager=run_manager, **kwargs)

    def _stream(self, *args: Any, **kwargs: Any) -> Iterator[ChatGenerationChunk]:
        # A 401 surfaces when the generator is first advanced; retry only if nothing
        # has been yielded yet, so a consumer never sees a duplicated prefix.
        gen = super()._stream(*args, **kwargs)
        try:
            first = next(gen)
        except StopIteration:
            return
        except openai.AuthenticationError:
            self._refresh_after_401()
            gen = super()._stream(*args, **kwargs)
            try:
                first = next(gen)
            except StopIteration:
                return
        yield first
        yield from gen

    async def _astream(self, *args: Any, **kwargs: Any) -> AsyncIterator[ChatGenerationChunk]:
        gen = super()._astream(*args, **kwargs)
        try:
            first = await gen.__anext__()
        except StopAsyncIteration:
            return
        except openai.AuthenticationError:
            self._refresh_after_401()
            gen = super()._astream(*args, **kwargs)
            try:
                first = await gen.__anext__()
            except StopAsyncIteration:
                return
        yield first
        async for chunk in gen:
            yield chunk

    # -- structured output default -------------------------------------------------

    def with_structured_output(  # type: ignore[override]
        self,
        schema: Any = None,
        *,
        method: Optional[StructuredMethod] = None,
        **kwargs: Any,
    ):
        # Callers never pass `method`; the gateway may or may not support tool calls,
        # so the default comes from LLM_GATEWAY_STRUCTURED_METHOD. An explicit value wins.
        return super().with_structured_output(schema, method=method or self.structured_method, **kwargs)


def build_gateway_chat_model(settings: Settings, *, temperature: Optional[float] = None) -> GatewayChatOpenAI:
    """Build a gateway-backed chat model. First call per process fetches the key from Key Vault."""
    key = gateway_token.get_gateway_key()

    extra: dict[str, Any] = {}
    if not settings.llm_gateway_verify_ssl:
        extra["http_client"] = httpx.Client(verify=False)
        extra["http_async_client"] = httpx.AsyncClient(verify=False)
    if temperature is not None:
        extra["temperature"] = temperature

    log.info(
        "[llm] provider=gateway base_url=%s model=%s structured_method=%s verify_ssl=%s key=%s",
        settings.llm_gateway_url,
        settings.llm_gateway_model,
        settings.llm_gateway_structured_method,
        settings.llm_gateway_verify_ssl,
        gateway_token.mask_key(key),
    )
    return GatewayChatOpenAI(
        model=settings.llm_gateway_model,
        api_key=key,
        base_url=settings.llm_gateway_url,
        structured_method=settings.llm_gateway_structured_method,  # type: ignore[arg-type]
        max_retries=2,
        **extra,
    )
