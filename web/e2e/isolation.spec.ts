import { expect, test } from '@playwright/test';
import { OWNER, sessionToken, signIn } from './helpers';

/**
 * Authorization negatives at API level (browser-level tenant isolation is
 * additionally covered by the backend DB suite): anonymous callers get
 * 401 everywhere, and a business token must never open platform routes.
 */
test.describe('authorization negatives', () => {
  test('anonymous requests are rejected', async ({ page }) => {
    for (const route of ['/api/v1/customers', '/api/v1/orders', '/api/v1/platform/businesses', '/api/v1/exports/orders.csv']) {
      const response = await page.request.get(route);
      expect(response.status(), route).toBe(401);
    }
  });

  test('a business token cannot open platform routes', async ({ page }) => {
    await signIn(page, OWNER.email, OWNER.password);
    const token = await sessionToken(page);
    const response = await page.request.get('/api/v1/platform/businesses', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect([401, 403]).toContain(response.status());
    expect(response.status()).not.toBe(200);
  });
});
