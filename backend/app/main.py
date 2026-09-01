import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")

from app.config import get_settings
from app.orchestration.orchestrator import get_orchestrator

# Attach a dedicated StreamHandler to the "app" logger so INFO lines always
# reach the console. uvicorn's root handler runs at WARNING level, so setting
# the logger level alone isn't enough — the handler must also accept INFO.
_app_log = logging.getLogger("app")
_app_log.setLevel(logging.INFO)
if not _app_log.handlers:
    _h = logging.StreamHandler()
    _h.setLevel(logging.DEBUG)
    _h.setFormatter(logging.Formatter("%(levelname)s %(name)s: %(message)s"))
    _app_log.addHandler(_h)
    _app_log.propagate = False  # avoid double-printing via uvicorn's root handler
from app.routers import auth, calendar, conversation, dev, deliveroo_webhooks, gmail, google_auth, roaming, subscriptions, insurance, payments

settings = get_settings()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # Building the orchestrator discovers + validates every agent manifest; a bad
    # manifest (unregistered tool, missing context resolver, etc.) raises here, at
    # boot, instead of failing on the first request that happens to hit it.
    get_orchestrator()
    yield


app = FastAPI(title="AI Companion App API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(auth.me_router)
app.include_router(google_auth.router)
app.include_router(calendar.router)
app.include_router(gmail.router)
app.include_router(roaming.router)
app.include_router(subscriptions.router)
app.include_router(conversation.router)
app.include_router(insurance.router)
app.include_router(payments.router)
app.include_router(dev.router)
app.include_router(deliveroo_webhooks.router)


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}
