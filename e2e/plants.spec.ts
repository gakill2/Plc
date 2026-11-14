import { expect, test } from '@playwright/test';
import { openEditor } from './helpers';

test('own project: connect a plant, its symbols and Process view appear', async ({ page }) => {
	await openEditor(page);
	await expect(page.getByRole('button', { name: 'Process' })).toHaveCount(0);
	await page.getByRole('button', { name: 'Circuit' }).click();
	await page.getByLabel('Plant').selectOption('tank');
	await page.getByRole('button', { name: 'Process' }).click();
	await expect(page.getByText('Water tank — PLC connections')).toBeVisible();
	// the demo circuit has Start / Stop on I0.0 / I0.1 — the tank's sensors
	await expect(page.getByRole('list', { name: 'Warnings' })).toContainText(
		'I0.0 is a plant sensor (Low)'
	);

	await page.getByRole('button', { name: 'Circuit' }).click();
	await page.getByLabel('Plant').selectOption('');
	await expect(page.getByRole('button', { name: 'Process' })).toHaveCount(0);
});

test('new devices: selector, e-stop and contactor can be operated', async ({ page }) => {
	await openEditor(page);
	await page.getByRole('button', { name: 'Circuit' }).click();
	await page.getByRole('button', { name: /3-position selector/ }).click();
	await page.getByRole('button', { name: /Emergency stop/ }).click();
	await page.getByRole('button', { name: /Contactor \+ feedback/ }).click();

	await page.getByRole('button', { name: 'Mode1 AUTO' }).click();
	await expect(page.getByRole('button', { name: 'Mode1 AUTO' })).toHaveAttribute(
		'aria-pressed',
		'true'
	);

	const estop = page.getByRole('button', { name: 'Emergency stop EStop1' });
	await estop.click();
	await expect(estop).toHaveAttribute('aria-pressed', 'true');
	await expect(page.getByText('LOCKED')).toBeVisible();
	await estop.click();
	await expect(estop).toHaveAttribute('aria-pressed', 'false');

	await expect(page.getByRole('img', { name: 'K1 released' })).toBeVisible();
	await page.getByRole('button', { name: 'Trip' }).click();
	await expect(page.getByRole('img', { name: 'K1 tripped' })).toBeVisible();
});
