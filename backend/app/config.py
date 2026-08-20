from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    supabase_url: str
    supabase_service_role_key: str
    supabase_jwt_secret: str

    anthropic_api_key: str
    anthropic_model: str = "claude-haiku-4-5-20251001"

    environment: str = "development"
    cors_origins: str = "*"

    max_commit_amount_eur: float = 200.0
    stream_heartbeat_seconds: int = 15


@lru_cache
def get_settings() -> Settings:
    return Settings()
