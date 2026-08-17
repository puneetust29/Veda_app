from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routers import auth, calendar, roaming, subscriptions

settings = get_settings()

app = FastAPI(title="AI Companion App API", version="0.1.0")

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


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}
