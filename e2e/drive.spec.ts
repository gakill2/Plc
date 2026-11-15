import { expect, test } from '@playwright/test';

test('drive lab: a flywheel braked too fast trips on DC overvoltage', async ({ page }) => {
	await page.goto('/learn/basics/falownik-siec', { waitUntil: 'networkidle' });
	const lab = page.locator('figure', { hasText: 'Laboratorium falownika' });
	await lab.getByLabel(/P1121/).fill('3');
	await expect(async () => {
		await lab.getByRole('button', { name: /047F/ }).click();
		await expect(lab.getByText('S4 · Praca')).toHaveAttribute('aria-current', 'step', {
			timeout: 1000
		});
	}).toPass();
	await expect(lab.getByTestId('drive-hz')).toHaveText('50.0 Hz', { timeout: 15_000 });
	await lab.getByRole('button', { name: /047E/ }).click();
	await expect(lab.getByRole('alert')).toContainText('F30002', { timeout: 5000 });
});

test('PROFIdrive lesson: the reference program runs the drive', async ({ page }) => {
	page.on('dialog', (d) => d.accept());
	await page.goto('/editor/lesson-drive-profidrive');
	await page.getByRole('button', { name: 'Show solution' }).click();
	await page.getByRole('button', { name: 'Check solution' }).click();
	await expect(page.getByText('Passed!')).toBeVisible({ timeout: 20_000 });
	await page.getByRole('button', { name: 'Process' }).click();
	await expect(page.getByText('S1 · Blokada załączenia', { exact: true })).toBeVisible();
});
