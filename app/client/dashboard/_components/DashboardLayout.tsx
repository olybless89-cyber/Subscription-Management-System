'use client';

import { ReactNode, useState } from 'react';
import { ActivityEvent } from './types';
import { DashboardHeader } from './DashboardHeader';
import { DashboardSidebar } from './DashboardSidebar';

/**
 * DashboardLayout — the sidebar + top-bar shell shared by the whole
 * dashboard page. Owns the mobile drawer (open/closed) and which
 * section is "active" in the sidebar, since both the header's menu
 * button and the sidebar's links need to agree on that state.
 */
export function DashboardLayout({
  customerName,
  customerCode,
  systemsOk,
  alerts,
  onLogout,
  children,
}: {
  customerName: string;
  customerCode: string;
  systemsOk: boolean;
  alerts: ActivityEvent[];
  onLogout: () => void;
  children: (helpers: { activeSection: string; goToSection: (id: string) => void }) => ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeSection, setActiveSection] = useState('overview');

  function goToSection(id: string) {
    setActiveSection(id);
    setSidebarOpen(false);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <main className="w3-shell">
      <div className={`w3-sidebar-backdrop${sidebarOpen ? ' open' : ''}`} onClick={() => setSidebarOpen(false)} />

      <DashboardHeader
        customerName={customerName}
        customerCode={customerCode}
        systemsOk={systemsOk}
        alerts={alerts}
        onLogout={onLogout}
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen((v) => !v)}
      />

      <div style={{ display: 'flex', alignItems: 'stretch' }}>
        <DashboardSidebar activeSection={activeSection} onNavigate={goToSection} open={sidebarOpen} />
        <div style={{ flex: 1, minWidth: 0, padding: '1.8em 1.6em 3em' }}>{children({ activeSection, goToSection })}</div>
      </div>
    </main>
  );
}
