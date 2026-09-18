import { authFetch } from '../../../_lib/api';
import { DashboardData } from './types';

/**
 * fetchDashboardData — the one read this whole dashboard is built on.
 * Backed by GET /api/customer/dashboard (src/lib/customers/portal.ts),
 * which already returns every window of the uptime summary (24h/7d/30d)
 * and the derived activity feed/chart in a single call — so switching
 * the uptime period tab or re-rendering the activity card never needs
 * a second round-trip. Reuses the app's existing authFetch/ApiError
 * helper (app/_lib/api.ts) rather than introducing a parallel fetch
 * wrapper.
 */
export async function fetchDashboardData(token: string): Promise<DashboardData> {
  return authFetch<DashboardData>(token, '/api/customer/dashboard');
}

/**
 * fetchInvoicePdf — opens an invoice's PDF in a new tab. Reuses the
 * existing admin invoice-PDF endpoint (a customer may only ever fetch
 * an invoice tied to their own session — enforced server-side), rather
 * than duplicating PDF generation for the customer portal.
 */
export async function fetchInvoicePdf(token: string, invoiceId: string): Promise<Blob> {
  const res = await fetch(`/api/admin/invoices/${invoiceId}/pdf`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Failed to load invoice');
  return res.blob();
}
