import { Activity } from 'lucide-react';
import { ActivityEvent, UptimeSeriesPoint, formatTime } from './types';
import { StatusBadge } from './StatusBadge';
import { ActivityChart } from './ActivityChart';

function eventLabel(event: ActivityEvent): string {
  if (event.changed) {
    if (event.status === 'ACTIVE') return `${event.resourceLabel} came back online`;
    if (event.status === 'STOPPED') return `${event.resourceLabel} went offline`;
    if (event.status === 'ERROR') return `${event.resourceLabel} reported an error`;
    return `${event.resourceLabel} status became unknown`;
  }
  const word = event.status === 'ACTIVE' ? 'operational' : event.status === 'STOPPED' ? 'down' : event.status === 'ERROR' ? 'erroring' : 'unknown';
  return `${event.resourceLabel} — last check: ${word}`;
}

/**
 * SystemActivityCard — a real feed of status transitions (plus each
 * resource's most recent check) beside a trailing-24h uptime chart,
 * both built server-side from actual status-check history
 * (buildRecentActivityEvents / buildUptimeSeries in
 * src/lib/monitoring/uptime.ts). No mock/placeholder events are ever
 * shown — an account with no check history yet just shows an honest
 * empty state instead.
 */
export function SystemActivityCard({ events, series }: { events: ActivityEvent[]; series: UptimeSeriesPoint[] }) {
  return (
    <div className="w3-panel" style={{ marginBottom: '1.4em' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6em', marginBottom: '1.2em' }}>
        <Activity size={17} style={{ color: 'var(--w3-cyan)' }} aria-hidden="true" />
        <span style={{ fontWeight: 700, fontSize: '1.05em' }}>System Activity</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 1fr) minmax(260px, 1.4fr)', gap: '1.8em' }}>
        <div>
          {events.length === 0 ? (
            <p style={{ color: 'var(--w3-text-soft)', fontSize: '0.88em', margin: 0 }}>
              No activity recorded yet — this fills in as your services get checked.
            </p>
          ) : (
            <ul style={{ display: 'flex', flexDirection: 'column', gap: '0.2em', listStyle: 'none', margin: 0, padding: 0 }}>
              {events.map((event, idx) => {
                const ok = event.status === 'ACTIVE';
                return (
                  <li
                    key={idx}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: '0.8em',
                      padding: '0.6em 0.1em',
                      borderBottom: '1px solid rgba(255,255,255,0.05)',
                      fontSize: '0.85em',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.7em', minWidth: 0 }}>
                      <span className="w3-pulse-dot" style={{ background: ok ? 'var(--w3-cyan)' : 'var(--w3-danger)', flexShrink: 0 }} aria-hidden="true" />
                      <span className="w3-mono" style={{ fontSize: '0.85em', color: 'var(--w3-text-soft)', flexShrink: 0 }}>
                        {formatTime(event.checkedAt)}
                      </span>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{eventLabel(event)}</span>
                    </div>
                    <StatusBadge label={ok ? 'Success' : 'Attention'} tone={ok ? 'good' : 'bad'} />
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div>
          <ActivityChart series={series} />
        </div>
      </div>
    </div>
  );
}
