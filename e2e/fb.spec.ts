import { expect, test } from '@playwright/test';

test('function block lesson: three instances, variables per instance', async ({ page }) => {
	page.on('dialog', (d) => d.accept());
	await page.goto('/editor/lesson-fb-motor');
	await page.evaluate(() => localStorage.setItem('plcsim:tips-off', '1'));
	await page.getByRole('button', { name: 'Pokaż rozwiązanie' }).click();
	await page.getByRole('button', { name: 'Sprawdź rozwiązanie' }).click();
	await expect(page.getByText('Zaliczone!')).toBeVisible({ timeout: 20_000 });
	await expect(page.getByText('m3.Fault', { exact: true })).toBeVisible();
	await expect(page.getByRole('region', { name: /Problems \(0\)/ })).toBeVisible();
});
