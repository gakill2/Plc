import { expect, test } from '@playwright/test';

test('motion lesson: the PLCopen program passes and the axis shows its state', async ({ page }) => {
	test.setTimeout(120_000);
	page.on('dialog', (d) => d.accept());
	await page.goto('/editor/lesson-motion-pickplace');
	await page.evaluate(() => localStorage.setItem('plcsim:tips-off', '1'));
	await page.getByRole('button', { name: 'Show solution' }).click();
	await page.getByRole('button', { name: 'Check solution' }).click();
	await expect(page.getByText('Passed!')).toBeVisible({ timeout: 90_000 });

	await page.getByRole('button', { name: '▶ Run' }).click();
	await page.getByRole('button', { name: 'Process' }).click();
	await expect(page.getByRole('img', { name: /Axis at \?/ })).toBeVisible();
	await expect(page.getByRole('img', { name: /Standstill/ })).toBeVisible({ timeout: 5000 });
});
