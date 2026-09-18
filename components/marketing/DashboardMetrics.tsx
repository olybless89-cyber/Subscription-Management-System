import { Gauge, Boxes, Rocket, ArrowUpRight, Timer } from 'lucide-react';

const METRICS = [
  {
    label: 'UPTIME',
    value: '99.98%',
    delta: '+0.01%',
    up: true,
    icon: Gauge,
    ring: 'text-wo-green',
  },
  {
    label: 'ACTIVE SERVICES',
    value: '08',
    delta: '-2 this month',
    up: false,
    icon: Boxes,
    ring: 'text-sky-400',
  },
  {
    label: 'DEPLOYMENTS',
    value: '142',
    delta: '+12%',
    up: true,
    icon: Rocket,
    ring: 'text-violet-400',
  },
  {
    label: 'TRAFFIC',
    value: '1.82 TB',
    delta: '+18%',
    up: true,
    icon: ArrowUpRight,
    ring: 'text-emerald-400',
  },
  {
    label: 'AVG. LATENCY',
    value: '38 ms',
    delta: '-12%',
    up: true,
    icon: Timer,
    ring: 'text-fuchsia-400',
  },
];

export default function DashboardMetrics() {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
      {METRICS.map(({ label, value, delta, up, icon: Icon, ring }) => (
        <div
          key={label}
          className="rounded-xl border border-white/5 bg-[#0a1512] p-4 shadow-card"
        >
          <div className={`mb-3 flex h-8 w-8 items-center justify-center rounded-full bg-white/5 ${ring}`}>
            <Icon size={15} />
          </div>
          <p className="text-[10px] font-semibold tracking-wide text-white/40">{label}</p>
          <p className="mt-1 text-[20px] font-bold text-white">{value}</p>
          <p className={`mt-1 text-[11px] font-medium ${up ? 'text-wo-green' : 'text-orange-400'}`}>
            {up ? '↑' : '↓'} {delta}
          </p>
        </div>
      ))}
    </div>
  );
}
