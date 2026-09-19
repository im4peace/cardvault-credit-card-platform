import { expect, test, type Page } from '@playwright/test';

async function signIn(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

test('apply -> approve -> activate -> limit change -> approve', async ({ page }) => {
  const email = `e2e-${Date.now()}@test.com`;

  // Customer registers and applies
  await page.goto('/login');
  await page.getByRole('button', { name: /Create an account/ }).click();
  await page.getByLabel('First name').fill('Eda');
  await page.getByLabel('Last name').fill('Tester');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('password123');
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.getByRole('link', { name: 'New Application' }).click();
  await page.getByLabel('First name').fill('Eda');
  await page.getByLabel('Last name').fill('Tester');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Phone number').fill('+1-555-0199');
  await page.getByLabel('Date of birth').fill('1992-03-04');
  await page.getByLabel('Country').fill('USA');
  await page.getByLabel('Address').fill('9 Test Road');
  await page.getByLabel('City').fill('Testville');
  await page.getByLabel('Monthly income (USD)').fill('6000');
  await page.getByLabel('Requested credit limit (USD)').fill('4000');
  await page.getByRole('button', { name: 'Submit application' }).click();
  await expect(page.getByText('PENDING CREDIT REVIEW')).toBeVisible();
  await page.getByRole('button', { name: 'Sign out' }).click();

  // Officer approves
  await signIn(page, 'officer@test.com', 'Officer123!');
  await page.getByRole('link', { name: 'Pending Applications' }).click();
  await page.locator('.list-row', { hasText: 'Eda Tester' }).getByRole('link', { name: 'Review' }).click();
  await page.getByLabel('Approved credit limit (USD)').fill('3500');
  await page.getByRole('button', { name: 'Approve' }).click();
  await expect(page.getByRole('heading', { name: 'Pending applications' })).toBeVisible();
  await page.getByRole('button', { name: 'Sign out' }).click();

  // Customer activates the card
  await signIn(page, email, 'password123');
  await page.getByRole('link', { name: 'My Card' }).click();
  await expect(page.getByText('$3,500').first()).toBeVisible();
  await page.getByRole('button', { name: 'Activate card' }).click();
  await expect(page.getByRole('button', { name: 'Activate card' })).toHaveCount(0);

  // Requests a limit increase
  await page.getByRole('link', { name: 'Credit Limit' }).click();
  await page.getByLabel('Requested limit (USD)').fill('6000');
  await page.getByRole('button', { name: 'Submit request' }).click();
  await expect(page.getByText('PENDING', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Sign out' }).click();

  // Officer approves the limit change
  await signIn(page, 'officer@test.com', 'Officer123!');
  await page.getByRole('link', { name: 'Limit Requests', exact: true }).click();
  await page.locator('.list-row', { hasText: '$3,500 → $6,000' }).getByRole('link', { name: 'Review' }).click();
  await page.getByRole('button', { name: 'Approve' }).click();
  await page.getByRole('button', { name: 'Sign out' }).click();

  // Customer sees the new limit
  await signIn(page, email, 'password123');
  await page.getByRole('link', { name: 'My Card' }).click();
  await expect(page.getByText('$6,000').first()).toBeVisible();
});

test('customer cannot reach officer pages; officer can reject with a comment', async ({ page }) => {
  await signIn(page, 'customer@test.com', 'Customer123!');
  await expect(page.getByText('Customer Portal')).toBeVisible();
  await page.goto('/officer/applications');
  await expect(page.getByText('Customer Portal')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Pending applications' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Sign out' }).click();

  await signIn(page, 'officer@test.com', 'Officer123!');
  await page.getByRole('link', { name: 'Pending Applications' }).click();
  await page.locator('.list-row', { hasText: 'customer3' }).getByRole('link', { name: 'Review' }).click();
  await expect(page.getByRole('button', { name: 'Reject' })).toBeDisabled();
  await page.getByLabel(/Decision comment/).fill('Insufficient history');
  await page.getByRole('button', { name: 'Reject' }).click();
  await page.getByRole('link', { name: 'Decision History' }).click();
  await expect(page.getByText('Insufficient history')).toBeVisible();
});
