"""Stripe payment processing for travel insurance."""
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
import stripe

from app.config import get_settings
from app.deps import get_current_customer
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

            # Attach the payment method to this customer
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
