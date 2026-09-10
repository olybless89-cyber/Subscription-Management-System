import crypto from 'node:crypto';
import {
  PaymentProvider,
  InitializePaymentInput,
  InitializePaymentResult,
  VerifiedTransaction,
} from './provider';

const PAYSTACK_BASE_URL = 'https://api.paystack.co';

function getSecretKey(): string {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) {
    throw new Error('PAYSTACK_SECRET_KEY is not configured on the server');
  }
  return key;
}

export function createPaystackProvider(secretKeyOverride?: string): PaymentProvider {
  const secretKey = secretKeyOverride ?? getSecretKey();

  return {
    name: 'paystack',

    async initializePayment(input: InitializePaymentInput): Promise<InitializePaymentResult> {
      // Spec section 34/callback note: callbackUrl MUST be https:// in
      // production. Refuse to initialize with a non-https callback rather
      // than silently sending Paystack an insecure URL — this is the
      // known outstanding Remitrova-style bug this codebase should not
      // repeat.
      if (!input.callbackUrl.startsWith('https://')) {
        throw new Error(
          `Refusing to initialize payment with a non-https callbackUrl: ${input.callbackUrl}`
        );
      }

      const res = await fetch(`${PAYSTACK_BASE_URL}/transaction/initialize`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${secretKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          reference: input.reference,
          amount: input.amountMinor,
          currency: input.currency,
          email: input.customerEmail,
          callback_url: input.callbackUrl,
        }),
      });

      const json = (await res.json()) as {
        status: boolean;
        message: string;
        data?: { authorization_url: string; access_code: string; reference: string };
      };

      if (!res.ok || !json.status || !json.data) {
        throw new Error(`Paystack initialize failed: ${json.message ?? res.statusText}`);
      }

      return {
        authorizationUrl: json.data.authorization_url,
        accessCode: json.data.access_code,
        reference: json.data.reference,
      };
    },

    verifyWebhookSignature(rawBody: string, signatureHeader: string | null): boolean {
      if (!signatureHeader) return false;
      const expected = crypto.createHmac('sha512', secretKey).update(rawBody).digest('hex');
      const a = Buffer.from(expected, 'utf8');
      const b = Buffer.from(signatureHeader, 'utf8');
      if (a.length !== b.length) return false;
      return crypto.timingSafeEqual(a, b);
    },

    async verifyTransaction(reference: string): Promise<VerifiedTransaction> {
      const res = await fetch(
        `${PAYSTACK_BASE_URL}/transaction/verify/${encodeURIComponent(reference)}`,
        { headers: { Authorization: `Bearer ${secretKey}` } }
      );

      const json = (await res.json()) as {
        status: boolean;
        message: string;
        data?: {
          reference: string;
          amount: number;
          currency: string;
          status: string;
          customer?: { email: string };
        };
      };

      if (!res.ok || !json.status || !json.data) {
        throw new Error(`Paystack verify failed: ${json.message ?? res.statusText}`);
      }

      const status: VerifiedTransaction['status'] =
        json.data.status === 'success'
          ? 'success'
          : json.data.status === 'abandoned'
            ? 'abandoned'
            : 'failed';

      return {
        reference: json.data.reference,
        amountMinor: json.data.amount,
        currency: json.data.currency,
        status,
        customerEmail: json.data.customer?.email,
        raw: json,
      };
    },
  };
}
