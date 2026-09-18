'use client';

import { useEffect, useState } from 'react';

interface SuspendedInfo {
  found: boolean;
  customerCode?: string;
  customerName?: string;
  needsPayment?: boolean;
  planName?: string;
  amount?: number;
  currency?: string;
}

function formatAmount(minorUnits: number, currency: string): string {
  return `${currency} ${(minorUnits / 100).toLocaleString()}`;
}

/**
 * The landing page a customer's own domain shows while their service is
 * suspended — reached because that domain has been manually repointed
 * (in Railway) at this app instead of their stopped one. middleware.ts
 * rewrites every path on an unrecognized domain to this route, so it
 * doesn't matter what page they were trying to load.
 *
 * Who's asking is resolved server-side from the request's Host header
 * (see /api/public/suspended-lookup) — nothing here is passed in via
 * the URL, so there's nothing to guess or tamper with.
 */
export default function SuspendedPage() {
  const [info, setInfo] = useState<SuspendedInfo | null>(null);
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/public/suspended-lookup')
      .then((res) => res.json())
      .then(setInfo)
      .catch(() => setInfo({ found: false }));
  }, []);

  async function handlePay() {
    if (!info?.customerCode) return;
    setPayError(null);
    setPaying(true);
    try {
      const res = await fetch(`/api/public/renew/${encodeURIComponent(info.customerCode)}/checkout`, {
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
        <img src="/dwo-logo.jpg" alt="Digital WebOracle" style={{ height: 40, width: 'auto', margin: '0 auto 1.4em', display: 'block' }} />

        {!info && (
          <p style={{ color: 'var(--ink-soft)' }}>Checking your account…</p>
        )}

        {info && info.found && !info.needsPayment && (
          <>
            <div style={{ fontSize: '2.4em', marginBottom: '0.3em' }}>✅</div>
            <h1 style={{ fontSize: '1.3em', fontWeight: 700, margin: '0 0 0.5em' }}>Your account is active</h1>
            <p style={{ color: 'var(--ink-soft)', margin: 0 }}>
              {info.customerName}, we don&apos;t see anything unpaid on this account. If this domain is
              still showing this page, it may just need to be pointed back to your live service.
            </p>
          </>
        )}

        {info && info.found && info.needsPayment && (
          <>
            <h1 style={{ fontSize: '1.5em', fontWeight: 700, margin: '0 0 0.4em', color: 'var(--clay)' }}>
              Your monthly cloud hosting subscription is overdue
            </h1>
            <p style={{ color: 'var(--ink-soft)', margin: '0 0 1.4em' }}>
              {info.customerName}, kindly make payment to reactivate your services. Your site comes back
              online automatically as soon as payment is confirmed.
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
              {paying ? 'Redirecting to Paystack…' : 'Make payment to reactivate'}
            </button>
            <p style={{ fontSize: '0.78em', color: 'var(--ink-soft)', marginTop: '1em', marginBottom: 0 }}>
              Your service unlocks automatically the moment payment is confirmed — no need to
              contact anyone.
            </p>
          </>
        )}

        {info && !info.found && (
          <>
            <h1 style={{ fontSize: '1.4em', fontWeight: 700, margin: '0 0 0.5em', color: 'var(--clay)' }}>
              This service is temporarily unavailable
            </h1>
            <p style={{ color: 'var(--ink-soft)', margin: 0 }}>
              Your monthly cloud hosting subscription is overdue. Kindly make payment to reactivate your
              services — contact your account manager for a payment link if you don&apos;t have one on
              hand.
            </p>
          </>
        )}
      </div>
    </main>
  );
}
