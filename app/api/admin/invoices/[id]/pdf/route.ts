// GET /api/admin/invoices/:id/pdf
// Regenerates the PDF on demand from the stored Invoice row (same
// generator used when the invoice was first emailed) rather than
// storing the PDF binary anywhere — see src/lib/invoices/pdf.ts for why.
// Scoped via canAccessCustomer, same as every other customer-linked
// resource.

import { buildWebhookDeps } from '../../../../../../src/lib/deps-factory';
import { authenticateFromHeader, hasAdminRole, canAccessCustomer } from '../../../../../../src/lib/auth/authorize';
import { generateInvoicePdf } from '../../../../../../src/lib/invoices/pdf';

export async function GET(
  request: Request,
  context: { params: { id: string } }
): Promise<Response> {
  const auth = authenticateFromHeader(request.headers.get('authorization'));
  if (!auth.authenticated || !hasAdminRole(auth.session, ['ADMIN', 'SUPER_ADMIN'])) {
    return new Response(JSON.stringify({ error: 'Admin access required' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const deps = buildWebhookDeps();
  const invoice = await deps.invoices.findById(context.params.id);
  if (!invoice) {
    return new Response(JSON.stringify({ error: 'Invoice not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  if (!(await canAccessCustomer(auth.session, invoice.customerId, deps.adminAssignments))) {
    return new Response(JSON.stringify({ error: 'This invoice is not for a customer assigned to you' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const customer = await deps.customers.findById(invoice.customerId);
  if (!customer) {
    return new Response(JSON.stringify({ error: 'Customer not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const pdf = await generateInvoicePdf({
    invoiceNumber: invoice.invoiceNumber,
    type: invoice.type,
    customerName: customer.name,
    customerEmail: customer.notificationEmail ?? customer.email,
    description: invoice.description,
    amount: invoice.amount,
    currency: invoice.currency,
    issuedAt: invoice.issuedAt,
    dueDate: invoice.dueDate,
    paidAt: invoice.paidAt,
  });

  return new Response(new Uint8Array(pdf), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${invoice.invoiceNumber}.pdf"`,
    },
  });
}
