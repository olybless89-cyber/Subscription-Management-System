import { ShieldCheck, Server, ChevronRight } from 'lucide-react';
import { PortalResource } from './types';
import { StatusBadge } from './StatusBadge';

const STATUS_LABEL: Record<PortalResource['status'], string> = {
  ACTIVE: 'Healthy',
  STOPPED: 'Down',
  UNKNOWN: 'Unknown',
  ERROR: 'Error',
};

const STATUS_TONE: Record<PortalResource['status'], 'good' | 'bad' | 'warn'> = {
  ACTIVE: 'good',
  STOPPED: 'bad',
  UNKNOWN: 'warn',
  ERROR: 'bad',
};

/**
 * ServerHealthCard — every hosting resource actually on the account,
 * each with its live status. Deliberately does not force a fixed
 * "Web / Database / API / Cache / Storage" five-row layout the way a
 * generic template would: this codebase tracks real Railway resources
 * per subscription, not an internal service breakdown, so a customer
 * with one hosted site sees one honest row rather than four invented
 * ones.
 */
export function ServerHealthCard({ resources, onSelect }: { resources: PortalResource[]; onSelect: (resource: PortalResource) => void }) {
  const anyDown = resources.some((r) => r.status === 'STOPPED' || r.status === 'ERROR');

  return (
    <div className="w3-panel">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1em' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6em' }}>
          <ShieldCheck size={17} style={{ color: 'var(--w3-cyan)' }} aria-hidden="true" />
          <span style={{ fontWeight: 700, fontSize: '1.05em' }}>Server Health</span>
        </div>
        {resources.length > 0 && <StatusBadge label={anyDown ? 'Needs attention' : 'All Healthy'} tone={anyDown ? 'bad' : 'good'} pulse />}
      </div>

      {resources.length === 0 ? (
        <p style={{ color: 'var(--w3-text-soft)', fontSize: '0.9em', margin: 0 }}>
          No infrastructure has been mapped to your account yet — our team is setting this up.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }} role="list">
          {resources.map((r) => (
            <button
              key={r.id}
              role="listitem"
              onClick={() => onSelect(r)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '0.8em',
                padding: '0.7em 0.3em',
                borderBottom: '1px solid rgba(255,255,255,0.06)',
                background: 'transparent',
                border: 'none',
                borderBottomWidth: 1,
                borderBottomStyle: 'solid',
                borderBottomColor: 'rgba(255,255,255,0.06)',
                width: '100%',
                textAlign: 'left',
                cursor: 'pointer',
                color: 'var(--w3-text)',
              }}
              className="w3-server-row"
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.8em', minWidth: 0 }}>
                <Server size={16} style={{ color: 'var(--w3-text-soft)', flexShrink: 0 }} aria-hidden="true" />
                <span style={{ fontSize: '0.92em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.label}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5em', flexShrink: 0 }}>
                <StatusBadge label={STATUS_LABEL[r.status]} tone={STATUS_TONE[r.status]} />
                <ChevronRight size={15} style={{ color: 'var(--w3-text-soft)' }} aria-hidden="true" />
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
