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
    uber_server_token: str = ""

    uber_mcp_command: str = "npx"
    uber_mcp_args: str = "mcp-uber"
    uber_mcp_environment: str = "sandbox"
    uber_mcp_protocol_version: str = "2024-11-05"
    uber_mcp_timeout_seconds: float = 20.0
    uber_mcp_access_token: str = ""


@lru_cache
def get_settings() -> Settings:
    return Settings()
