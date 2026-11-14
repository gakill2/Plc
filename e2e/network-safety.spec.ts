import { expect, test } from '@playwright/test';

test('Modbus demo shows the bytes on the wire', async ({ page }) => {
	await page.goto('/learn/basics/komunikacja');
	const demo = page.locator('figure', { hasText: 'Modbus TCP: zapytanie' });
	// wait for hydration: the first click may land before the handlers exist
	await expect(async () => {
		await demo.getByRole('button', { name: 'Wyślij' }).click();
		await expect(demo.getByRole('status')).toContainText('215, 1800', { timeout: 500 });
	}).toPass();
	await expect(demo).toContainText('00 D7');
});

test('safety relay: a welded contactor blocks the reset, risk graph gives PLr', async ({
	page
}) => {
	await page.goto('/learn/basics/bezpieczenstwo-maszyn');
	const demo = page.locator('figure', { hasText: 'Przekaźnik bezpieczeństwa' });
	const reset = demo.getByRole('button', { name: /Reset/ });
	await expect(async () => {
		await reset.dispatchEvent('pointerdown');
		await page.waitForTimeout(150);
		await reset.dispatchEvent('pointerup');
		await expect(demo).toContainText('Silnik: pracuje', { timeout: 500 });
	}).toPass();

	await demo.getByLabel(/zgrzany styk/).check();
	await demo.getByRole('button', { name: 'E-STOP' }).click();
	await demo.getByRole('button', { name: /E-STOP wciśnięty/ }).click();
	await reset.dispatchEvent('pointerdown');
	await page.waitForTimeout(200);
	await reset.dispatchEvent('pointerup');
	await expect(demo.getByRole('status').first()).toContainText('zgrzany');

	await expect(demo.getByTestId('plr')).toHaveText('d');
	await demo.getByLabel(/P2/).check();
	await expect(demo.getByTestId('plr')).toHaveText('e');
});
