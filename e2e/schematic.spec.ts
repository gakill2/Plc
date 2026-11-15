import { expect, test } from '@playwright/test';

test('schematic: cross references, terminal strip and the multimeter', async ({ page }) => {
	await page.goto('/learn/basics/schematy', { waitUntil: 'networkidle' });
	const lab = page.locator('figure', { hasText: 'Schemat elektryczny taśmy T1' });
	await expect(lab.getByText('Zadanie 1 / 6')).toBeVisible();

	// 1: the coil, found through the device list
	await lab
		.getByRole('list', { name: 'Lista aparatów' })
		.getByRole('button', { name: /A1-A2/ })
		.click();
	await expect(lab.getByRole('img', { name: /Strona 4/ })).toBeVisible();
	await lab.getByRole('button', { name: '-K1 A1-A2' }).click();
	await expect(lab.getByText(/✓ Cewka -K1/)).toBeVisible();
	await lab.getByRole('button', { name: 'Następne zadanie →' }).click();

	// 2: follow the contact mirror to the input page
	await lab.getByRole('link', { name: '/3.5' }).click();
	await expect(lab.getByRole('img', { name: /Strona 3/ })).toBeVisible();
	await lab.getByRole('button', { name: '-A1 I0.3' }).click();
	await expect(lab.getByText(/nie to/)).toBeVisible();
	await lab.getByRole('button', { name: '-A1 I0.4' }).click();
	await expect(lab.getByText(/✓ Styk -K1:13-14/)).toBeVisible();

	// the multimeter on page 4
	await lab.getByRole('button', { name: /Strona 4/ }).click();
	await lab.getByLabel('🔌 multimetr').check();
	await lab.getByRole('button', { name: 'punkt pomiarowy -X2:1 (od strony pola)' }).click();
	await expect(lab.getByRole('status')).toContainText('24.0 V DC');
	await lab.getByRole('button', { name: 'punkt pomiarowy -K1:A1' }).click();
	await expect(lab.getByRole('status')).toContainText('0.0 V DC');
});
