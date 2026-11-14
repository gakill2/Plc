import { expect, test } from '@playwright/test';
import { openEditor } from './helpers';

test('ladder: duplicate a coil, see the warning, change the type, undo', async ({ page }) => {
	await openEditor(page);
	const warnings = page.getByRole('list', { name: 'Warnings' });
	await expect(warnings).toHaveCount(0);

	await page.getByRole('button', { name: 'COIL coil Q0.0' }).click();
	await page.keyboard.press('Control+d');
	await expect(page.getByRole('button', { name: 'COIL coil Q0.0' })).toHaveCount(2);
	await expect(warnings).toContainText('is written by 2 coils');
	await expect(page.getByLabel('1 warning(s)')).toBeVisible();

	await page.getByLabel('Element type').selectOption('SET');
	await expect(page.getByRole('button', { name: 'SET coil Q0.0' })).toBeVisible();
	await expect(warnings).toContainText('normal coil and SET/RESET coils');

	await page.keyboard.press('Control+z');
	await page.keyboard.press('Control+z');
	await expect(page.getByRole('button', { name: 'COIL coil Q0.0' })).toHaveCount(1);
	await expect(warnings).toHaveCount(0);
});

test('ladder: MOVE box and the cross-reference list', async ({ page }) => {
	await openEditor(page);
	await page.getByRole('button', { name: 'NO contact I0.0' }).first().click();
	await page.getByRole('button', { name: 'MOVE', exact: true }).click();
	await expect(page.getByRole('button', { name: 'MOVE box' })).toBeVisible();
	await expect(page.getByLabel('MOVE OUT')).toHaveValue('MW0');

	await page.getByRole('button', { name: /Cross-reference/ }).click();
	await page.getByLabel('Filter cross-reference').fill('MW0');
	const row = page.locator('tr', { hasText: 'MW0' });
	await expect(row).toContainText('N1 MOVE');

	await page.getByLabel('Filter cross-reference').fill('Q0.1');
	await page.locator('tr', { hasText: 'Q0.1' }).getByRole('button', { name: 'N2 ( )' }).click();
	await expect(page.getByRole('button', { name: 'COIL coil Q0.1' })).toHaveAttribute(
		'aria-pressed',
		'true'
	);
});
