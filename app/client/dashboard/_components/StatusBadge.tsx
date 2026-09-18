const TONE_COLOR: Record<'good' | 'bad' | 'warn' | 'neutral', string> = {
  good: 'var(--w3-cyan)',
  bad: 'var(--w3-danger)',
  warn: 'var(--w3-amber)',
  neutral: 'var(--w3-text-soft)',
};

/** A single color-coded pill used everywhere the dashboard reports a
 * status: server health, uptime badges, activity outcomes. One
 * component so every badge in the dashboard shares the same shape and
 * color language instead of each card inventing its own. */
export function StatusBadge({ label, tone, pulse = false }: { label: string; tone: 'good' | 'bad' | 'warn' | 'neutral'; pulse?: boolean }) {
  const color = TONE_COLOR[tone];
  return (
    <span
      className="w3-badge"
      style={{ color, borderColor: tone === 'neutral' ? 'rgba(255,255,255,0.12)' : color }}
      role="status"
    >
      {pulse && <span className="w3-pulse-dot" style={{ background: color }} aria-hidden="true" />}
      {label}
    </span>
  );
}
