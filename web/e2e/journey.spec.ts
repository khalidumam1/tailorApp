import { expect, test } from '@playwright/test';
import { fillRemainingRequired, OWNER, signIn } from './helpers';

/**
 * The money journey end to end in the real UI against the real API:
 * customer -> order -> payment -> invoice action available.
 * Names carry a run-unique suffix so re-runs never collide.
 */
test('customer to order to payment', async ({ page }) => {
  const suffix = Date.now().toString().slice(-8);
  const customerName = `E2E Customer ${suffix}`;
  await signIn(page, OWNER.email, OWNER.password);

  // 1. Create the customer.
  await page.getByRole('button', { name: 'Customers', exact: true }).click();
  await page.getByLabel('Name', { exact: true }).fill(customerName);
  await page.getByLabel('Phone', { exact: true }).fill(`0300${suffix}`);
  await page.getByRole('button', { name: 'Save customer' }).click();
  await expect(page.getByText(customerName)).toBeVisible();

  // 2. Create an order for that customer.
  await page.getByRole('button', { name: 'Orders', exact: true }).click();
  const orderForm = page.locator('form', { hasText: 'Start a new order' });
  const customerSelect = orderForm.getByLabel('Customer');
  const customerValue = await customerSelect
    .locator('option', { hasText: customerName })
    .getAttribute('value');
  if (!customerValue) throw new Error(`Customer ${customerName} missing from the order form`);
  await customerSelect.selectOption(customerValue);
  await orderForm.locator('label', { hasText: 'name' }).locator('input').first().fill(`E2E Garment ${suffix}`);
  await orderForm.getByLabel('Quantity').fill('1');
  await orderForm.getByLabel(/Unit price/).fill('1500');
  await orderForm.getByLabel('Due date').fill('2027-01-15T18:00');
  await fillRemainingRequired(orderForm);
  await orderForm.getByRole('button', { name: 'Create order' }).click();
  const orderCard = page.locator('.order-card', { hasText: customerName });
  await expect(orderCard.first()).toBeVisible();

  // 3. Record a full payment; the invoice (receipt) action must be offered.
  await orderCard.first().getByRole('button', { name: 'Record payment' }).click();
  await page.getByLabel(/Amount/).fill('1500');
  await page.getByRole('button', { name: 'Post payment' }).click();
  await expect(page.getByRole('button', { name: 'Post payment' })).toBeHidden();
  await expect(orderCard.first().getByRole('button', { name: /Download invoice/ })).toBeVisible();
});
