import { expect, type Locator, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SESSION_FILE = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '.auth',
  'session.json',
);

/**
 * Restores the session captured by auth.setup.ts (no login request, so
 * the suite stays far under the login rate limit). Call before goto().
 */
export async function useSeededSession(page: Page) {
  const { raw } = JSON.parse(readFileSync(SESSION_FILE, 'utf8')) as { raw: string };
  await page.addInitScript((value) => {
    sessionStorage.setItem('tailorapp.session.v1', value);
  }, raw);
  await page.goto('/');
  await expect(
    page.getByRole('button', { name: /Orders|Businesses|Overview/ }).first(),
  ).toBeVisible({ timeout: 30_000 });
}

/** CI-only throwaway accounts, seeded into the isolated e2e schema. */
export const OWNER = {
  email: process.env.E2E_OWNER_EMAIL ?? 'e2e-owner@example.com',
  password: process.env.E2E_OWNER_PASSWORD ?? 'e2e-owner-password-2026',
};
export const PLATFORM = {
  email: process.env.E2E_PLATFORM_EMAIL ?? 'e2e-platform@example.com',
  password: process.env.E2E_PLATFORM_PASSWORD ?? 'e2e-platform-password-2026',
};

/**
 * Signs in and lands in a workspace. When the account can enter more
 * than one scope, the app shows an "Access context" picker and asks for
 * the password again — handle both shapes (business by default).
 */
export async function signIn(page: Page, email: string, password: string, scope: 'business' | 'platform' = 'business') {
  await page.goto('/');
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();

  const picker = page.locator('fieldset.scope-picker');
  await picker.waitFor({ state: 'visible', timeout: 5_000 }).catch(() => undefined);
  if (await picker.isVisible().catch(() => false)) {
    if (scope === 'platform') {
      await page.getByRole('radio', { name: 'Platform administration' }).check();
    } else {
      const radio = page.getByRole('radio', { name: 'Business workspace' });
      if (await radio.count()) await radio.check();
      const select = page.locator('select[aria-label="Business workspace"]');
      if (await select.count()) {
        // The seeded owner belongs to every demo business; the suite is
        // written against the tailor tenant, so pick it by name.
        const tailor = select.locator('option', { hasText: 'Tailor Demo' });
        const target = (await tailor.count())
          ? await tailor.first().getAttribute('value')
          : await select.locator('option').first().getAttribute('value');
        if (target) await select.selectOption(target);
      }
    }
    await page.locator('#password').fill(password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  }
  // Either the business sidebar or the platform console proves sign-in.
  await expect(
    page.getByRole('button', { name: /Orders|Businesses|Overview/ }).first(),
  ).toBeVisible({ timeout: 30_000 });
}

/**
 * Fills any still-invalid required control inside a form (template-driven
 * custom fields differ per demo business, so the journey fills what it
 * knows and this sweeps the rest with plausible values).
 */
export async function fillRemainingRequired(form: Locator) {
  const invalid = await form.evaluate((element) => {
    const controls = Array.from(element.querySelectorAll('input, select, textarea'));
    return controls
      .map((control, index) => {
        const input = control as HTMLInputElement;
        return { index, invalid: !input.checkValidity(), type: input.type ?? '', tag: control.tagName };
      })
      .filter((entry) => entry.invalid);
  });
  const controls = form.locator('input, select, textarea');
  for (const entry of invalid) {
    const control = controls.nth(entry.index);
    if (entry.tag === 'SELECT') {
      const value = await control.locator('option').nth(1).getAttribute('value').catch(() => null);
      if (value) await control.selectOption(value).catch(() => undefined);
    } else if (entry.type === 'checkbox' || entry.type === 'radio') {
      await control.check().catch(() => undefined);
    } else if (entry.type === 'number') {
      await control.fill('1');
    } else if (entry.type === 'datetime-local') {
      await control.fill('2027-01-15T18:00');
    } else if (entry.type === 'date') {
      await control.fill('2027-01-15');
    } else {
      await control.fill('E2E');
    }
  }
}

/** Bearer token of the UI session, for API-level negative checks. */
export async function sessionToken(page: Page): Promise<string> {
  const token = await page.evaluate(() => {
    const raw = sessionStorage.getItem('tailorapp.session.v1');
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { session?: { accessToken?: string } };
    return parsed.session?.accessToken ?? null;
  });
  if (!token) throw new Error('No access token in the UI session');
  return token;
}
