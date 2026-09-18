import { UptimeStats, formatDuration } from './types';

/** Small ring used on each resource card in the Subscriptions section. */
export function UptimeRing({ uptime }: { uptime: UptimeStats }) {
  const size = 92;
  const stroke = 8;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const percent = uptime.uptimePercent ?? 0;
  const offset = circumference - (percent / 100) * circumference;

  return (
    <div style={{ position: 'relative', width: size, height: size }} role="img" aria-label={uptime.uptimePercent !== null ? `${uptime.uptimePercent.toFixed(1)}% uptime` : 'Uptime: not enough data yet'}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={radius} strokeWidth={stroke} fill="none" className="w3-progress-ring-bg" />
        {uptime.uptimePercent !== null && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            strokeWidth={stroke}
            fill="none"
            stroke="var(--w3-cyan)"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            style={{ transition: 'stroke-dashoffset 0.6s ease' }}
          />
        )}
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }} aria-hidden="true">
        {uptime.uptimePercent !== null ? (
          <span style={{ fontSize: '1.1em', fontWeight: 700 }}>{uptime.uptimePercent.toFixed(1)}%</span>
        ) : (
          <span style={{ fontSize: '0.65em', color: 'var(--w3-text-soft)', textAlign: 'center', padding: '0 0.4em' }}>
            No data yet
          </span>
        )}
      </div>
    </div>
  );
}

/** The large donut on the System Uptime card, with the Uptime/Downtime
 * legend beside it (percent + real elapsed duration, derived from the
 * actual observed window — never a fabricated fixed duration). */
export function BigUptimeDonut({ uptime }: { uptime: UptimeStats }) {
  const size = 176;
  const stroke = 15;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const percent = uptime.uptimePercent ?? 0;
  const offset = circumference - (percent / 100) * circumference;

  const elapsedMs = uptime.windowStart ? new Date(uptime.windowEnd).getTime() - new Date(uptime.windowStart).getTime() : 0;
  const uptimeMs = uptime.uptimePercent !== null ? elapsedMs * (uptime.uptimePercent / 100) : 0;
  const downtimeMs = uptime.uptimePercent !== null ? elapsedMs - uptimeMs : 0;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '1.8em', flexWrap: 'wrap' }}>
      <div
        style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}
        role="img"
        aria-label={uptime.uptimePercent !== null ? `${uptime.uptimePercent.toFixed(2)}% uptime` : 'Uptime: not enough data yet'}
      >
        <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }} aria-hidden="true">
          <circle cx={size / 2} cy={size / 2} r={radius} strokeWidth={stroke} fill="none" className="w3-progress-ring-bg" />
          {uptime.uptimePercent !== null && (
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              strokeWidth={stroke}
              fill="none"
              stroke="var(--w3-cyan)"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              strokeLinecap="round"
              style={{ transition: 'stroke-dashoffset 0.6s ease' }}
            />
          )}
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }} aria-hidden="true">
          {uptime.uptimePercent !== null ? (
            <>
              <span style={{ fontSize: '1.8em', fontWeight: 700 }}>{uptime.uptimePercent.toFixed(2)}%</span>
              <span className="w3-label" style={{ marginTop: '0.2em' }}>Uptime</span>
            </>
          ) : (
            <span style={{ fontSize: '0.8em', color: 'var(--w3-text-soft)', textAlign: 'center', padding: '0 0.6em' }}>
              Not enough data yet
            </span>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1em' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.7em' }}>
          <span className="w3-pulse-dot" style={{ background: 'var(--w3-cyan)' }} aria-hidden="true" />
          <div>
            <div style={{ fontSize: '0.78em', color: 'var(--w3-text-soft)' }}>Uptime</div>
            <div style={{ fontWeight: 700 }}>
              {uptime.uptimePercent !== null ? `${uptime.uptimePercent.toFixed(2)}%` : '—'}
              {uptime.windowStart && <span style={{ fontWeight: 400, color: 'var(--w3-text-soft)' }}> ({formatDuration(uptimeMs)})</span>}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.7em' }}>
          <span className="w3-pulse-dot" style={{ background: 'var(--w3-danger)' }} aria-hidden="true" />
          <div>
            <div style={{ fontSize: '0.78em', color: 'var(--w3-text-soft)' }}>Downtime</div>
            <div style={{ fontWeight: 700 }}>
              {uptime.uptimePercent !== null ? `${(100 - uptime.uptimePercent).toFixed(2)}%` : '—'}
              {uptime.windowStart && <span style={{ fontWeight: 400, color: 'var(--w3-text-soft)' }}> ({formatDuration(downtimeMs)})</span>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
