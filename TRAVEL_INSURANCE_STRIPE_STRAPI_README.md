# Travel Insurance: Local JSON + One-Click Stripe Payment

## Overview

This document describes the architecture and implementation of the travel insurance feature, which combines:

1. **Local JSON file** — source of truth for insurance plan content (provider, coverage, pricing)
2. **FastAPI backend** — serves insurance content, handles Stripe payment intents, authenticates customers
3. **React Native mobile app (Expo)** — displays dynamic plan data, collects saved payment methods, triggers one-click Stripe payments

The flow is designed to keep payment/customer data **never** stored in plan data (JSON manages content only), and **never** sent to the mobile client (Stripe tokens stay backend-only).

---

## Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────────┐
│ Local JSON File (Content)                                             │
│ ┌────────────────────────────────────────────────────────────────┐  │
│ │ backend/app/data/travel_insurance_plans.json                  │  │
│ │ [                                                               │  │
│ │   {                                                             │  │
│ │     "id": 1,                                                   │  │
│ │     "provider": "Allianz Assistance",                          │  │
│ │     "planName": "Family Travel Insurance",                     │  │
│ │     "planType": "Comprehensive family coverage",               │  │
│ │     "coverageStart": "12th August 2024",                       │  │
│ │     "coverageEnd": "20th August 2024",                         │  │
│ │     "premiumAmount": 59,                                       │  │
│ │     "currency": "£",                                           │  │
│ │     "whyThisOne": [...],                                       │  │
│ │     "benefitsSummary": "...",                                  │  │
│ │     "fullCoverageDetails": {...},                              │  │
│ │     "stripeAmountCents": 5900                                  │  │
│ │   },                                                            │  │
│ │   ...                                                           │  │
│ │ ]                                                               │  │
│ └────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
                                  ↓
                      (FastAPI serves on request)
                                  ↓
┌──────────────────────────────────────────────────────────────────────┐
│ FastAPI Backend (app/routers/)                                       │
│ ┌────────────────────────────────────────────────────────────────┐  │
│ │ insurance.py                                                   │  │
│ │ - GET /insurance/plans                                         │  │
│ │   └─ Reads JSON, returns all plans                            │  │
│ │                                                                │  │
│ │ - GET /insurance/plans/{plan_id}                              │  │
│ │   └─ Reads JSON, returns single plan                          │  │
│ │                                                                │  │
│ │ payments.py                                                    │  │
│ │ - POST /payments/insurance/intent                             │  │
│ │   ├─ Auth: get_current_customer()                            │  │
│ │   ├─ Lookup plan in JSON (get stripeAmountCents)             │  │
│ │   ├─ Create/reuse Stripe Customer                            │  │
│ │   ├─ Create Stripe PaymentIntent                             │  │
│ │   ├─ Create EphemeralKey for mobile SDK                      │  │
│ │   └─ Return: { client_secret, ephemeral_key_secret, ... }   │  │
│                                                                │  │
│ integrations/strapi.py                                          │  │
│ - StrapiClient: reads from local JSON file                      │  │
│                                                                │  │
│ config.py additions:                                            │  │
│ - stripe_secret_key, stripe_publishable_key                     │  │
│ └────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
                    ↓                                          ↓
         (insurance content)              (payment intent secret)
                    ↓                                          ↓
┌──────────────────────────────────────────────────────────────────────┐
│ React Native Mobile (Expo SDK 54)                                    │
│ ┌────────────────────────────────────────────────────────────────┐  │
│ │ TravelInsuranceCard.tsx                                        │  │
│ │ - Receives plan prop (from api.getInsurancePlan)              │  │
│ │ - Renders dynamic provider, coverage, benefits, premium       │  │
│ │                                                                │  │
│ │ TravelRecommendationFlow.tsx (updated)                         │  │
│ │ - At 'insurance' step: calls api.getInsurancePlan()           │  │
│ │ - Passes plan to TravelInsuranceCard + PaymentSummaryCard    │  │
│ │ - At 'payment' step: shows ConfirmPaymentModal on button tap │  │
│ │                                                                │  │
│ │ ConfirmPaymentModal.tsx                                        │  │
│ │ - States: idle/processing/success/error                       │  │
│ │ - On "Pay" button:                                            │  │
│ │   ├─ Call api.createInsurancePaymentIntent()                 │  │
│ │   ├─ Call initPaymentSheet() with returned secret            │  │
│ │   ├─ Call presentPaymentSheet() → one-tap biometric/confirm  │  │
│ │   └─ On success: advance flow to 'complete'                  │  │
│ │                                                                │  │
│ │ PaymentSummaryCard.tsx (updated)                              │  │
│ │ - Insurance price now comes from api data, not hardcoded      │  │
│ │                                                                │  │
│ │ api.ts additions:                                              │  │
│ │ - getInsurancePlan(planId): GET /insurance/plans/{planId}    │  │
│ │ - getInsurancePlans(): GET /insurance/plans                   │  │
│ │ - createInsurancePaymentIntent(planId, pmId):                │  │
│ │   POST /payments/insurance/intent                            │  │
│ │                                                                │  │
│ │ App.tsx                                                        │  │
│ │ - <StripeProvider publishableKey={...}>                       │  │
│ │                                                                │  │
│ │ app.json                                                       │  │
│ │ - Expo plugin: @stripe/stripe-react-native                    │  │
│ │   (merchantIdentifier for Apple Pay)                          │  │
│ │                                                                │  │
│ │ package.json                                                   │  │
│ │ - @stripe/stripe-react-native (SDK 54 compatible version)    │  │
│ │ - expo-dev-client (required for Stripe SDK)                   │  │
│ └────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
                              ↓
                (payment method id + secret)
                              ↓
┌──────────────────────────────────────────────────────────────────────┐
│ Stripe (Payment Processing)                                          │
│ - Customer (created/reused per veda_customer_id metadata)           │
│ - PaymentMethod (saved card, tokenized)                             │
│ - PaymentIntent (one-time charge for insurance plan)                │
│ - EphemeralKey (mobile SDK session token)                           │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Setup & Configuration

### 1. Backend Setup

#### Dependencies
Add to `backend/requirements.txt`:
```
stripe==11.1.0
```

Then run: `pip install -r requirements.txt`

#### Environment Variables
Add to `backend/.env`:

```env
STRIPE_SECRET_KEY=sk_test_... # or sk_live_... for production
STRIPE_PUBLISHABLE_KEY=pk_test_... # or pk_live_...
```

#### Code: `backend/app/data/travel_insurance_plans.json`

Create this file with your insurance plans:

```json
[
  {
    "id": 1,
    "provider": "Allianz Assistance",
    "planName": "Family Travel Insurance",
    "planType": "Comprehensive family coverage",
    "coverageStart": "12th August 2024",
    "coverageEnd": "20th August 2024",
    "premiumAmount": 59,
    "currency": "£",
    "whyThisOne": [
      "Covers medical emergencies up to £250,000",
      "Trip cancellation up to £1,000 per person",
      "Baggage and personal effects up to £500",
      "24/7 emergency support in 150+ countries"
    ],
    "benefitsSummary": "Comprehensive family coverage with medical emergency support, trip cancellation, and 24/7 global assistance.",
    "fullCoverageDetails": {
      "Medical Coverage": [
        "Emergency medical expenses: £250,000",
        "Dental treatment: £500"
      ],
      "Trip Protection": [
        "Trip cancellation: £1,000 per person",
        "Trip delay over 12 hours: £50"
      ]
    },
    "stripeAmountCents": 5900
  }
]
```

**Key fields:**
- `stripeAmountCents`: Authoritative amount for billing (in cents). This is **never** trusting the client—always fetched from this file and used for the actual charge.
- `premiumAmount`: Display price (e.g., 59 for £59)
- `currency`: Display currency (e.g., "£")

#### Code: `backend/app/integrations/strapi.py`

```python
"""Travel insurance plan content loader (reads from local JSON file)."""
from typing import Optional, List, Dict, Any
from pydantic import BaseModel
import json
from pathlib import Path


class TravelInsurancePlan(BaseModel):
    id: int
    provider: str
    planName: str
    planType: str
    coverageStart: str
    coverageEnd: str
    premiumAmount: float
    currency: str
    whyThisOne: List[str]
    benefitsSummary: str
    fullCoverageDetails: Dict[str, List[str]]
    stripeAmountCents: int


class StrapiClient:
    """Loads travel insurance plans from local JSON file."""

    def __init__(self, base_url: str = None, api_token: str = None):
        """Initialize client. base_url and api_token are unused (for compatibility)."""
        # Load plans from JSON file once at initialization
        plans_file = Path(__file__).parent.parent / "data" / "travel_insurance_plans.json"
        with open(plans_file) as f:
            data = json.load(f)
        self._plans = {plan["id"]: TravelInsurancePlan(**plan) for plan in data}

    def get_travel_insurance_plans(self) -> List[TravelInsurancePlan]:
        """Return all travel insurance plans."""
        return list(self._plans.values())

    def get_travel_insurance_plan(self, plan_id: int) -> Optional[TravelInsurancePlan]:
        """Fetch a single plan by ID."""
        return self._plans.get(plan_id)

    def close(self):
        """No-op for compatibility."""
        pass
```

#### Code: `backend/app/routers/insurance.py`

```python
"""Travel insurance plans and content."""
from fastapi import APIRouter, HTTPException, status
from typing import List

from app.integrations.strapi import StrapiClient, TravelInsurancePlan

router = APIRouter(prefix="/insurance", tags=["insurance"])


@router.get("/plans", response_model=List[TravelInsurancePlan])
def get_insurance_plans():
    """Fetch all available travel insurance plans."""
    try:
        strapi = StrapiClient()
        plans = strapi.get_travel_insurance_plans()
        return plans
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch plans: {str(e)}",
        )


@router.get("/plans/{plan_id}", response_model=TravelInsurancePlan)
def get_insurance_plan(plan_id: int):
    """Fetch a single insurance plan by ID."""
    try:
        strapi = StrapiClient()
        plan = strapi.get_travel_insurance_plan(plan_id)
        if not plan:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Plan not found"
            )
        return plan
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch plan: {str(e)}",
        )
```

#### Code: `backend/app/routers/payments.py`

```python
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

    Fetches the plan from the JSON file to get the authoritative charge amount,
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
            currency=plan.currency.lower(),
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
```

#### Code: Update `backend/app/config.py`

Add Stripe fields to your Settings class:

```python
stripe_secret_key: str = ""
stripe_publishable_key: str = ""

@property
def stripe_configured(self) -> bool:
    return bool(self.stripe_secret_key and self.stripe_publishable_key)
```

#### Code: Update `backend/app/main.py`

Register the new routers:

```python
from app.routers import insurance, payments

app.include_router(insurance.router)
app.include_router(payments.router)
```

---

### 2. Mobile (React Native / Expo)

#### Dependencies

Check `mobile/AGENTS.md` — this app is on **Expo SDK 54**, so use the SDK 54–compatible version of `@stripe/stripe-react-native`.

```bash
cd mobile

# Install Stripe SDK (check Stripe docs for SDK 54 compatibility)
npx expo install @stripe/stripe-react-native

# Required: dev client for native code
npx expo install expo-dev-client

# Verify
npx expo-doctor
```

Then run `npm install` to update `mobile/package.json`.

#### Code: Update `mobile/app.json`

Add the Stripe Expo plugin:

```json
{
  "expo": {
    "plugins": [
      ["@stripe/stripe-react-native", { "merchantIdentifier": "com.veda.app" }]
    ]
  }
}
```

#### Code: Update `mobile/App.tsx`

Wrap your app root with `StripeProvider`:

```tsx
import { StripeProvider } from '@stripe/stripe-react-native';

export default function App() {
  const stripePublishableKey = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY || '';

  return (
    <StripeProvider publishableKey={stripePublishableKey}>
      <YourAppNavigator />
    </StripeProvider>
  );
}
```

#### Code: Update `mobile/.env.example`

Add:
```env
EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
```

#### Code: Update `mobile/src/types.ts`

Add the TravelInsurancePlan type:

```typescript
export type TravelInsurancePlan = {
  id: number;
  provider: string;
  planName: string;
  planType: string;
  coverageStart: string;
  coverageEnd: string;
  premiumAmount: number;
  currency: string;
  whyThisOne: string[];
  benefitsSummary: string;
  fullCoverageDetails: Record<string, string[]>;
  stripeAmountCents: number;
};
```

#### Code: Update `mobile/src/lib/api.ts`

Add these endpoints:

```typescript
// --- Travel Insurance ---
getInsurancePlan: (planId: number) =>
  authedFetch<TravelInsurancePlan>(`/insurance/plans/${planId}`, {
    method: 'GET',
  }),

getInsurancePlans: () =>
  authedFetch<TravelInsurancePlan[]>('/insurance/plans', {
    method: 'GET',
  }),

createInsurancePaymentIntent: (planId: number, paymentMethodId: string) =>
  authedFetch<{
    client_secret: string;
    ephemeral_key_secret: string;
    customer_id: string;
    publishable_key: string;
  }>('/payments/insurance/intent', {
    method: 'POST',
    body: JSON.stringify({
      plan_id: planId,
      payment_method_id: paymentMethodId,
    }),
  }),
```

#### Code: Database migration (Supabase) — Optional

If you want to save payment methods per customer:

Create `backend/supabase/migrations/000X_add_stripe_payment_method.sql`:

```sql
ALTER TABLE customers ADD COLUMN stripe_payment_method_id TEXT UNIQUE DEFAULT NULL;
```

Then push: `supabase db push`

---

## Data Flow

```
User taps "Pay with Visa card"
     ↓
ConfirmPaymentModal opens
     ↓
User confirms with Face ID / Touch ID
     ↓
Mobile calls api.createInsurancePaymentIntent(planId, paymentMethodId)
     ↓
FastAPI:
  1. Fetches plan from JSON (gets stripeAmountCents)
  2. Creates Stripe PaymentIntent with that amount
  3. Returns { client_secret, ephemeral_key_secret, ... }
     ↓
Mobile receives intent
     ↓
Mobile calls initPaymentSheet() then presentPaymentSheet()
     ↓
Stripe PaymentSheet confirms the charge (one-tap, already saved card)
     ↓
Mobile receives success
     ↓
Flow advances to 'complete'
```

---

## Testing

### Backend (Local)

```bash
cd backend

# Verify .env has Stripe keys
cat .env | grep STRIPE

# Start the server
uvicorn app.main:app --reload

# Test insurance endpoint
curl http://localhost:8000/insurance/plans

# Test payment intent (with Stripe test token)
curl -X POST http://localhost:8000/payments/insurance/intent \
  -H "Authorization: Bearer YOUR_TEST_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"plan_id": 1, "payment_method_id": "pm_card_visa"}'
```

### Mobile

```bash
cd mobile

# Make sure .env has your Stripe publishable key
cat .env | grep EXPO_PUBLIC_STRIPE

# Start the app
npx expo start

# Use the dev client to run on simulator/device
```

Then:
1. Navigate to the insurance step → verify `TravelInsuranceCard` renders the plan from the API
2. Navigate to payment step → tap "Pay with Visa card"
3. Confirm payment with biometric or one-tap
4. Verify flow advances to 'complete'

---

## Stripe Test Cards

| Card | Description |
|------|-------------|
| 4242 4242 4242 4242 | Successful payment |
| 4000 0000 0000 0002 | Card declined |
| 3782 822463 10005 | American Express |

(Any future expiry date, any CVC)

---

## Adding/Editing Plans

To add or edit insurance plans, simply update `backend/app/data/travel_insurance_plans.json` and restart the backend (or it will auto-reload if using `uvicorn --reload`). The changes are reflected immediately in the mobile app on next request.

---

## Future Enhancements

- Store policy records in a database after successful payment
- Add tier selection UI (choose multiple plans)
- Implement plan recommendations based on trip duration / destination
- Webhook integration for payment status updates (paid, refunded, etc.)
- Multi-currency support
- Migrate to Strapi Cloud when ready for CMS workflows
