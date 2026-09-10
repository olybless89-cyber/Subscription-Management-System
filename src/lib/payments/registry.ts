import { PaymentProviderName } from '@/types/domain';
import { PaymentProvider } from './provider';
import { createPaystackProvider } from './paystack';

export class UnsupportedPaymentProviderError extends Error {
  constructor(public readonly providerName: PaymentProviderName) {
    super(`Payment provider "${providerName}" is not implemented yet.`);
    this.name = 'UnsupportedPaymentProviderError';
  }
}

/**
 * resolvePaymentProvider — the routing point for "customer group A uses
 * Paystack, customer group B uses a different provider." Each
 * Customer row carries a `paymentProvider` field (set by an admin); this
 * function turns that into the actual provider instance that
 * initiateCheckout/handlePaymentWebhook should use for that customer.
 *
 * FLUTTERWAVE is a real value in the schema/enum today — an admin CAN
 * group customers onto it — but there's no working adapter behind it
 * yet, only Paystack's. Resolving it throws a clear, typed error rather
 * than silently falling back to Paystack (which would charge the wrong
 * customers through the wrong account) or returning a fake success.
 * Implement createFlutterwaveProvider() the same shape as
 * createPaystackProvider() when you're ready to wire it up — nothing
 * else in the checkout/webhook flow needs to change.
 */
export function resolvePaymentProvider(providerName: PaymentProviderName): PaymentProvider {
  switch (providerName) {
    case 'PAYSTACK':
      return createPaystackProvider();
    case 'FLUTTERWAVE':
      throw new UnsupportedPaymentProviderError(providerName);
  }
}
