import { expect, test } from '@playwright/test';
import { openEditor } from './helpers';

test('STL lesson: the precedence bug fails, the bracket fixes it', async ({ page }) => {
	page.on('dialog', (d) => d.accept());
	await page.goto('/editor/lesson-stl-pump');
	await page.evaluate(() => localStorage.setItem('plcsim:tips-off', '1'));
	await expect(page.getByText(/Statement List \(STL\/AWL\)/)).toBeVisible();
	await page.getByRole('button', { name: 'Check solution' }).click();
	await expect(page.getByText(/✗\s*Stop wygrywa/)).toBeVisible({ timeout: 30_000 });
	await page.getByRole('button', { name: 'Show solution' }).click();
	await page.getByRole('button', { name: 'Check solution' }).click();
	await expect(page.getByText('Passed!')).toBeVisible({ timeout: 30_000 });
});

test('STL in an own project: the demo runs with STA / RLO / ACCU1 status', async ({ page }) => {
	await openEditor(page);
	await page.evaluate(() => localStorage.setItem('plcsim:tips-off', '1'));
	await expect(async () => {
		await page.getByRole('button', { name: 'STL', exact: true }).click();
		await expect(page.getByText(/NETWORK 1/).first()).toBeVisible({ timeout: 1000 });
	}).toPass();
	await page.getByRole('button', { name: '▶ Run' }).click();
	const status = page.getByRole('table', { name: 'Program status' });
	await expect(status).toBeVisible();
	await expect(status.getByRole('columnheader', { name: 'RLO' })).toBeVisible();
	await page.getByRole('button', { name: 'Show ST' }).click();
	await expect(page.getByLabel('Generated Structured Text')).toContainText('_T1(IN :=');
});
