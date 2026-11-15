import { expect, test } from '@playwright/test';

test('hardware lesson: fix the module address and the analog channels', async ({ page }) => {
	test.setTimeout(90_000);
	await page.goto('/editor/lesson-hw-config');
	await page.evaluate(() => localStorage.setItem('plcsim:tips-off', '1'));
	await expect(async () => {
		await page.getByRole('button', { name: 'Hardware', exact: true }).click();
		await expect(page.getByRole('list', { name: 'Rack' })).toBeVisible({ timeout: 1000 });
	}).toPass();
	await expect(page.getByText('Q4.0 … Q5.7')).toBeVisible();

	await page.getByLabel('Start address — Slot 3').fill('0');
	await expect(page.getByText('Q0.0 … Q1.7')).toBeVisible();
	await page.getByLabel('Measuring type 4.0').selectOption('I_4_20');
	await page.getByLabel('Wire-break diagnostics 4.0').check();
	await page.getByLabel('Measuring type 4.1').selectOption('RTD');
	await page.getByLabel('Measuring type 4.2').selectOption('off');
	await page.getByLabel('Measuring type 4.3').selectOption('off');

	await page.getByRole('button', { name: 'Check solution' }).click();
	await expect(page.getByText('Passed!')).toBeVisible({ timeout: 60_000 });
});

test('hardware: overlapping modules are a problem', async ({ page }) => {
	await page.goto('/editor/lesson-hw-config');
	await page.evaluate(() => localStorage.setItem('plcsim:tips-off', '1'));
	await expect(async () => {
		await page.getByRole('button', { name: 'Hardware', exact: true }).click();
		await expect(page.getByRole('list', { name: 'Rack' })).toBeVisible({ timeout: 1000 });
	}).toPass();
	await page.getByLabel('Start address — Slot 3').fill('0');
	await page.getByLabel('Start address — Slot 2').fill('0');
	await page.getByLabel('Start address — Slot 4').fill('63');
	await expect(page.getByText(/an analog module starts on an even byte/).first()).toBeVisible();
});
