"""Stripe payment processing for travel insurance."""
from datetime import datetime, timezone
from uuid import uuid4
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
import stripe

from app.config import get_settings
from app.db.client import get_supabase
from app.deps import get_current_customer, update_customer_stripe_id
from app.integrations.strapi import StrapiClient

router = APIRouter(prefix="/payments", tags=["payments"])


class TravelInsuranceIntentRequest(BaseModel):
    plan_id: int
    payment_method_id: str


class TravelInsuranceIntentResponse(BaseModel):
    client_secret: str
    ephemeral_key_secret: str
    customer_id: str
    publishable_key: str


class InsurancePurchaseRequest(BaseModel):
    plan_id: int
    payment_intent_id: str
    calendar_event_id: str | None = None


class InsurancePurchaseResponse(BaseModel):
    id: str
    status: str
    plan_id: int
    purchased_at: str
    plan_details: dict


class InsurancePurchaseDetail(BaseModel):
    id: str
    calendar_event_id: str
    status: str
    purchased_at: str
    plan_details: dict


class ActiveInsuranceResponse(BaseModel):
    purchases: list[InsurancePurchaseDetail]


@router.post("/insurance/intent", response_model=TravelInsuranceIntentResponse)
def create_travel_insurance_intent(
    body: TravelInsuranceIntentRequest,
    customer: dict = Depends(get_current_customer),
):
    """Create a Stripe PaymentIntent for travel insurance.

    Fetches the plan from Strapi to get the authoritative charge amount,
    then creates a Stripe PaymentIntent for the saved payment method.
    Returns the client secret, ephemeral key, and customer ID needed for PaymentSheet.
    """
    settings = get_settings()

    if not settings.stripe_configured:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Stripe is not configured",
        )

    # Fetch plan to get authoritative charge amount
    strapi = StrapiClient()
    try:
        plan = strapi.get_travel_insurance_plan(body.plan_id)
        if not plan:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Plan not found"
            )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch plan: {str(e)}",
        )

    stripe.api_key = settings.stripe_secret_key

    try:
        # Check if customer already has a Stripe customer ID
        if customer.get("stripe_customer_id"):
            customer_id = customer["stripe_customer_id"]
        else:
            # Retrieve the payment method to check if it already has a customer
            pm = stripe.PaymentMethod.retrieve(body.payment_method_id)

            if pm.customer:
                customer_id = pm.customer
            else:
                # Create a new Stripe customer
                phone = customer.get("phone_number", "unknown")
                stripe_customer = stripe.Customer.create(
                    description=f"Veda customer: {phone}",
                    metadata={"veda_customer_id": customer["id"]},
                )
                customer_id = stripe_customer.id

            # Store the Stripe customer ID in the database for future use
            update_customer_stripe_id(customer["id"], customer_id)

            # Attach the payment method to this customer if needed
            if not pm.customer:
                stripe.PaymentMethod.attach(body.payment_method_id, customer=customer_id)

        # Create ephemeral key for mobile SDK
        ephemeral_key = stripe.EphemeralKey.create(
            customer=customer_id, stripe_version="2024-06-20"
        )

        # Create PaymentIntent with the plan's authoritative amount
        payment_intent = stripe.PaymentIntent.create(
            amount=plan.stripeAmountCents,
            currency=plan.currencyCode,
            customer=customer_id,
            payment_method=body.payment_method_id,
            automatic_payment_methods={"enabled": True},
            description=f"{plan.planName} - {plan.provider}",
        )

        return TravelInsuranceIntentResponse(
            client_secret=payment_intent.client_secret,
            ephemeral_key_secret=ephemeral_key.secret,
            customer_id=customer_id,
            publishable_key=settings.stripe_publishable_key,
        )

    except stripe.error.CardError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Card error: {e.user_message}",
        )
    except stripe.error.RateLimitError:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many requests to Stripe",
        )
    except stripe.error.InvalidRequestError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid Stripe request: {str(e)}",
        )
    except stripe.error.AuthenticationError:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Stripe authentication failed",
        )
    except stripe.error.APIConnectionError:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to connect to Stripe",
        )
    except stripe.error.StripeError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Stripe error: {str(e)}",
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Payment intent creation failed: {str(e)}",
        )


@router.post("/insurance/confirm", response_model=InsurancePurchaseResponse)
def confirm_insurance_purchase(
    body: InsurancePurchaseRequest,
    customer: dict = Depends(get_current_customer),
):
    """Confirm a travel insurance purchase after successful payment.

    This endpoint is called after Stripe payment succeeds to record the
    insurance purchase in our database and mark it as active.
    """
    settings = get_settings()

    if not settings.stripe_configured:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Stripe is not configured",
        )

    # Verify payment intent status
    stripe.api_key = settings.stripe_secret_key
    try:
        intent = stripe.PaymentIntent.retrieve(body.payment_intent_id)
        if intent.status != "succeeded":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Payment intent status is {intent.status}, not succeeded",
            )
    except stripe.error.StripeError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to verify payment: {str(e)}",
        )

    # Fetch plan details
    strapi = StrapiClient()
    try:
        plan = strapi.get_travel_insurance_plan(body.plan_id)
        if not plan:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Plan not found"
            )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch plan: {str(e)}",
        )

    # Store insurance purchase
    supabase = get_supabase()
    insurance_id = str(uuid4())

    try:
        purchase_data = {
            "id": insurance_id,
            "customer_id": customer["id"],
            "plan_id": body.plan_id,
            "payment_intent_id": body.payment_intent_id,
            "status": "active",
            "purchased_at": datetime.now(timezone.utc).isoformat(),
            "plan_details": {
                "planName": plan.planName,
                "provider": plan.provider,
                "coverageStart": plan.coverageStart,
                "coverageEnd": plan.coverageEnd,
                "premiumAmount": plan.premiumAmount,
                "currency": plan.currency,
                "benefitsSummary": plan.benefitsSummary,
            },
        }

        # Only include calendar_event_id if provided
        if body.calendar_event_id:
            purchase_data["calendar_event_id"] = body.calendar_event_id

        result = supabase.table("insurance_purchases").insert(purchase_data).execute()

        return InsurancePurchaseResponse(
            id=insurance_id,
            status="active",
            plan_id=body.plan_id,
            purchased_at=datetime.now(timezone.utc).isoformat(),
            plan_details={
                "planName": plan.planName,
                "provider": plan.provider,
                "coverageStart": plan.coverageStart,
                "coverageEnd": plan.coverageEnd,
                "premiumAmount": plan.premiumAmount,
                "currency": plan.currency,
                "benefitsSummary": plan.benefitsSummary,
            },
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to save insurance purchase: {str(e)}",
        )


@router.get("/insurance/active", response_model=ActiveInsuranceResponse)
def get_active_insurance(
    customer: dict = Depends(get_current_customer),
):
    """Get customer's active travel insurance purchases with full details.

    Returns a list of active insurance purchases including plan details.
    """
    supabase = get_supabase()

    try:
        result = supabase.table("insurance_purchases").select(
            "id, calendar_event_id, status, purchased_at, plan_details"
        ).eq(
            "customer_id", customer["id"]
        ).eq("status", "active").execute()

        purchases = [
            InsurancePurchaseDetail(
                id=row["id"],
                calendar_event_id=row["calendar_event_id"],
                status=row["status"],
                purchased_at=row["purchased_at"],
                plan_details=row["plan_details"],
            )
            for row in result.data
            if row["calendar_event_id"]
        ]

        return ActiveInsuranceResponse(purchases=purchases)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch active insurance: {str(e)}",
        )
