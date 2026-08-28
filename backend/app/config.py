from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    supabase_url: str
    supabase_service_role_key: str
    supabase_jwt_secret: str

    anthropic_api_key: str
    anthropic_model: str = "claude-haiku-4-5-20251001"

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

    environment: str = "development"
    cors_origins: str = "*"

    max_commit_amount_eur: float = 200.0
    stream_heartbeat_seconds: int = 15

    # TfL Open Data API (optional — app boots without it)
    tfl_api_key: str = ""

    # Google Maps Platform (optional — maps agent skips if absent)
    google_maps_api_key: str = ""

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
