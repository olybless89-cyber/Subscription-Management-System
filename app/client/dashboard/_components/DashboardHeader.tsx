'use client';

import { useState } from 'react';
import { Bell, ChevronDown, LogOut, Menu, X } from 'lucide-react';
import { ActivityEvent, formatTime, initials } from './types';

export function DashboardHeader({
  customerName,
  customerCode,
  systemsOk,
  alerts,
  onLogout,
  sidebarOpen,
  onToggleSidebar,
}: {
  customerName: string;
  customerCode: string;
  systemsOk: boolean;
  alerts: ActivityEvent[];
  onLogout: () => void;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
}) {
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const firstName = customerName.trim().split(/\s+/)[0] ?? customerName;

  return (
    <header
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 30,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        height: 76,
        padding: '0 1.4em',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        background: 'rgba(2, 11, 24, 0.85)',
        backdropFilter: 'blur(10px)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.9em' }}>
        <button className="w3-sidebar-toggle" onClick={onToggleSidebar} aria-label={sidebarOpen ? 'Close navigation' : 'Open navigation'} aria-expanded={sidebarOpen}>
          {sidebarOpen ? <X size={18} /> : <Menu size={18} />}
        </button>
        <img src="/dwo-logo.jpg" alt="Digital WebOracle" style={{ height: 32, width: 'auto', borderRadius: 7 }} />
        <div>
          <div style={{ fontWeight: 700, lineHeight: 1.15, fontSize: '1.02em' }}>{customerName}</div>
          <div className="w3-mono" style={{ fontSize: '0.72em', color: 'var(--w3-text-soft)' }}>{customerCode}</div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.9em' }}>
        <span
          className="w3-badge"
          style={{
            color: systemsOk ? 'var(--w3-cyan)' : 'var(--w3-danger)',
            borderColor: systemsOk ? 'rgba(0, 229, 160, 0.32)' : 'rgba(255, 77, 109, 0.35)',
          }}
        >
          <span className="w3-pulse-dot" style={{ background: systemsOk ? 'var(--w3-cyan)' : 'var(--w3-danger)' }} aria-hidden="true" />
          {systemsOk ? 'System Online' : 'Action needed'}
        </span>

        <div style={{ position: 'relative' }}>
          <button
            className="w3-btn"
            style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', padding: '0.6em', borderRadius: 10, position: 'relative' }}
            aria-label={alerts.length > 0 ? `Notifications (${alerts.length} needing attention)` : 'Notifications'}
            aria-expanded={alertsOpen}
            onClick={() => {
              setAlertsOpen((v) => !v);
              setAccountMenuOpen(false);
            }}
          >
            <Bell size={17} aria-hidden="true" />
            {alerts.length > 0 && (
              <span
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  top: 4,
                  right: 4,
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: 'var(--w3-danger)',
                  boxShadow: '0 0 0 2px rgba(2, 11, 24, 0.85)',
                }}
              />
            )}
          </button>

          {alertsOpen && (
            <div
              role="menu"
              style={{
                position: 'absolute',
                right: 0,
                top: '120%',
                background: '#061423',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 12,
                padding: '0.5em',
                width: 260,
                boxShadow: '0 16px 36px rgba(0,0,0,0.4)',
                zIndex: 40,
              }}
            >
              <div style={{ fontSize: '0.75em', color: 'var(--w3-text-soft)', padding: '0.3em 0.5em', fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                Notifications
              </div>
              {alerts.length === 0 ? (
                <div style={{ padding: '0.6em 0.5em', fontSize: '0.85em', color: 'var(--w3-text-soft)' }}>Nothing needs your attention.</div>
              ) : (
                alerts.slice(0, 5).map((a, idx) => (
                  <div key={idx} style={{ padding: '0.5em', fontSize: '0.85em', borderTop: idx > 0 ? '1px solid rgba(255,255,255,0.06)' : undefined }}>
                    <div style={{ color: 'var(--w3-text)' }}>{a.resourceLabel}</div>
                    <div style={{ color: 'var(--w3-text-soft)', fontSize: '0.85em' }}>{formatTime(a.checkedAt)} · {a.status}</div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        <div style={{ position: 'relative' }}>
          <button
            onClick={() => {
              setAccountMenuOpen((v) => !v);
              setAlertsOpen(false);
            }}
            aria-haspopup="menu"
            aria-expanded={accountMenuOpen}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.6em',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--w3-text)',
              padding: '0.2em 0.3em',
            }}
          >
            <span
              style={{
                width: 34,
                height: 34,
                borderRadius: '50%',
                background: 'linear-gradient(135deg, var(--w3-cyan), var(--w3-violet))',
                color: '#03111f',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                fontSize: '0.82em',
                flexShrink: 0,
              }}
              aria-hidden="true"
            >
              {initials(customerName)}
            </span>
            <span className="w3-welcome-text" style={{ fontSize: '0.88em', textAlign: 'left', lineHeight: 1.2 }}>
              Welcome back,<br /><strong>{firstName}</strong>
            </span>
            <ChevronDown size={15} style={{ color: 'var(--w3-text-soft)' }} aria-hidden="true" />
          </button>

          {accountMenuOpen && (
            <div
              role="menu"
              style={{
                position: 'absolute',
                right: 0,
                top: '120%',
                background: '#061423',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 10,
                padding: '0.4em',
                minWidth: 160,
                boxShadow: '0 12px 30px rgba(0,0,0,0.4)',
                zIndex: 40,
              }}
            >
              <button
                role="menuitem"
                onClick={onLogout}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.6em',
                  width: '100%',
                  padding: '0.6em 0.7em',
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--w3-text)',
                  cursor: 'pointer',
                  borderRadius: 6,
                  fontSize: '0.88em',
                }}
              >
                <LogOut size={15} aria-hidden="true" /> Log out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
