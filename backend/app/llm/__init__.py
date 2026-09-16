"""LLM provider selection.

`app.llm.factory.get_chat_model()` is the single construction point for every chat
model in the backend. With `LLM_USE_GATEWAY=false` (the default, and every deployed
environment) it returns `ChatAnthropic` exactly as before. With `LLM_USE_GATEWAY=true`
(local development) it returns a `ChatOpenAI` subclass pointed at the OpenAI-compatible
UST LLM gateway, using a key pulled from Azure Key Vault and refreshed on 401.

Nothing heavy is imported here on purpose; import from the submodules.
"""
