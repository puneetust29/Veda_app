from contextlib import asynccontextmanager
import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.orchestration.orchestrator import get_orchestrator
from app.routers import auth, calendar, conversation, roaming, subscriptions, uber
import app.tools.uber  # noqa: F401 -- registers Uber deep-link tools at startup

settings = get_settings()


def _configure_logging() -> None:
    level_name = (settings.app_log_level or "INFO").upper()
    level = getattr(logging, level_name, logging.INFO)
    root_logger = logging.getLogger()

    if not root_logger.handlers:
        logging.basicConfig(
            level=level,
            format="%(asctime)s %(levelname)s %(name)s | %(message)s",
        )
    else:
        root_logger.setLevel(level)
        for handler in root_logger.handlers:
            handler.setLevel(level)


_configure_logging()
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # Building the orchestrator discovers + validates every agent manifest; a bad
    # manifest (unregistered tool, missing context resolver, etc.) raises here, at
    # boot, instead of failing on the first request that happens to hit it.
    logger.info(
        "app startup | environment=%s | log_level=%s",
        settings.environment,
        settings.app_log_level,
    )
    get_orchestrator()
    logger.info("app startup complete | orchestrator_ready=true")
    try:
        yield
    finally:
        logger.info("app shutdown")


app = FastAPI(title="AI Companion App API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.cors_origins.split(",")],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(auth.me_router)
app.include_router(calendar.router)
app.include_router(roaming.router)
app.include_router(subscriptions.router)
app.include_router(conversation.router)
app.include_router(uber.router)


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}
