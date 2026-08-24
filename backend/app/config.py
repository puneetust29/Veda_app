from functools import lru_cache
from typing import Optional

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    supabase_url: str
    supabase_service_role_key: str
    supabase_jwt_secret: str

    llm_provider: str = "openai"

    openai_api_key: Optional[str] = None
    openai_model: str = "gpt-4"

    anthropic_api_key: Optional[str] = None
    anthropic_model: str = "claude-sonnet-5"

    environment: str = "development"
    cors_origins: str = "*"
    app_log_level: str = "INFO"

    max_commit_amount_eur: float = 200.0
    stream_heartbeat_seconds: int = 15

    uber_client_id: str = ""
    uber_client_secret: str = ""
    uber_redirect_uri: str = "http://localhost:3000/callback"

    uber_mcp_url: str = "http://localhost:3001"
    uber_mcp_jwt_secret: str = ""
    uber_mcp_user_sub: str = ""
    uber_mcp_client_id: str = ""

    # Base URL this backend is reachable at — used as the OAuth redirect_uri for uber-mcp.
    # Set to the machine's LAN IP (e.g. http://192.168.1.x:8000) when testing from a phone.
    backend_url: str = "http://localhost:8000"


@lru_cache
def get_settings() -> Settings:
    return Settings()
