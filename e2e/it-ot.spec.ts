import { expect, test } from '@playwright/test';

test('MQTT broker delivers to matching subscriptions', async ({ page }) => {
	await page.goto('/learn/basics/scada-iiot');
	const demo = page.locator('figure', { hasText: 'MQTT: publikuj' });
	await expect(async () => {
		await demo.getByRole('button', { name: 'plant/line2/oven/temp' }).click();
		await demo.getByRole('button', { name: 'Publikuj' }).click();
		await expect(demo.getByRole('status')).toContainText('Historian temperatur', { timeout: 500 });
	}).toPass();
	await expect(demo.getByRole('status')).not.toContainText('Dashboard linii 1');
});

test('firewall exercise grades the rules', async ({ page }) => {
	await page.goto('/learn/basics/cyber-ot');
	const lab = page.locator('figure', { hasText: 'reguły firewalla' });
	const groups = lab.getByRole('radiogroup');
	await expect(async () => {
		await groups.first().getByRole('radio', { name: 'przepuść' }).click();
		await expect(groups.first().getByRole('radio', { name: 'przepuść' })).toHaveAttribute(
			'aria-checked',
			'true',
			{ timeout: 500 }
		);
	}).toPass();
	const n = await groups.count();
	for (let i = 1; i < n; i++) await groups.nth(i).getByRole('radio', { name: 'przepuść' }).click();
	await lab.getByRole('button', { name: 'Sprawdź reguły' }).click();
	await expect(lab.getByRole('status')).toContainText(`Dobrze: 4 / ${n}`);
});
