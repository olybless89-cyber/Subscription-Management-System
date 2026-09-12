import {
  LayoutDashboard,
  AppWindow,
  Rocket,
  Globe2,
  Database,
  Network,
  Activity,
  CreditCard,
  LifeBuoy,
  Settings,
  Sparkles,
} from 'lucide-react';

const NAV = [
  { label: 'Overview', icon: LayoutDashboard, active: true },
  { label: 'Applications', icon: AppWindow },
  { label: 'Deployments', icon: Rocket },
  { label: 'Domains', icon: Globe2 },
  { label: 'Databases', icon: Database },
  { label: 'Network', icon: Network },
  { label: 'Monitoring', icon: Activity },
  { label: 'Billing', icon: CreditCard },
  { label: 'Support', icon: LifeBuoy },
  { label: 'Settings', icon: Settings },
];

export default function DashboardSidebar() {
  return (
    <aside className="hidden w-[220px] shrink-0 flex-col border-r border-white/5 bg-[#050b09] px-4 py-6 lg:flex">
      <div className="mb-8 flex items-center gap-2 px-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br from-wo-green to-wo-greenDark text-[13px] font-black text-wo-black">
          W
        </span>
        <span className="text-[13px] font-bold text-white">Web Oracle Host</span>
      </div>

      <nav className="flex flex-1 flex-col gap-1">
        {NAV.map(({ label, icon: Icon, active }) => (
          <a
            key={label}
            href="#"
            className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium transition ${
              active
                ? 'bg-wo-green/10 text-wo-green'
                : 'text-white/50 hover:bg-white/5 hover:text-white'
            }`}
          >
            <Icon size={16} strokeWidth={2} />
            {label}
          </a>
        ))}
      </nav>

      <div className="mt-6 rounded-xl border border-wo-green/20 bg-gradient-to-br from-wo-green/10 to-transparent p-4">
        <Sparkles size={16} className="mb-2 text-wo-green" />
        <p className="text-[12px] font-semibold text-white">Upgrade to Pro</p>
        <p className="mt-1 text-[11px] leading-snug text-wo-muted">
          Unlock more power for your growing ideas.
        </p>
        <button
          type="button"
          className="mt-3 w-full rounded-md bg-white/10 py-1.5 text-[11px] font-semibold text-white transition hover:bg-white/15"
        >
          Upgrade Now
        </button>
      </div>
    </aside>
  );
}
