import { expect, test } from '@playwright/test';

test('subnet calculator and the network doctor', async ({ page }) => {
	await page.goto('/learn/basics/sieci-ot');
	const calc = page.locator('figure', { hasText: 'Kalkulator podsieci' });
	await expect(async () => {
		await calc.getByLabel('Adres IP', { exact: true }).fill('192.168.10.37');
		await calc.getByLabel('Prefiks').fill('28');
		await expect(calc.getByTestId('subnet-info')).toContainText('192.168.10.47', { timeout: 500 });
	}).toPass();
	await expect(calc.getByRole('status')).toContainText('w innej podsieci');

	const doctor = page.locator('figure', { hasText: 'Diagnosta sieci' });
	await doctor.getByRole('button', { name: /Panel HMI/ }).click();
	await expect(doctor).toContainText('192.168.0.10/24');
	await doctor.getByLabel('Ping z').selectOption({ label: 'Panel HMI' });
	await doctor.getByLabel('Ping do').selectOption({ label: 'PLC' });
	await doctor.getByRole('button', { name: 'Ping', exact: true }).click();
	await expect(doctor.getByLabel('Wyniki ping')).toContainText('limit czasu');
	await doctor.getByLabel('Urządzenie').selectOption({ label: 'Panel HMI' });
	await doctor.getByLabel('Usterka sieci').selectOption({ label: 'adres IP z innej podsieci' });
	await doctor.getByRole('button', { name: 'Sprawdź' }).click();
	await expect(doctor.getByRole('status')).toContainText('za pierwszym razem');
});
