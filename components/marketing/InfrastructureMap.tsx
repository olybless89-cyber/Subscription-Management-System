import { Globe2, Layers, Database, Boxes, HardDrive, Activity, Cloud } from 'lucide-react';

const LEFT_NODES = [
  { label: 'CDN', sub: 'Global Edge', icon: Globe2, top: '18%' },
  { label: 'US-EAST', sub: 'Primary Region', icon: Layers, top: '50%' },
  { label: 'DATABASE', sub: 'PostgreSQL', icon: Database, top: '82%' },
];

const RIGHT_NODES = [
  { label: 'API', sub: '2 Services', icon: Boxes, top: '18%' },
  { label: 'STORAGE', sub: 'Encrypted', icon: HardDrive, top: '50%' },
  { label: 'MONITORING', sub: 'Active', icon: Activity, top: '82%' },
];

export default function InfrastructureMap() {
  return (
    <div className="rounded-xl border border-white/5 bg-[#0a1512] p-5 shadow-card">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-[14px] font-semibold text-white">Infrastructure Map</h3>
          <p className="text-[11px] text-wo-muted">Visualize your cloud infrastructure in real-time</p>
        </div>
        <span className="flex items-center gap-1.5 rounded-full bg-wo-green/10 px-2.5 py-1 text-[10px] font-semibold text-wo-green">
          <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-wo-green" /> LIVE
        </span>
      </div>

      <div className="relative h-[280px] rounded-lg border border-white/5 bg-[#050b09] px-6 py-4">
        <svg className="pointer-events-none absolute inset-0 h-full w-full" preserveAspectRatio="none">
          {[18, 50, 82].map((top) => (
            <g key={`l-${top}`}>
              <line
                x1="18%"
                y1={`${top}%`}
                x2="50%"
                y2="50%"
                stroke="#2af598"
                strokeWidth="1"
                strokeOpacity="0.25"
              />
              <line
                x1="82%"
                y1={`${top}%`}
                x2="50%"
                y2="50%"
                stroke="#2af598"
                strokeWidth="1"
                strokeOpacity="0.25"
              />
            </g>
          ))}
        </svg>

        {LEFT_NODES.map(({ label, sub, icon: Icon, top }) => (
          <div
            key={label}
            className="absolute left-[4%] flex -translate-y-1/2 items-center gap-2"
            style={{ top }}
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-md border border-white/10 bg-[#0a1512] text-wo-green">
              <Icon size={14} />
            </span>
            <span>
              <span className="block text-[11px] font-semibold text-white">{label}</span>
              <span className="block text-[10px] text-wo-muted">{sub}</span>
            </span>
          </div>
        ))}

        {RIGHT_NODES.map(({ label, sub, icon: Icon, top }) => (
          <div
            key={label}
            className="absolute right-[4%] flex -translate-y-1/2 items-center gap-2 text-right"
            style={{ top }}
          >
            <span>
              <span className="block text-[11px] font-semibold text-white">{label}</span>
              <span className="block text-[10px] text-wo-muted">{sub}</span>
            </span>
            <span className="flex h-8 w-8 items-center justify-center rounded-md border border-white/10 bg-[#0a1512] text-wo-green">
              <Icon size={14} />
            </span>
          </div>
        ))}

        <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-wo-green/40 bg-wo-green/10 text-wo-green shadow-glow">
            <Cloud size={26} strokeWidth={1.5} />
          </div>
          <span className="mt-2 text-[11px] font-semibold text-white">YOUR APPLICATION</span>
          <span className="text-[10px] text-wo-muted">web-oracle.app</span>
        </div>
      </div>
    </div>
  );
}
