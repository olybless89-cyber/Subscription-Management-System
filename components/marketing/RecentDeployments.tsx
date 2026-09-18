import { CheckCircle2, Loader2 } from 'lucide-react';

const DEPLOYMENTS = [
  { name: 'web-oracle.app', status: 'Deployment successful', time: '2m ago', building: false },
  { name: 'api-service', status: 'Build completed', time: '12m ago', building: false },
  { name: 'worker-service', status: 'Deployment in progress', time: '28m ago', building: true },
  { name: 'landing-page', status: 'Deployment successful', time: '1h ago', building: false },
  { name: 'database-migrations', status: 'Completed', time: '3h ago', building: false },
];

export default function RecentDeployments() {
  return (
    <div className="rounded-xl border border-white/5 bg-[#0a1512] p-5 shadow-card">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[14px] font-semibold text-white">Recent Deployments</h3>
        <a href="#" className="text-[11px] font-medium text-wo-green hover:underline">
          View all →
        </a>
      </div>
      <ul className="space-y-3.5">
        {DEPLOYMENTS.map((d) => (
          <li key={d.name} className="flex items-start gap-3">
            {d.building ? (
              <Loader2 size={16} className="mt-0.5 shrink-0 animate-spin text-violet-400" />
            ) : (
              <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-wo-green" />
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12.5px] font-medium text-white">{d.name}</p>
              <p className={`text-[11px] ${d.building ? 'text-violet-400' : 'text-wo-green'}`}>
                {d.status}
              </p>
            </div>
            <span className="shrink-0 text-[11px] text-wo-muted">{d.time}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
