import { UptimeWindow } from './types';

const OPTIONS: Array<{ value: UptimeWindow; label: string }> = [
  { value: 'd1', label: '24h' },
  { value: 'd7', label: '7d' },
  { value: 'd30', label: '30d' },
];

/** The 24h / 7d / 30d segmented control on the System Uptime card.
 * Purely a controlled selector — the parent already holds all three
 * windows' data (fetchDashboardData returns them together), so picking
 * a period here just changes which one is displayed, no refetch. */
export function PeriodSelector({ value, onChange }: { value: UptimeWindow; onChange: (value: UptimeWindow) => void }) {
  return (
    <div
      role="tablist"
      aria-label="Uptime period"
      style={{ display: 'flex', gap: '0.3em', background: 'rgba(255,255,255,0.04)', borderRadius: 999, padding: '0.25em' }}
    >
      {OPTIONS.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.value)}
            style={{
              border: 'none',
              cursor: 'pointer',
              borderRadius: 999,
              padding: '0.4em 0.85em',
              fontSize: '0.78em',
              fontWeight: 600,
              background: active ? 'rgba(0, 229, 160, 0.18)' : 'transparent',
              color: active ? 'var(--w3-cyan)' : 'var(--w3-text-soft)',
              transition: 'background 0.15s ease, color 0.15s ease',
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
