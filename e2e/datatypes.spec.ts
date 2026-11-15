import { expect, test } from '@playwright/test';

test('recipe lesson: data block, UDT and STRING', async ({ page }) => {
	test.setTimeout(120_000);
	page.on('dialog', (d) => d.accept());
	await page.goto('/editor/lesson-recipe-db');
	await page.evaluate(() => localStorage.setItem('plcsim:tips-off', '1'));
	await expect(page.getByRole('button', { name: 'Show solution' })).toBeVisible();
	await page.getByRole('button', { name: 'Show solution' }).click();
	await expect(page.getByRole('cell', { name: 'Recipes.Active.Name', exact: true })).toBeVisible();
	await expect(page.getByText('STRING[16]').first()).toBeVisible();

	await page.getByRole('button', { name: '▶ Run' }).click();
	await expect(page.getByText("'Baza'").first()).toBeVisible({ timeout: 10_000 });
	await page.getByRole('button', { name: '■ Stop' }).click();

	await page.getByRole('button', { name: 'Check solution' }).click();
	await expect(page.getByText('Passed!')).toBeVisible({ timeout: 90_000 });
});
