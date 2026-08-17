from fastapi import APIRouter, Depends

from app.deps import get_current_customer

router = APIRouter(prefix="/auth", tags=["auth"])
me_router = APIRouter(tags=["auth"])


@router.post("/sync-profile")
def sync_profile(customer: dict = Depends(get_current_customer)) -> dict:
    """Call right after Supabase login to hydrate/create the linked telecom profile."""
    return customer


@me_router.get("/me")
def read_profile(customer: dict = Depends(get_current_customer)) -> dict:
    return customer
