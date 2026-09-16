"""Local LLM gateway: key cache, refresh-on-401, provider selection, /dev endpoints."""
from __future__ import annotations

import threading
import time
from concurrent.futures import ThreadPoolExecutor

import httpx
import openai
import pytest
from fastapi.testclient import TestClient
from langchain_anthropic import ChatAnthropic
from langchain_core.messages import AIMessage
from langchain_core.outputs import ChatGeneration, ChatResult
from langchain_openai import ChatOpenAI
from pydantic import BaseModel

from app.config import get_settings
from app.deps import get_current_customer
from app.llm import gateway_token
from app.llm.factory import get_chat_model, llm_configured
from app.llm.gateway_chat import GatewayChatOpenAI
from app.main import app


# ---------------------------------------------------------------------------
# fixtures
# ---------------------------------------------------------------------------

@pytest.fixture(autouse=True)
def _isolate_from_local_env(monkeypatch):
    """A developer's backend/.env may have LLM_USE_GATEWAY=true; pin the defaults so these
    tests describe the code, not the machine they run on."""
    monkeypatch.setenv("LLM_USE_GATEWAY", "false")
    monkeypatch.setenv("LLM_GATEWAY_VERIFY_SSL", "true")
    monkeypatch.setenv("LLM_GATEWAY_STRUCTURED_METHOD", "json_schema")
    monkeypatch.setenv("LLM_GATEWAY_MODEL", "claude-sonnet-5-designExp")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-anthropic-key")
    get_settings.cache_clear()
    gateway_token.reset_cache()
    yield
    gateway_token.reset_cache()
    get_settings.cache_clear()


@pytest.fixture
def gateway_env(monkeypatch):
    monkeypatch.setenv("LLM_USE_GATEWAY", "true")
    monkeypatch.setenv("AZURE_VAULT_URL", "https://test.vault.azure.net")
    monkeypatch.setenv("AZURE_TENANT_ID", "tenant")
    monkeypatch.setenv("AZURE_CLIENT_ID", "client")
    monkeypatch.setenv("AZURE_CLIENT_SECRET", "secret")
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


class _FakeFetch:
    """Stand-in for the Key Vault round-trip: returns key-1, key-2, ... and counts calls."""

    def __init__(self, delay: float = 0.0):
        self.calls = 0
        self.delay = delay
        self._lock = threading.Lock()

    def __call__(self, settings=None):
        with self._lock:
            self.calls += 1
            n = self.calls
        if self.delay:
            time.sleep(self.delay)
        return f"key-{n}"


@pytest.fixture
def fake_fetch(monkeypatch):
    fetch = _FakeFetch()
    monkeypatch.setattr(gateway_token, "fetch_gateway_key", fetch)
    return fetch


def _auth_error() -> openai.AuthenticationError:
    request = httpx.Request("POST", "https://llmproxy.test/chat/completions")
    response = httpx.Response(401, request=request)
    return openai.AuthenticationError("bad key", response=response, body=None)


def _ok_result(text: str = "ok") -> ChatResult:
    return ChatResult(generations=[ChatGeneration(message=AIMessage(content=text))])


# ---------------------------------------------------------------------------
# token cache
# ---------------------------------------------------------------------------

def test_mask_key_never_shows_the_middle():
    assert gateway_token.mask_key("abcdefghijklmnop") == "abcd...mnop"
    assert gateway_token.mask_key("short") == "****"
    assert gateway_token.mask_key("") == ""
    assert "efghijkl" not in gateway_token.mask_key("abcdefghijklmnop")


def test_get_gateway_key_fetches_once_and_caches(gateway_env, fake_fetch):
    assert gateway_token.get_gateway_key() == "key-1"
    assert gateway_token.get_gateway_key() == "key-1"
    assert fake_fetch.calls == 1
    info = gateway_token.token_info()
    assert info["cached"] is True
    assert info["fetch_count"] == 1
    assert info["refresh_count"] == 0
    assert info["masked_key"] == "****"  # "key-1" is short -> fully masked


def test_concurrent_first_use_fetches_once(gateway_env, monkeypatch):
    fetch = _FakeFetch(delay=0.05)
    monkeypatch.setattr(gateway_token, "fetch_gateway_key", fetch)
    with ThreadPoolExecutor(max_workers=8) as pool:
        keys = list(pool.map(lambda _: gateway_token.get_gateway_key(), range(8)))
    assert set(keys) == {"key-1"}
    assert fetch.calls == 1


def test_refresh_with_stale_key_coalesces(gateway_env, fake_fetch):
    assert gateway_token.get_gateway_key() == "key-1"
    assert gateway_token.refresh_gateway_key(stale_key="key-1") == "key-2"
    # A second thread that also saw key-1 rejected gets key-2 without another fetch.
    assert gateway_token.refresh_gateway_key(stale_key="key-1") == "key-2"
    assert fake_fetch.calls == 2
    assert gateway_token.token_info()["refresh_count"] == 1
    # An unconditional refresh always fetches.
    assert gateway_token.refresh_gateway_key() == "key-3"
    assert fake_fetch.calls == 3


def test_fetch_requires_azure_config(gateway_env, monkeypatch):
    monkeypatch.setenv("AZURE_CLIENT_SECRET", "")
    get_settings.cache_clear()
    with pytest.raises(RuntimeError, match="AZURE_"):
        gateway_token.fetch_gateway_key()


def test_fetch_rejects_non_vault_url(gateway_env, monkeypatch):
    monkeypatch.setenv("AZURE_VAULT_URL", "http://example.com")
    get_settings.cache_clear()
    with pytest.raises(RuntimeError, match="vault.azure.net"):
        gateway_token.fetch_gateway_key()


# ---------------------------------------------------------------------------
# factory
# ---------------------------------------------------------------------------

def test_factory_flag_off_returns_chat_anthropic():
    model = get_chat_model()
    assert isinstance(model, ChatAnthropic)
    assert model.model == get_settings().anthropic_model
    assert llm_configured() is True


def test_factory_flag_off_honours_model_override():
    model = get_chat_model(model="claude-opus-5")
    assert isinstance(model, ChatAnthropic)
    assert model.model == "claude-opus-5"


def test_factory_flag_off_without_any_key_raises(monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "")
    get_settings.cache_clear()
    assert llm_configured() is False
    with pytest.raises(RuntimeError, match="No LLM key configured"):
        get_chat_model()


def test_factory_flag_on_returns_gateway_model(gateway_env, fake_fetch):
    settings = get_settings()
    model = get_chat_model(model="claude-opus-5")  # override ignored in gateway mode
    assert isinstance(model, GatewayChatOpenAI)
    assert model.model_name == "claude-sonnet-5-designExp"
    assert model.openai_api_base == settings.llm_gateway_url
    assert model.root_client.api_key == "key-1"
    assert model.structured_method == "json_schema"
    assert model.http_client is None  # verify_ssl defaults to True -> stock client
    assert fake_fetch.calls == 1
    # The gateway rejects `temperature`; it must not be sent unless a caller asks for it.
    assert "temperature" not in model._default_params
    assert get_chat_model(temperature=0)._default_params["temperature"] == 0


def test_factory_flag_on_verify_ssl_false_uses_insecure_http_client(gateway_env, fake_fetch, monkeypatch):
    monkeypatch.setenv("LLM_GATEWAY_VERIFY_SSL", "false")
    get_settings.cache_clear()
    model = get_chat_model()
    assert isinstance(model.http_client, httpx.Client)
    assert isinstance(model.http_async_client, httpx.AsyncClient)


# ---------------------------------------------------------------------------
# 401 -> refresh -> retry once
# ---------------------------------------------------------------------------

class _ScriptedGenerate:
    """Replaces ChatOpenAI._generate with a scripted sequence of outcomes.

    Install via `monkeypatch.setattr(ChatOpenAI, "_generate", scripted.method)` — a plain
    function is needed so Python binds `self` (the model) when it is looked up on the class.
    """

    def __init__(self, outcomes):
        self.outcomes = list(outcomes)
        self.calls = 0
        self.keys_seen: list[str] = []

    @property
    def method(self):
        def _generate(model, messages, stop=None, run_manager=None, **kwargs):
            self.calls += 1
            self.keys_seen.append(model.root_client.api_key)
            outcome = self.outcomes.pop(0)
            if isinstance(outcome, BaseException):
                raise outcome
            return outcome

        return _generate


def test_401_refreshes_key_and_retries_once(gateway_env, fake_fetch, monkeypatch):
    scripted = _ScriptedGenerate([_auth_error(), _ok_result("hello")])
    monkeypatch.setattr(ChatOpenAI, "_generate", scripted.method)

    model = get_chat_model()
    reply = model.invoke("hi")

    assert reply.content == "hello"
    assert scripted.calls == 2
    assert scripted.keys_seen == ["key-1", "key-2"]
    assert model.root_client.api_key == "key-2"
    assert model.root_async_client.api_key == "key-2"
    assert model.openai_api_key.get_secret_value() == "key-2"
    assert gateway_token.token_info()["refresh_count"] == 1


def test_second_401_propagates_after_one_refresh(gateway_env, fake_fetch, monkeypatch):
    scripted = _ScriptedGenerate([_auth_error(), _auth_error()])
    monkeypatch.setattr(ChatOpenAI, "_generate", scripted.method)

    model = get_chat_model()
    with pytest.raises(openai.AuthenticationError):
        model.invoke("hi")

    assert scripted.calls == 2
    assert fake_fetch.calls == 2  # initial + one refresh
    assert gateway_token.token_info()["refresh_count"] == 1


def test_non_auth_errors_do_not_refresh(gateway_env, fake_fetch, monkeypatch):
    scripted = _ScriptedGenerate([RuntimeError("boom")])
    monkeypatch.setattr(ChatOpenAI, "_generate", scripted.method)

    model = get_chat_model()
    with pytest.raises(RuntimeError, match="boom"):
        model.invoke("hi")

    assert scripted.calls == 1
    assert fake_fetch.calls == 1
    assert gateway_token.token_info()["refresh_count"] == 0


def test_concurrent_401s_share_a_single_refresh(gateway_env, monkeypatch):
    """Threads that all saw key-1 rejected at the same moment trigger exactly one fetch."""
    fetch = _FakeFetch(delay=0.05)
    monkeypatch.setattr(gateway_token, "fetch_gateway_key", fetch)
    assert gateway_token.get_gateway_key() == "key-1"

    with ThreadPoolExecutor(max_workers=4) as pool:
        keys = list(pool.map(lambda _: gateway_token.refresh_gateway_key(stale_key="key-1"), range(4)))

    assert set(keys) == {"key-2"}
    assert fetch.calls == 2  # initial + one shared refresh


# ---------------------------------------------------------------------------
# structured output method
# ---------------------------------------------------------------------------

class _Schema(BaseModel):
    answer: str


def test_with_structured_output_injects_configured_method(gateway_env, fake_fetch, monkeypatch):
    captured: dict = {}

    def fake_wso(self, schema=None, *, method="function_calling", include_raw=False, strict=None, **kwargs):
        captured["method"] = method
        return "runnable"

    monkeypatch.setattr(ChatOpenAI, "with_structured_output", fake_wso)

    assert get_chat_model().with_structured_output(_Schema) == "runnable"
    assert captured["method"] == "json_schema"

    monkeypatch.setenv("LLM_GATEWAY_STRUCTURED_METHOD", "function_calling")
    get_settings.cache_clear()
    get_chat_model().with_structured_output(_Schema)
    assert captured["method"] == "function_calling"

    get_chat_model().with_structured_output(_Schema, method="json_mode")
    assert captured["method"] == "json_mode"


# ---------------------------------------------------------------------------
# /dev endpoints
# ---------------------------------------------------------------------------

@pytest.fixture
def client():
    app.dependency_overrides[get_current_customer] = lambda: {"id": "cust-1"}
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.pop(get_current_customer, None)


def test_dev_llm_token_is_404_when_gateway_disabled(client):
    assert client.get("/dev/llm-token").status_code == 404
    assert client.post("/dev/llm-token/refresh").status_code == 404


def test_dev_llm_token_reports_metadata_and_refreshes(gateway_env, fake_fetch, client):
    before = client.get("/dev/llm-token")
    assert before.status_code == 200
    body = before.json()
    assert body["enabled"] is True
    assert body["provider"] == "gateway"
    assert body["model"] == "claude-sonnet-5-designExp"
    assert body["cached"] is False
    assert fake_fetch.calls == 0  # GET never fetches

    refreshed = client.post("/dev/llm-token/refresh")
    assert refreshed.status_code == 200
    assert refreshed.json()["ok"] is True
    assert refreshed.json()["refresh_count"] == 1
    assert fake_fetch.calls == 1

    after = client.get("/dev/llm-token").json()
    assert after["cached"] is True
    assert after["masked_key"] == "****"
    assert "key-1" not in str(after)


def test_dev_llm_token_refresh_503_when_azure_unconfigured(gateway_env, client, monkeypatch):
    monkeypatch.setenv("AZURE_CLIENT_SECRET", "")
    get_settings.cache_clear()
    assert client.post("/dev/llm-token/refresh").status_code == 503


def test_dev_llm_token_refresh_502_when_key_vault_fails(gateway_env, client, monkeypatch):
    def boom(settings=None):
        raise RuntimeError("vault down")

    monkeypatch.setattr(gateway_token, "fetch_gateway_key", boom)
    response = client.post("/dev/llm-token/refresh")
    assert response.status_code == 502
    assert "vault down" in response.json()["detail"]
