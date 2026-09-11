import PDFDocument from 'pdfkit';
import fs from 'node:fs';
import path from 'node:path';

export interface InvoicePdfInput {
  invoiceNumber: string;
  type: 'RECEIPT' | 'DUE';
  customerName: string;
  customerEmail: string;
  description: string;
  amount: number; // minor units
  currency: string;
  issuedAt: string;
  dueDate: string | null;
  paidAt: string | null;
}

function formatMoney(minorUnits: number, currency: string): string {
  return `${currency} ${(minorUnits / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * generateInvoicePdf — pure server-side PDF generation (pdfkit, no
 * headless browser, no external service). Both the invoice email and
 * the download route regenerate the PDF on demand from the stored
 * Invoice row rather than storing the PDF binary itself — everything
 * needed to reproduce it deterministically is already in the database,
 * so there's no blob storage needed for something this cheap to
 * rebuild.
 */
export function generateInvoicePdf(input: InvoicePdfInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const ink = '#14231c';
      const inkSoft = '#4b5b52';
      const forest = '#16352a';
      const clay = '#c1602b';

      const logoPath = path.join(process.cwd(), 'public', 'dwo-logo.jpg');
      try {
        if (fs.existsSync(logoPath)) {
          doc.image(logoPath, 50, 45, { width: 110 });
        } else {
          doc.fillColor(forest).fontSize(16).font('Helvetica-Bold').text('WEB ORACLE HOST', 50, 50);
        }
      } catch {
        doc.fillColor(forest).fontSize(16).font('Helvetica-Bold').text('WEB ORACLE HOST', 50, 50);
      }

      doc
        .fillColor(input.type === 'DUE' ? clay : forest)
        .font('Helvetica-Bold')
        .fontSize(22)
        .text(input.type === 'DUE' ? 'PAYMENT DUE' : 'RECEIPT', 300, 50, { width: 245, align: 'right' });
      doc
        .fillColor(inkSoft)
        .font('Helvetica')
        .fontSize(10)
        .text(`Invoice #: ${input.invoiceNumber}`, 300, 80, { width: 245, align: 'right' })
        .text(`Issued: ${formatDate(input.issuedAt)}`, 300, 95, { width: 245, align: 'right' });

      doc.moveTo(50, 140).lineTo(545, 140).strokeColor('#d8d3c4').stroke();

      doc.fillColor(inkSoft).fontSize(10).font('Helvetica-Bold').text('BILLED TO', 50, 160);
      doc.fillColor(ink).fontSize(12).font('Helvetica').text(input.customerName, 50, 176);
      doc.fillColor(inkSoft).fontSize(10).text(input.customerEmail, 50, 194);

      if (input.type === 'DUE' && input.dueDate) {
        doc.fillColor(inkSoft).fontSize(10).font('Helvetica-Bold').text('DUE DATE', 380, 160, { width: 165, align: 'right' });
        doc.fillColor(clay).fontSize(12).font('Helvetica-Bold').text(formatDate(input.dueDate), 380, 176, { width: 165, align: 'right' });
      }
      if (input.type === 'RECEIPT' && input.paidAt) {
        doc.fillColor(inkSoft).fontSize(10).font('Helvetica-Bold').text('PAID', 380, 160, { width: 165, align: 'right' });
        doc.fillColor(forest).fontSize(12).font('Helvetica-Bold').text(formatDate(input.paidAt), 380, 176, { width: 165, align: 'right' });
      }

      const tableTop = 240;
      doc.fillColor(inkSoft).fontSize(10).font('Helvetica-Bold');
      doc.text('DESCRIPTION', 50, tableTop);
      doc.text('AMOUNT', 380, tableTop, { width: 165, align: 'right' });
      doc.moveTo(50, tableTop + 18).lineTo(545, tableTop + 18).strokeColor('#d8d3c4').stroke();

      doc.fillColor(ink).fontSize(11).font('Helvetica');
      doc.text(input.description, 50, tableTop + 30, { width: 320 });
      doc.text(formatMoney(input.amount, input.currency), 380, tableTop + 30, { width: 165, align: 'right' });

      doc.moveTo(50, tableTop + 70).lineTo(545, tableTop + 70).strokeColor('#d8d3c4').stroke();

      doc.fillColor(ink).fontSize(13).font('Helvetica-Bold');
      doc.text(input.type === 'DUE' ? 'TOTAL DUE' : 'TOTAL PAID', 50, tableTop + 85);
      doc.text(formatMoney(input.amount, input.currency), 380, tableTop + 85, { width: 165, align: 'right' });

      doc
        .fillColor(inkSoft)
        .fontSize(9)
        .font('Helvetica')
        .text('Web Oracle Host — Digital Web Oracle ICT (DWO), Abuja, Nigeria.', 50, 740, { align: 'center', width: 495 });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
