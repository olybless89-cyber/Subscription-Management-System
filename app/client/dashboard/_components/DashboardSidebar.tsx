import { LayoutDashboard, CreditCard, DollarSign, Globe, FileText, ShieldCheck, Boxes } from 'lucide-react';

export const NAV_ITEMS = [
  { id: 'overview', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'subscriptions', label: 'Subscriptions', icon: CreditCard },
  { id: 'billing', label: 'Billing', icon: DollarSign },
  { id: 'domains', label: 'Domains', icon: Globe },
  { id: 'invoices', label: 'Invoices', icon: FileText },
];

/** Left navigation — anchors into the single dashboard page (this
 * portal doesn't have separate routes per section yet), styled to the
 * reference: an active rounded green/teal pill, inactive items in the
 * soft text color with a cyan hover. Collapses to an off-canvas drawer
 * on narrow viewports via the .w3-sidebar/.open CSS in globals.css. */
export function DashboardSidebar({
  activeSection,
  onNavigate,
  open,
}: {
  activeSection: string;
  onNavigate: (id: string) => void;
  open: boolean;
}) {
  return (
    <nav
      className={`w3-sidebar${open ? ' open' : ''}`}
      aria-label="Dashboard sections"
      style={{
        width: 264,
        flexShrink: 0,
        borderRight: '1px solid rgba(255,255,255,0.08)',
        background: 'rgba(3, 15, 27, 0.65)',
        padding: '1.4em 1em',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        minHeight: 'calc(100vh - 76px)',
      }}
    >
      <ul style={{ display: 'flex', flexDirection: 'column', gap: '0.35em', listStyle: 'none', margin: 0, padding: 0 }}>
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = activeSection === item.id;
          return (
            <li key={item.id}>
              <a
                href={`#${item.id}`}
                className={`w3-sidebar-link${active ? ' active' : ''}`}
                aria-current={active ? 'page' : undefined}
                onClick={(e) => {
                  e.preventDefault();
                  onNavigate(item.id);
                }}
              >
                <Icon size={18} strokeWidth={2} aria-hidden="true" />
                {item.label}
              </a>
            </li>
          );
        })}
      </ul>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9em' }}>
        <div
          aria-hidden="true"
          style={{
            display: 'flex',
            gap: '0.5em',
            padding: '0 0.4em',
            opacity: 0.35,
          }}
        >
          <Boxes size={30} style={{ color: 'var(--w3-cyan)' }} />
        </div>
        <div style={{ padding: '0.8em', display: 'flex', alignItems: 'center', gap: '0.7em', color: 'var(--w3-text-soft)' }}>
          <ShieldCheck size={20} style={{ flexShrink: 0 }} aria-hidden="true" />
          <div>
            <div style={{ fontSize: '0.8em', fontWeight: 600, color: 'var(--w3-text)' }}>DWO Hosting</div>
            <div style={{ fontSize: '0.72em' }}>Secure · Managed · Yours</div>
          </div>
        </div>
      </div>
    </nav>
  );
}
