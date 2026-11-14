import { expect, test } from '@playwright/test';

test('pneumatic press: lesson passes, a plant fault is injected from the Process view', async ({
	page
}) => {
	page.on('dialog', (d) => d.accept());
	await page.goto('/editor/lesson-pneumatic-press');
	await page.evaluate(() => localStorage.setItem('plcsim:tips-off', '1'));
	await page.getByRole('button', { name: 'Show solution' }).click();
	await page.getByRole('button', { name: 'Check solution' }).click();
	await expect(page.getByText('Passed!')).toBeVisible({ timeout: 30_000 });

	await page.getByRole('button', { name: '▶ Run' }).click();
	await page.getByRole('button', { name: 'Process', exact: true }).click();
	await expect(page.getByText('powietrze 6 bar', { exact: true })).toBeVisible();
	await page.getByText('Sensors and faults', { exact: true }).click();
	await page.getByLabel('No compressed air').check();
	await expect(page.getByText('BRAK POWIETRZA', { exact: true })).toBeVisible();
	await page.getByLabel('Fault of AirOk').selectOption('stuck1');
	await expect(page.getByText('2 active')).toBeVisible();
});

test('batch mixer lesson passes with noisy signals', async ({ page }) => {
	page.on('dialog', (d) => d.accept());
	await page.goto('/editor/lesson-mixer-batch');
	await page.evaluate(() => localStorage.setItem('plcsim:tips-off', '1'));
	await page.getByRole('button', { name: 'Show solution' }).click();
	await page.getByRole('button', { name: 'Check solution' }).click();
	await expect(page.getByText('Passed!')).toBeVisible({ timeout: 30_000 });
	await page.getByRole('button', { name: 'Process', exact: true }).click();
	await expect(page.getByText('realistic signals', { exact: true })).toBeVisible();
});
