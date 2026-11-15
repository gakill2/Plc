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
	await expect(page.getByText(/ukończone:\s*1 \/ 31/)).toBeVisible();
});

test('glossary search', async ({ page }) => {
	await page.goto('/learn/glossary', { waitUntil: 'networkidle' });
	await page.getByLabel('Szukaj w słowniczku').fill('rising');
	await expect(page.getByText('zbocze narastające / opadające')).toBeVisible();
	await expect(page.getByText('stycznik', { exact: true })).toHaveCount(0);
});

test('interactive figures: wiring, analog scaling, PID oven', async ({ page }) => {
	await page.goto('/learn/basics/elektryka', { waitUntil: 'networkidle' });
	await page.getByRole('button', { name: /brak obiektu/ }).click();
	await expect(page.getByText('I0.0 = 1')).toBeVisible();
	await page
		.getByRole('group', { name: 'Typ czujnika' })
		.getByRole('button', { name: 'NPN' })
		.click();
	await expect(page.getByRole('status').filter({ hasText: 'czujnik' })).toContainText(
		'choć czujnik świeci'
	);
	await page.getByRole('button', { name: /source/ }).click();
	await expect(page.getByText('I0.0 = 1')).toBeVisible();

	await page.goto('/learn/basics/liczby-i-analog', { waitUntil: 'networkidle' });
	await expect(page.getByText('13824', { exact: true })).toBeVisible();
	await page.getByLabel('Sygnał analogowy').fill('0');
	await expect(page.getByText(/ZERWANIE PRZEWODU/)).toBeVisible();

	await page.goto('/learn/basics/regulacja', { waitUntil: 'networkidle' });
	const oven = page.locator('figure', { hasText: 'Piec z grzałką' }).first();
	await expect(oven.getByRole('status')).toContainText('PV =');
	await expect(oven.getByRole('status')).not.toContainText('PV = 20.0 °C', { timeout: 5000 });
});
