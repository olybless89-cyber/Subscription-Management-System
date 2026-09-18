import { CSSProperties } from 'react';

function Block({ height, width = '100%', style }: { height: number | string; width?: number | string; style?: CSSProperties }) {
  return (
    <div
      aria-hidden="true"
      style={{
        height,
        width,
        borderRadius: 8,
        background: 'linear-gradient(90deg, rgba(255,255,255,0.05) 25%, rgba(255,255,255,0.09) 37%, rgba(255,255,255,0.05) 63%)',
        backgroundSize: '400% 100%',
        animation: 'w3-skeleton-shimmer 1.4s ease infinite',
        ...style,
      }}
    />
  );
}

/** Full-page skeleton shown while the dashboard's first fetch is in
 * flight, shaped like the real layout (hero + uptime/health row +
 * activity) so there's no blank-screen flash and no layout shift once
 * data lands. */
export function DashboardSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading your dashboard">
      <style>{`
        @keyframes w3-skeleton-shimmer {
          0% { background-position: 100% 0; }
          100% { background-position: 0 0; }
        }
      `}</style>
      <div className="w3-panel" style={{ marginBottom: '1.4em', minHeight: 180, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '0.8em' }}>
        <Block height={28} width={280} />
        <Block height={16} width={180} />
        <Block height={48} width={260} style={{ marginTop: '0.6em' }} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.2em', marginBottom: '1.2em' }}>
        <div className="w3-panel" style={{ minHeight: 220 }}>
          <Block height={20} width={140} style={{ marginBottom: '1.4em' }} />
          <Block height={176} width={176} style={{ borderRadius: '50%' }} />
        </div>
        <div className="w3-panel" style={{ minHeight: 220 }}>
          <Block height={20} width={140} style={{ marginBottom: '1.4em' }} />
          {[0, 1, 2].map((i) => (
            <Block key={i} height={36} style={{ marginBottom: '0.6em' }} />
          ))}
        </div>
      </div>
      <div className="w3-panel" style={{ minHeight: 220 }}>
        <Block height={20} width={160} style={{ marginBottom: '1.4em' }} />
        <Block height={140} />
      </div>
    </div>
  );
}

export function DashboardErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="w3-panel" style={{ textAlign: 'center', padding: '3em 1.5em' }}>
      <p style={{ color: 'var(--w3-danger)', fontWeight: 600, marginBottom: '0.4em' }}>{message}</p>
      <p style={{ color: 'var(--w3-text-soft)', fontSize: '0.9em', marginBottom: '1.4em' }}>
        Something went wrong loading your dashboard. Your data is safe — this is just a connection hiccup.
      </p>
      <button onClick={onRetry} className="w3-btn">
        Retry
      </button>
    </div>
  );
}
