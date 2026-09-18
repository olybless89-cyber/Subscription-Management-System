import { Activity } from 'lucide-react';
import { DashboardData, UptimeWindow } from './types';
import { PeriodSelector } from './PeriodSelector';
import { BigUptimeDonut } from './UptimeGauge';

export function SystemUptimeCard({
  uptimeSummary,
  hasResources,
  window: uptimeWindow,
  onWindowChange,
}: {
  uptimeSummary: DashboardData['uptimeSummary'];
  hasResources: boolean;
  window: UptimeWindow;
  onWindowChange: (w: UptimeWindow) => void;
}) {
  return (
    <div className="w3-panel">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.2em', flexWrap: 'wrap', gap: '0.6em' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6em' }}>
          <Activity size={17} style={{ color: 'var(--w3-cyan)' }} aria-hidden="true" />
          <span style={{ fontWeight: 700, fontSize: '1.05em' }}>System Uptime</span>
        </div>
        <PeriodSelector value={uptimeWindow} onChange={onWindowChange} />
      </div>
      {!hasResources ? (
        <p style={{ color: 'var(--w3-text-soft)', fontSize: '0.9em', margin: 0 }}>No infrastructure to monitor yet.</p>
      ) : (
        <BigUptimeDonut uptime={uptimeSummary[uptimeWindow]} />
      )}
    </div>
  );
}
