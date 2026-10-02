import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { test } from 'node:test';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL ??= 'postgresql://test:test@localhost:5432/tailor_test';
process.env.ACCESS_TOKEN_SECRET ??= 'test-only-secret-that-is-long-enough-to-pass';
process.env.CORS_ORIGINS ??= 'http://localhost:5173';
process.env.WHATSAPP_ENABLED = 'false';
process.env.WHATSAPP_ACCESS_TOKEN = 'test-access-token';
process.env.META_APP_SECRET = 'test-meta-app-secret';
process.env.WHATSAPP_VERIFY_TOKEN = 'test-webhook-verify-token';

const { generateReceiptPdf, metaPost, verifyMetaChallengeToken, verifyMetaSignature } = await import('../src/whatsapp.js');

test('Meta webhook signature verification rejects missing, malformed and forged signatures', () => {
  const body = Buffer.from('{"object":"whatsapp_business_account"}');
  const signature = `sha256=${createHmac('sha256', 'test-meta-app-secret').update(body).digest('hex')}`;
  assert.equal(verifyMetaSignature(body, signature), true);
  assert.equal(verifyMetaSignature(body, 'sha256=' + '0'.repeat(64)), false);
  assert.equal(verifyMetaSignature(body, undefined), false);
});

test('Meta webhook verification challenge requires the configured verification token', () => {
  assert.equal(verifyMetaChallengeToken('test-webhook-verify-token'), true);
  assert.equal(verifyMetaChallengeToken('wrong-token'), false);
});

test('Meta API failures are surfaced without persisting provider response contents', async () => {
  await assert.rejects(
    metaPost('https://graph.facebook.com/test', '{}', 'application/json', async () =>
      new Response('provider echoed private request data', { status: 400 })),
    (error: Error) => {
      assert.equal(error.message, 'Meta API rejected request (HTTP 400)');
      assert.equal(error.message.includes('private'), false);
      return true;
    },
  );
});

test('receipt PDF is generated from the supplied authoritative transaction snapshot', async () => {
  const pdf = await generateReceiptPdf({
    businessName: 'Karachi Tailors',
    customerName: 'Demo Customer',
    orderNumber: 'KHI-000001',
    garments: '1 x Shalwar Kameez',
    amount: 'PKR 500.00',
    paymentMethod: 'CASH',
    receiptReference: 'KHI-R000001',
    paidAt: '1 Oct 2026',
    total: 'PKR 1,500.00',
    totalPaid: 'PKR 500.00',
    remaining: 'PKR 1,000.00',
  }, 'PAYMENT_RECEIVED');
  assert.equal(pdf.subarray(0, 5).toString('ascii'), '%PDF-');
  assert.ok(pdf.length > 500);
});
