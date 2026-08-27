// Dev-only Stripe integration for testing payment flows with real PaymentSheet UI
// Opens the Stripe payment test screen with full card entry UI

export async function createStripeTestPayment(): Promise<{ summary: string }> {
  // This function just returns a summary - actual payment sheet is opened via navigation
  // See StripePaymentScreen.tsx for the full payment flow
  return {
    summary: 'Opening Stripe Payment Sheet...',
  };
}
