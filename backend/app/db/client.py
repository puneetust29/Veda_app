from functools import lru_cache

# Disable SSL verification for httpx/httpcore (required for HTTPS in development)
import httpcore._backends.sync as _sync_backend
import ssl as _ssl

_original_start_tls = _sync_backend.SyncStream.start_tls

def _patched_start_tls(self, ssl_context=None, server_hostname=None, timeout=None):
    # Override the SSL context to skip verification
    ssl_context = _ssl.create_default_context()
    ssl_context.check_hostname = False
    ssl_context.verify_mode = _ssl.CERT_NONE
    return _original_start_tls(self, ssl_context=ssl_context, server_hostname=server_hostname, timeout=timeout)

_sync_backend.SyncStream.start_tls = _patched_start_tls

from supabase import Client, create_client
from app.config import get_settings


@lru_cache
def get_supabase() -> Client:
    settings = get_settings()
    return create_client(settings.supabase_url, settings.supabase_service_role_key)
