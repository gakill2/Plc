import { expect, test } from '@playwright/test';

test('F-CPU lesson: the standard program may not switch an F-output', async ({ page }) => {
	test.setTimeout(90_000);
	page.on('dialog', (d) => d.accept());
	await page.goto('/editor/lesson-f-estop');
	await page.evaluate(() => localStorage.setItem('plcsim:tips-off', '1'));
	await expect(page.getByText(/K1 is a fail-safe output/).first()).toBeVisible();

	await expect(async () => {
		await page.getByRole('button', { name: 'Safety', exact: true }).click();
		await expect(page.getByLabel('F-signature')).toBeVisible({ timeout: 1000 });
	}).toPass();
	const before = await page.getByLabel('F-signature').textContent();
	await expect(page.getByRole('table', { name: 'Fail-safe inputs' })).toContainText('F_EStop');

	await page.getByRole('button', { name: 'Show solution' }).click();
	await page.getByRole('button', { name: 'Safety', exact: true }).click();
	await expect(page.getByLabel('F-signature')).not.toHaveText(before ?? '');
	await expect(page.getByText(/K1 is a fail-safe output/)).toHaveCount(0);
	await page.getByRole('button', { name: 'Check solution' }).click();
	await expect(page.getByText('Passed!')).toBeVisible({ timeout: 60_000 });
});
