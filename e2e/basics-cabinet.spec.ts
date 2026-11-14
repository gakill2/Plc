import { expect, test } from '@playwright/test';

test('step response lab: identify the plant, get SIMC settings', async ({ page }) => {
	await page.goto('/learn/basics/podstawy-automatyki');
	const lab = page.locator('figure', { hasText: 'Laboratorium odpowiedzi skokowej' });
	// the first hidden plant is fixed: K 1.5, T 12 s, delay 3 s
	await expect(async () => {
		await lab.getByLabel('K (wartość końcowa)').fill('1.5');
		await lab.getByLabel('τ — opóźnienie, s').fill('3');
		await lab.getByLabel('T — od końca opóźnienia do 63 %, s').fill('12');
		await lab.getByRole('button', { name: 'Sprawdź' }).click();
		await expect(lab.getByRole('status')).toContainText('Dobrze!', { timeout: 500 });
	}).toPass();
	await expect(lab.getByRole('status')).toContainText('Ti = min(T, 8τ) = 12.0 s');
});

test('cabinet calculator sizes the supply and warns about voltage drop', async ({ page }) => {
	await page.goto('/learn/basics/szafa-sterownicza');
	const calc = page.locator('figure', { hasText: 'dobór zasilacza' });
	await expect(calc.getByTestId('psu')).toContainText('zasilacz 10 A');
	await expect(async () => {
		await calc.getByLabel('Ilość: Zawory pneumatyczne').fill('60');
		await expect(calc.getByTestId('psu')).toContainText('zasilacz 20 A', { timeout: 500 });
	}).toPass();
});
