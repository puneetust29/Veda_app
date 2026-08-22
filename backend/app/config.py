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
    google_gmail_scopes: str = "https://www.googleapis.com/auth/gmail.readonly"
    # Deep link the callback page bounces back to after auth. Must match the `scheme` in mobile/app.json.
    google_post_auth_redirect: str = "veda://google-auth-complete"

    environment: str = "development"
    cors_origins: str = "*"

    max_commit_amount_eur: float = 200.0
    stream_heartbeat_seconds: int = 15

    @property
    def google_calendar_configured(self) -> bool:
        return bool(self.google_client_id and self.google_client_secret)

    @property
    def google_gmail_configured(self) -> bool:
        return bool(self.google_client_id and self.google_client_secret)

    @property
    def google_scope_list(self) -> list[str]:
        return [s for s in self.google_calendar_scopes.split() if s]

    @property
    def google_gmail_scope_list(self) -> list[str]:
        return [s for s in self.google_gmail_scopes.split() if s]


@lru_cache
def get_settings() -> Settings:
    return Settings()
