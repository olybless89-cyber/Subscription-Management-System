import { Search, Bell, ChevronDown } from 'lucide-react';

export default function DashboardTopbar() {
  return (
    <div className="flex items-center justify-between border-b border-white/5 px-6 py-4">
      <div className="relative w-full max-w-[360px]">
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
        <input
          type="text"
          readOnly
          value=""
          placeholder="Search for apps, domains, deployments..."
          className="w-full rounded-lg border border-white/10 bg-[#050b09] py-2 pl-9 pr-3 text-[12.5px] text-white placeholder:text-white/30 focus:outline-none"
        />
      </div>

      <div className="flex items-center gap-4">
        <button type="button" aria-label="Notifications" className="relative text-white/60 hover:text-white">
          <Bell size={18} />
          <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-wo-green" />
        </button>
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-wo-green to-wo-greenDark text-[12px] font-bold text-wo-black">
            J
          </span>
          <span className="hidden text-[12.5px] font-medium text-white sm:inline">Good evening, Jeffrey</span>
          <ChevronDown size={14} className="text-white/40" />
        </div>
      </div>
    </div>
  );
}
