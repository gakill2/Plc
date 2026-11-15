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

test('the learning path follows the interface language', async ({ page }) => {
	await page.goto('/learn', { waitUntil: 'networkidle' });
	await expect(page.getByRole('heading', { name: 'Learn PLC' })).toBeVisible();
	await expect(page.getByText('Stage 1 · How a PLC works')).toBeVisible();
	await page.getByRole('link', { name: /What a PLC is chapter/ }).click();
	await expect(page.getByText(/written in Polish for now/)).toBeVisible();
	await page.goto('/learn', { waitUntil: 'networkidle' });
	await expect(async () => {
		await page.getByRole('button', { name: 'pl', exact: true }).click();
		await expect(page.getByRole('heading', { name: 'Nauka PLC' })).toBeVisible({ timeout: 1000 });
	}).toPass();
	await expect(page.getByText('Etap 1 · Jak działa sterownik')).toBeVisible();
});
