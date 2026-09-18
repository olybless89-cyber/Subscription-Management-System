const REGIONS = [
  { label: 'US-EAST', ms: '24ms', top: '18%', left: '30%' },
  { label: 'EU-WEST', ms: '28ms', top: '24%', left: '72%' },
  { label: 'ASIA', ms: '52ms', top: '48%', left: '82%' },
  { label: 'AFRICA', ms: '36ms', top: '58%', left: '58%' },
  { label: 'SOUTH AMERICA', ms: '48ms', top: '68%', left: '28%' },
];

const STATUS_ITEMS = [
  { label: 'All Systems Operational', value: '99.99%' },
  { label: 'API Gateway', value: 'Online' },
  { label: 'Global Network', value: 'Online' },
  { label: 'Deployments', value: 'Healthy' },
  { label: 'Databases', value: 'Healthy' },
];

export default function HeroVisual() {
  return (
    <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:gap-6">
      <div className="relative mx-auto aspect-square w-full max-w-[420px] shrink-0 lg:mx-0">
        {/* glow */}
        <div className="absolute inset-0 rounded-full bg-radial-fade blur-2xl" />

        {/* globe */}
        <div className="absolute inset-[8%] overflow-hidden rounded-full border border-wo-green/20 bg-[radial-gradient(circle_at_32%_28%,#0f2a22,transparent_55%),radial-gradient(circle_at_70%_70%,#061410,transparent_60%),#03100c] shadow-[inset_0_0_60px_rgba(0,0,0,0.6)]">
          <svg viewBox="0 0 200 200" className="h-full w-full animate-spin-slow opacity-40">
            {Array.from({ length: 7 }).map((_, i) => (
              <ellipse
                key={`lat-${i}`}
                cx="100"
                cy="100"
                rx={90 - i * 12}
                ry="90"
                fill="none"
                stroke="#2af598"
                strokeWidth="0.4"
              />
            ))}
            {Array.from({ length: 6 }).map((_, i) => (
              <ellipse
                key={`lon-${i}`}
                cx="100"
                cy="100"
                rx="90"
                ry={90 - i * 12}
                fill="none"
                stroke="#2af598"
                strokeWidth="0.4"
              />
            ))}
          </svg>
          <svg viewBox="0 0 200 200" className="absolute inset-0 h-full w-full">
            <path
              d="M30,60 Q100,20 170,80 Q120,140 60,150 Q10,110 30,60 Z"
              fill="#12352a"
              opacity="0.6"
            />
          </svg>
        </div>

        {/* connecting arcs */}
        <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full overflow-visible">
          {REGIONS.map((r) => (
            <line
              key={r.label}
              x1="50"
              y1="50"
              x2={parseFloat(r.left)}
              y2={parseFloat(r.top)}
              stroke="#2af598"
              strokeWidth="0.3"
              strokeDasharray="1.5 1.5"
              opacity="0.5"
            />
          ))}
        </svg>

        {/* region markers */}
        {REGIONS.map((r) => (
          <div
            key={r.label}
            className="absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-md border border-white/10 bg-wo-black/80 px-2.5 py-1.5 text-[11px] shadow-card backdrop-blur"
            style={{ top: r.top, left: r.left }}
          >
            <span className="mr-1.5 inline-block h-1.5 w-1.5 animate-pulse-dot rounded-full bg-wo-green align-middle" />
            <span className="font-semibold text-white">{r.label}</span>{' '}
            <span className="text-wo-muted">{r.ms}</span>
          </div>
        ))}
      </div>

      {/* side panel */}
      <div className="space-y-6 lg:w-[200px] lg:pt-2">
        <div>
          <p className="text-[10px] font-semibold tracking-[0.2em] text-white/50">
            A MORE
            <br />
            CONNECTED
            <br />
            TOMORROW
          </p>
          <p className="mt-3 text-[13px] leading-relaxed text-wo-muted">
            Global infrastructure. Infinite possibilities. Built for builders.
          </p>
        </div>

        <div className="overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br from-[#1a1030] to-[#06110d]">
          <div className="flex items-center justify-between px-3 pt-2">
            <span className="text-[11px] font-medium text-white/80">
              Deploy
              <br />
              Without Limits
            </span>
            <button
              type="button"
              aria-label="Dismiss"
              className="text-white/40 hover:text-white/80"
            >
              ×
            </button>
          </div>
          <div className="flex h-14 items-center justify-center">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white">
              ▶
            </span>
          </div>
        </div>

        <div>
          <p className="mb-2 text-[10px] font-semibold tracking-[0.2em] text-white/50">
            LIVE INFRASTRUCTURE STATUS
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
