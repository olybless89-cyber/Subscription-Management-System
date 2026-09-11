import { EngineDeps } from '../db/ports';
import { InvoiceRecord } from '@/types/domain';
import { generateInvoicePdf } from './pdf';
import { buildRenewalUrl } from '../customers/renewal-link';

export interface CreateInvoiceInput {
  customerId: string;
  subscriptionId: string | null;
  amount: number;
  currency: string;
  description: string;
}

/**
 * createAndSendReceiptInvoice — called right after a payment is
 * verified and recorded (webhook-handler.ts). Creates a PAID Invoice
 * row (paidAt = now) and emails it as a PDF attachment.
 *
 * Deliberately best-effort at the call site, not here: this function
 * itself can throw (e.g. a DB error creating the Invoice row), and the
 * CALLER is responsible for wrapping it in try/catch — same pattern as
 * the notification-failure-can't-crash-the-webhook principle already
 * established. An invoice failing to generate must never undo a
 * successful payment.
 */
export async function createAndSendReceiptInvoice(
  deps: EngineDeps,
  input: CreateInvoiceInput
): Promise<InvoiceRecord> {
  const now = new Date().toISOString();
  const invoice = await deps.invoices.create({
    customerId: input.customerId,
    subscriptionId: input.subscriptionId,
    type: 'RECEIPT',
    status: 'PAID',
    amount: input.amount,
    currency: input.currency,
    description: input.description,
    dueDate: null,
    paidAt: now,
  });

  await sendInvoiceEmail(deps, invoice);
  return invoice;
}

/**
 * createAndSendDueInvoice — called when a subscription moves to
 * PAYMENT_DUE (subscription-checker.ts cron). Creates a PENDING Invoice
 * row and emails it showing the amount owed and the due date. Same
 * caller-wraps-in-try/catch contract as the receipt path.
 */
export async function createAndSendDueInvoice(
  deps: EngineDeps,
  input: CreateInvoiceInput & { dueDate: string }
): Promise<InvoiceRecord> {
  const invoice = await deps.invoices.create({
    customerId: input.customerId,
    subscriptionId: input.subscriptionId,
    type: 'DUE',
    status: 'PENDING',
    amount: input.amount,
    currency: input.currency,
    description: input.description,
    dueDate: input.dueDate,
    paidAt: null,
  });

  await sendInvoiceEmail(deps, invoice);
  return invoice;
}

async function sendInvoiceEmail(deps: EngineDeps, invoice: InvoiceRecord): Promise<void> {
  const customer = await deps.customers.findById(invoice.customerId);
  if (!customer) return; // FK integrity issue elsewhere — nothing to email.

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

  const majorAmount = (invoice.amount / 100).toLocaleString();
  const subject =
    invoice.type === 'RECEIPT'
      ? `Receipt ${invoice.invoiceNumber} — Web Oracle Host`
      : `Invoice ${invoice.invoiceNumber} due — Web Oracle Host`;
  const message =
    invoice.type === 'RECEIPT'
      ? `Thank you — we've received your payment of ${invoice.currency} ${majorAmount}. Your receipt is attached.`
      : `An invoice for ${invoice.currency} ${majorAmount} is now due${invoice.dueDate ? ` by ${new Date(invoice.dueDate).toLocaleDateString()}` : ''}. Renew here: ${buildRenewalUrl(customer.customerCode)}`;

  await deps.notifications.send(
    invoice.customerId,
    invoice.type === 'RECEIPT' ? 'INVOICE_RECEIPT' : 'INVOICE_DUE',
    message,
    subject,
    [{ filename: `${invoice.invoiceNumber}.pdf`, content: pdf.toString('base64') }]
  );
}
