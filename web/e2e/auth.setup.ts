import { test as setup } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { OWNER, SESSION_FILE, signIn } from './helpers';

/**
 * Signs in exactly once and stores the session (sessionStorage payload)
 * for the journey/guide/isolation specs. The login endpoint is rate
 * limited to 10 attempts per 15 minutes per IP (F-013), so the suite
 * must not burn a fresh login in every test.
 */
setup('sign in as the seeded owner', async ({ page }) => {
  await signIn(page, OWNER.email, OWNER.password);
  const raw = await page.evaluate(() => sessionStorage.getItem('tailorapp.session.v1'));
  if (!raw) throw new Error('Session was not stored after sign-in');
  mkdirSync(path.dirname(SESSION_FILE), { recursive: true });
  writeFileSync(SESSION_FILE, JSON.stringify({ raw }), 'utf8');
});
