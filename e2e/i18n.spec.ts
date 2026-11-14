import { expect, test } from '@playwright/test';

test('the interface switches between English and Polish and remembers it', async ({ page }) => {
	await page.goto('/');
	await expect(page.getByRole('heading', { name: /Learn how a PLC thinks/ })).toBeVisible();
	await expect(async () => {
		await page.getByRole('button', { name: 'pl', exact: true }).click();
		await expect(page.getByRole('heading', { name: /Zobacz, jak myśli sterownik/ })).toBeVisible({
			timeout: 1000
		});
	}).toPass();
	await expect(page.getByRole('link', { name: 'Nauka' })).toBeVisible();
	await page.reload();
	await expect(page.getByRole('heading', { name: /Zobacz, jak myśli sterownik/ })).toBeVisible();
	await expect(async () => {
		await page.getByRole('button', { name: 'en', exact: true }).click();
		await expect(page.getByRole('link', { name: 'Learn', exact: true })).toBeVisible({
			timeout: 1000
		});
	}).toPass();
});
