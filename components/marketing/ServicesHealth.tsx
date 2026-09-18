const SERVICES = ['Web Service', 'Database', 'Redis Cache', 'Background Workers'];

export default function ServicesHealth() {
  return (
    <div className="rounded-xl border border-white/5 bg-[#0a1512] p-5 shadow-card">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[14px] font-semibold text-white">Services Health</h3>
        <a href="#" className="text-[11px] font-medium text-wo-green hover:underline">
          View all →
        </a>
      </div>
      <ul className="space-y-3">
        {SERVICES.map((name) => (
          <li key={name} className="flex items-center justify-between text-[12.5px]">
            <span className="text-white/80">{name}</span>
            <span className="flex items-center gap-1.5 font-medium text-wo-green">
              <span className="h-1.5 w-1.5 rounded-full bg-wo-green" /> Healthy
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
