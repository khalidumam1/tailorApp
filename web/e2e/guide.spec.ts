import { expect, test } from '@playwright/test';
import { useSeededSession } from './helpers';

test.describe('user guide (Phase 3 task 3.1)', () => {
  test.beforeEach(async ({ page }) => {
    await useSeededSession(page);
  });

  test('search finds the payments tutorial and opens it', async ({ page }) => {
    await page.getByRole('button', { name: 'Help / User Guide' }).click();
    await expect(page.locator('.guide-article .guide-title')).toBeVisible();
    await page.getByLabel('Search the guide').fill('payment');
    // Snapshot first: on mismatch the failure prints the real page structure.
    await expect(page.locator('.guide-nav')).toMatchAriaSnapshot(`
      - button "Payments, receipts and exports"
    `);
    await page.getByRole('button', { name: 'Payments, receipts and exports' }).click();
    await expect(page.locator('.guide-article')).toContainText('Record a payment');
  });

  test('unknown search term shows the honest empty state', async ({ page }) => {
    await page.getByRole('button', { name: 'Help / User Guide' }).click();
    await page.getByLabel('Search the guide').fill('zzzz-no-such-topic');
    await expect(page.getByText(/No page matches/)).toBeVisible();
  });

  test('contextual ? Guide link jumps from Orders to the orders page', async ({ page }) => {
    await page.getByRole('button', { name: 'Orders', exact: true }).click();
    await page.getByRole('button', { name: '? Guide' }).click();
    await expect(page.locator('.guide-article')).toContainText('Orders and jobs');
  });
});
