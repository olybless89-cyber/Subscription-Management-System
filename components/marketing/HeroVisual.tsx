const SUBSCRIPTIONS = [
  { code: 'WOH-000104', status: 'Active', color: '#2af598' },
  { code: 'WOH-000098', status: 'Grace period', color: '#ffb648' },
  { code: 'WOH-000091', status: 'Suspended', color: '#ff4d6d' },
  { code: 'WOH-000087', status: 'Active', color: '#2af598' },
  { code: 'WOH-000082', status: 'Payment due', color: '#ffb648' },
];

const STATUS_ITEMS = [
  { label: 'Payments', value: 'Server-verified' },
  { label: 'Suspension', value: 'Safety-checked' },
  { label: 'Admin access', value: 'Scoped' },
  { label: 'Every action', value: 'Audit logged' },
];

export default function HeroVisual() {
  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-6">
      <div className="w-full max-w-[420px] overflow-hidden rounded-xl border border-white/10 bg-[#0a1512] shadow-card">
        <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
          <span className="text-[11px] font-semibold tracking-[0.15em] text-white/50">SUBSCRIPTIONS</span>
          <span className="flex items-center gap-1.5 text-[11px] text-wo-green">
            <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-wo-green" /> Live
          </span>
        </div>
        <ul>
          {SUBSCRIPTIONS.map((row) => (
            <li
              key={row.code}
              className="flex items-center justify-between border-b border-white/5 px-4 py-3 text-[13px] last:border-b-0"
            >
              <span className="font-mono text-white/85">{row.code}</span>
              <span className="flex items-center gap-2 text-white/70">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: row.color }} />
                {row.status}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="space-y-6 lg:w-[220px] lg:pt-2">
        <div>
          <p className="text-[10px] font-semibold tracking-[0.2em] text-white/50">
            EVERY CUSTOMER.
            <br />
            ONE DASHBOARD.
          </p>
          <p className="mt-3 text-[13px] leading-relaxed text-wo-muted">
            Billing, suspension, and infrastructure status for every customer — tracked
            automatically, visible the moment they log in.
          </p>
        </div>

        <div>
          <p className="mb-2 text-[10px] font-semibold tracking-[0.2em] text-white/50">
            HOW IT RUNS
          </p>
          <ul className="space-y-2">
            {STATUS_ITEMS.map((s) => (
              <li key={s.label} className="flex items-center justify-between text-[12px]">
                <span className="flex items-center gap-2 text-white/70">
                  <span className="h-1.5 w-1.5 rounded-full bg-wo-green" />
                  {s.label}
                </span>
                <span className="font-medium text-white">{s.value}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
