export interface VerifiedTransaction {
  reference: string;
  /** Amount in minor units (kobo/cents), as confirmed server-side by the provider. */
  amountMinor: number;
  currency: string;
  status: 'success' | 'failed' | 'abandoned';
  customerEmail?: string;
  raw: unknown;
}

export interface InitializePaymentInput {
  reference: string;
  amountMinor: number;
  currency: string;
  customerEmail: string;
  callbackUrl: string;
}

export interface InitializePaymentResult {
  authorizationUrl: string;
  accessCode?: string;
  reference: string;
}

/**
 * PaymentProvider — spec section 10. Paystack is the initial
 * implementation (paystack.ts); Flutterwave or another provider
 * implements the same interface without the webhook handler or billing
 * logic changing at all.
 */
export interface PaymentProvider {
  name: string;
  initializePayment(input: InitializePaymentInput): Promise<InitializePaymentResult>;
  /** True/false only — never throws on a bad signature, so callers can't
   * accidentally treat a thrown error as "verified". */
  verifyWebhookSignature(rawBody: string, signatureHeader: string | null): boolean;
  /** Always re-verifies against the provider's API — the webhook payload
   * itself is never trusted for the amount/status (spec section 10). */
  verifyTransaction(reference: string): Promise<VerifiedTransaction>;
}
