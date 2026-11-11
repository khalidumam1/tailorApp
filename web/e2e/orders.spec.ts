import { expect, test } from '@playwright/test';
import { useSeededSession } from './helpers';

/**
 * The "Manage" action of the orders table opens the whole order card.
 *
 * It used to be a <details> popover without any stylesheet: the card spilled
 * out of the table cell, was clipped by the page and covered the workspace
 * (the customer link and the action buttons were cut in half). It is a real
 * dialog now, and this test keeps it that way - the dialog has to fit the
 * screen, and it has to close again.
 */
test('manage order opens a dialog that fits the screen', async ({ page }) => {
  await useSeededSession(page);

  await page.getByLabel('Main navigation').getByRole('button', { name: 'Orders', exact: true }).click();
  await page.getByRole('button', { name: 'Table' }).click();

  const manageButton = page.getByRole('button', { name: 'Manage' }).first();
  await expect(manageButton).toBeVisible();
  await manageButton.click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('heading')).toContainText('Manage ');

  // The dialog must sit inside the viewport: the old popover overflowed to
  // the right and was clipped on the left.
  const box = await dialog.boundingBox();
  const viewport = page.viewportSize();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.width).toBeLessThanOrEqual(viewport!.width);
  expect(box!.height).toBeLessThanOrEqual(viewport!.height);

  // Escape closes it again.
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});
