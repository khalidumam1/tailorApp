import { expect, test } from '@playwright/test';
import { OWNER, signIn } from './helpers';

test.describe('sign-in', () => {
  test('owner reaches the business workspace', async ({ page }) => {
    await signIn(page, OWNER.email, OWNER.password);
    // Dashboard is the landing view; the guide entry proves Phase 3 shipped.
    await expect(page.getByRole('button', { name: 'Help / User Guide' })).toBeVisible();
  });

  test('wrong password is rejected and stays on the sign-in form', async ({ page }) => {
    await page.goto('/');
    await page.locator('#email').fill(OWNER.email);
    await page.locator('#password').fill('not-the-password-2026');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.locator('.alert-error, [role="alert"]').first()).toBeVisible();
    await expect(page.locator('#email')).toBeVisible();
  });
});
