import { expect, test } from '@playwright/test';

test('tutorial: simulator, quiz and progress', async ({ page }) => {
	await page.goto('/learn/basics', { waitUntil: 'networkidle' });
	await expect(page.getByText('ukończone:')).toBeVisible();
	await page.getByRole('link', { name: /Styki i cewki/ }).click();
	await expect(page.getByRole('heading', { name: 'Styki i cewki' })).toBeVisible();

	const button = page.getByRole('button', { name: 'Wciśnij Przycisk' });
	await button.dispatchEvent('pointerdown', { pointerId: 1 });
	await expect(page.getByLabel('LampaNO świeci')).toBeVisible();
	await expect(page.getByLabel('LampaNC zgaszona')).toBeVisible();
	await button.dispatchEvent('pointerup', { pointerId: 1 });
	await expect(page.getByLabel('LampaNO zgaszona')).toBeVisible();

	await page.getByRole('button', { name: 'Tylko zwierny ┤ ├ I0.0' }).click();
	await expect(page.getByText('Nie tym razem')).toBeVisible();
	await page.getByRole('button', { name: 'Tylko rozwierny ┤/├ I0.0' }).click();
	await expect(page.getByText('Dobrze!')).toBeVisible();

	await page.goto('/learn/basics', { waitUntil: 'networkidle' });
	await expect(page.getByText(/ukończone:\s*1 \/ 11/)).toBeVisible();
});

test('glossary search', async ({ page }) => {
	await page.goto('/learn/glossary', { waitUntil: 'networkidle' });
	await page.getByLabel('Szukaj w słowniczku').fill('rising');
	await expect(page.getByText('zbocze narastające / opadające')).toBeVisible();
	await expect(page.getByText('stycznik', { exact: true })).toHaveCount(0);
});
