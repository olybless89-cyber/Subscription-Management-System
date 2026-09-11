'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

interface RenewalInfo {
  found: boolean;
  customerName?: string;
  needsPayment?: boolean;
  subscriptionId?: string;
  subscriptionStatus?: string;
  planName?: string;
  amount?: number;
  currency?: string;
}

function formatAmount(minorUnits: number, currency: string): string {
  return `${currency} ${(minorUnits / 100).toLocaleString()}`;
}

export default function RenewPage({ params }: { params: { customerCode: string } }) {
  const searchParams = useSearchParams();
  const justPaid = searchParams.get('paid') === '1';

  const [info, setInfo] = useState<RenewalInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/public/renew/${encodeURIComponent(params.customerCode)}`)
      .then(async (res) => {
        if (!res.ok) {
          setLoadError("We couldn't find that account. Double-check the link and try again.");
          return;
        }
        setInfo(await res.json());
      })
      .catch(() => setLoadError('Something went wrong loading your account. Please try again shortly.'));
  }, [params.customerCode]);

  async function handlePay() {
    setPayError(null);
    setPaying(true);
    try {
      const res = await fetch(`/api/public/renew/${encodeURIComponent(params.customerCode)}/checkout`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok || !data.authorizationUrl) {
        throw new Error(data.message ?? data.error ?? 'Could not start payment');
      }
      window.location.href = data.authorizationUrl;
    } catch (err) {
      setPayError(err instanceof Error ? err.message : 'Could not start payment');
      setPaying(false);
    }
  }

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(160deg, #16352a 0%, #0e241c 100%)',
        padding: '2em 1.2em',
      }}
    >
      <div className="card" style={{ width: '100%', maxWidth: 460, background: 'var(--paper-raised)', textAlign: 'center' }}>
        <img src="/dwo-logo.jpg" alt="Web Oracle Host" style={{ height: 40, width: 'auto', margin: '0 auto 1.4em', display: 'block' }} />

        {loadError && (
          <>
            <h1 style={{ fontSize: '1.3em', fontWeight: 700, margin: '0 0 0.5em' }}>Account not found</h1>
            <p style={{ color: 'var(--ink-soft)', margin: 0 }}>{loadError}</p>
          </>
        )}

        {!info && !loadError && (
          <p style={{ color: 'var(--ink-soft)' }}>Loading your account…</p>
        )}

        {info && justPaid && (
          <>
            <div style={{ fontSize: '2.4em', marginBottom: '0.3em' }}>✅</div>
            <h1 style={{ fontSize: '1.3em', fontWeight: 700, margin: '0 0 0.5em' }}>Payment received</h1>
            <p style={{ color: 'var(--ink-soft)', margin: 0 }}>
              Thank you — your service is being restored. This usually takes just a few seconds; if
              your site isn't back within a few minutes, contact us and we'll check it right away.
            </p>
          </>
        )}

        {info && info.found && !justPaid && !info.needsPayment && (
          <>
            <div style={{ fontSize: '2.4em', marginBottom: '0.3em' }}>✅</div>
            <h1 style={{ fontSize: '1.3em', fontWeight: 700, margin: '0 0 0.5em' }}>You're all set</h1>
            <p style={{ color: 'var(--ink-soft)', margin: 0 }}>
              {info.customerName}, your subscription is active — nothing to pay right now.
            </p>
          </>
        )}

        {info && info.found && !justPaid && info.needsPayment && (
          <>
            <h1 style={{ fontSize: '1.5em', fontWeight: 700, margin: '0 0 0.4em', color: 'var(--clay)' }}>
              Your subscription has expired
            </h1>
            <p style={{ color: 'var(--ink-soft)', margin: '0 0 1.4em' }}>
              {info.customerName}, your hosting service has been suspended. Renew now to restore it
              automatically.
            </p>

            {info.planName && info.amount !== undefined && info.currency && (
              <div
                style={{
                  border: '1px solid var(--line-strong)',
                  borderRadius: 6,
                  padding: '1em',
                  marginBottom: '1.4em',
                  textAlign: 'left',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9em', color: 'var(--ink-soft)' }}>
                  <span>Plan</span>
                  <span>{info.planName}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, fontSize: '1.1em', marginTop: '0.4em' }}>
                  <span>Amount due</span>
                  <span>{formatAmount(info.amount, info.currency)}</span>
                </div>
              </div>
            )}

            {payError && <p className="error-text" style={{ marginBottom: '1em' }}>{payError}</p>}

            <button
              onClick={handlePay}
              disabled={paying}
              className="btn btn-primary"
              style={{ width: '100%', justifyContent: 'center', fontSize: '1.05em', padding: '0.75em' }}
            >
              {paying ? 'Redirecting to Paystack…' : 'Renew now with Paystack'}
            </button>
            <p style={{ fontSize: '0.78em', color: 'var(--ink-soft)', marginTop: '1em', marginBottom: 0 }}>
              Your service unlocks automatically the moment payment is confirmed — no need to
              contact anyone.
            </p>
          </>
        )}
      </div>
    </main>
  );
}
