from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    supabase_url: str
    supabase_service_role_key: str
    supabase_jwt_secret: str

    anthropic_api_key: str = ""
    anthropic_model: str = "claude-haiku-4-5-20251001"

    openai_api_key: str = ""
    openai_model: str = "gpt-4o-mini"
    # "anthropic" | "openai" — agents that support both check this to pick the provider
    llm_provider: str = "anthropic"

    # Local-only OpenAI-compatible LLM gateway. Off by default. When true, EVERY LLM call
    # goes through the gateway with the single model below and the Anthropic settings are
    # ignored. The gateway key is pulled from Azure Key Vault (AZURE_* below) and cached
    # in-process; it is re-fetched only when the gateway answers 401 or on an explicit
    # POST /dev/llm-token/refresh. See app/llm/.
    llm_use_gateway: bool = False
    llm_gateway_url: str = "https://llmproxy.ustdev.com/"
    llm_gateway_model: str = "claude-sonnet-5-designExp"
    # False -> httpx verify=False for the gateway + connection_verify=False for Key Vault.
    # Never patches the global ssl context.
    llm_gateway_verify_ssl: bool = True
    # "json_schema" | "json_mode" | "function_calling" — how with_structured_output talks
    # to the gateway. The UST proxy drops the `tools` array for Claude, so tool-based
    # ("function_calling") structured output fails there; json_schema was verified to work.
    llm_gateway_structured_method: str = "json_schema"
    llm_gateway_secret_name: str = "designExperienceDelivery-kvs"
    # Empty string -> latest secret version.
    llm_gateway_secret_version: str = "8f93e8fddb3440ac849787ba9ea05a28"

    # Azure Key Vault service principal that can read the gateway key. No defaults.
    azure_vault_url: str = ""
    azure_tenant_id: str = ""
    azure_client_id: str = ""
    azure_client_secret: str = ""

    # Google OAuth (unified for Calendar + Gmail). Optional: the app boots without these,
    # and Google routes answer 503 until configured. Deliberate, so a deployment that
    # hasn't done the Cloud Console setup isn't a hard boot failure.
    google_client_id: str = ""
    google_client_secret: str = ""
    google_redirect_uri: str = "http://localhost:8000/auth/google/callback"
    google_calendar_scopes: str = "https://www.googleapis.com/auth/calendar.events"
    google_gmail_scopes: str = (
        "https://www.googleapis.com/auth/gmail.readonly "
        "https://www.googleapis.com/auth/gmail.send"
    )
    # Deep link the callback page bounces back to after auth. Must match the `scheme` in mobile/app.json.
    google_post_auth_redirect: str = "veda://google-auth-complete"

    # Strapi CMS (optional for travel insurance content). Optional: the app boots without these,
    # and insurance routes answer 503 until configured.
    strapi_url: str = ""
    strapi_api_token: str = ""

    # Stripe (optional for travel insurance payments). Optional: the app boots without these,
    # and payment routes answer 503 until configured.
    stripe_secret_key: str = ""
    stripe_publishable_key: str = ""

    # TfL (Transport for London) API key. Optional: transport agent skips TfL calls if empty.
    tfl_api_key: str = ""

    environment: str = "development"
    cors_origins: str = "*"

    uber_client_id: str = ""

    max_commit_amount_eur: float = 200.0
    stream_heartbeat_seconds: int = 15

    # TfL Open Data API (optional — app boots without it)
    tfl_api_key: str = ""

    # Google Maps Platform (optional — maps agent skips if absent)
    google_maps_api_key: str = ""

    # Deliveroo (optional — deliveroo routes skips if absent)
    deliveroo_client_id: str = ""
    deliveroo_client_secret: str = ""
    deliveroo_env: str = "sandbox"  # "sandbox" | "production"
    deliveroo_webhook_secret: str = ""

    @property
    def llm_gateway_configured(self) -> bool:
        return bool(
            self.azure_vault_url and self.azure_tenant_id and self.azure_client_id and self.azure_client_secret
        )

    @property
    def deliveroo_configured(self) -> bool:
        return bool(self.deliveroo_client_id and self.deliveroo_client_secret)

    @property
    def deliveroo_api_base_url(self) -> str:
        if self.deliveroo_env == "production":
            return "https://api.developers.deliveroo.com"
        return "https://api-sandbox.developers.deliveroo.com"

    @property
    def google_calendar_configured(self) -> bool:
        return bool(self.google_client_id and self.google_client_secret)

    @property
    def google_gmail_configured(self) -> bool:
        return bool(self.google_client_id and self.google_client_secret)

    @property
    def strapi_configured(self) -> bool:
        return bool(self.strapi_url and self.strapi_api_token)

    @property
    def stripe_configured(self) -> bool:
        return bool(self.stripe_secret_key and self.stripe_publishable_key)

    @property
    def google_scope_list(self) -> list[str]:
        return [s for s in self.google_calendar_scopes.split() if s]

    @property
    def google_gmail_scope_list(self) -> list[str]:
        return [s for s in self.google_gmail_scopes.split() if s]


@lru_cache
def get_settings() -> Settings:
    return Settings()
