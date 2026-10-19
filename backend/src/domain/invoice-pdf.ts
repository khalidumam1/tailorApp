import PDFDocument from 'pdfkit';
import type { Invoice } from './invoice.js';

/**
 * Order invoice PDF (Phase 2 task 2.2, F-007), styled to match the existing
 * payment-receipt PDFs. Amounts come from buildInvoice so the PDF can never
 * disagree with the invoice arithmetic tests.
 *
 * When the caller lacks payments access (see order.routes), `payments` is
 * null and the payment-history/balance section is replaced with an explicit
 * note — the invoice then shows items and the order total only, rather than
 * implying nothing has been paid.
 */
export type InvoicePdfInput = Invoice & {
  businessName: string;
  currency: string;
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  issuedAt: string;
  promisedAt: string;
  payments: Array<{ receiptNumber: string; kind: string; method: string; amount: string; date: string }> | null;
};

export async function generateInvoicePdf(input: InvoicePdfInput): Promise<Buffer> {
  const document = new PDFDocument({
    size: 'A4',
    margin: 52,
    info: { Title: `Invoice ${input.orderNumber}`, Author: input.businessName },
  });
  const chunks: Buffer[] = [];
  const output = new Promise<Buffer>((resolve, reject) => {
    document.on('data', (chunk: Buffer) => chunks.push(chunk));
    document.on('end', () => resolve(Buffer.concat(chunks)));
    document.on('error', reject);
  });
  const money = (amount: string) => `${input.currency} ${amount}`;

  document.fontSize(21).fillColor('#17324d').text(input.businessName);
  document.moveDown(0.3).fontSize(10).fillColor('#68788a').text('ORDER INVOICE');
  document.moveDown(1).fontSize(12).fillColor('#17202a');
  document.text(`Customer: ${input.customerName}`);
  document.fontSize(10).fillColor('#52616f');
  document.text(`Phone: ${input.customerPhone}`);
  document.text(`Order: ${input.orderNumber}`);
  document.text(`Issued: ${input.issuedAt}`);
  document.text(`Promised: ${input.promisedAt}`);

  document.moveDown(1).fontSize(12).fillColor('#17202a').text('Items');
  document.fontSize(10).fillColor('#52616f');
  for (const line of input.lines) {
    document.text(`${line.quantity} × ${line.name} — ${money(line.unitPrice)} each — ${money(line.lineTotal)}`);
  }

  document.moveDown(0.8).fontSize(12).fillColor('#17202a');
  document.text(`Order total: ${money(input.total)}`);
  if (input.payments) {
    document.text(`Total paid: ${money(input.paid)}`);
    document.text(`Balance due: ${money(input.balance)}`);
    if (input.payments.length) {
      document.moveDown(0.8).text('Payments');
      document.fontSize(10).fillColor('#52616f');
      for (const payment of input.payments) {
        const sign = payment.kind === 'PAYMENT' ? '' : '−';
        document.text(`${payment.date} · ${payment.receiptNumber} · ${payment.kind} · ${payment.method} · ${sign}${money(payment.amount)}`);
      }
    }
  } else {
    document.moveDown(0.4).fontSize(10).fillColor('#68788a')
      .text('Payment history is not shown on this copy. Please ask the business for a full statement if you need one.');
  }

  document.moveDown(2).fontSize(9).fillColor('#68788a')
    .text('Thank you for choosing us. Please keep this invoice for your records.');
  document.end();
  return output;
}
