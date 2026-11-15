import { expect, test } from '@playwright/test';

test('versions: find the undocumented change, revert it, save a version', async ({ page }) => {
	test.setTimeout(90_000);
	page.on('dialog', (d) => d.accept());
	await page.goto('/editor/lesson-change-management');
	await page.evaluate(() => localStorage.setItem('plcsim:tips-off', '1'));
	await expect(async () => {
		await page.getByRole('button', { name: 'Versions', exact: true }).click();
		await expect(page.getByRole('list', { name: 'Versions' })).toBeVisible({ timeout: 1000 });
	}).toPass();
	const diff = page.getByRole('region', { name: 'Comparison' });
	await expect(diff).toContainText('v1.1 → now');
	await expect(diff).toContainText(
		'− moveTime(IN := step >= 10 AND step <= 40 AND step = lastStep, PT := T#2s);'
	);
	await expect(diff).toContainText(
		'+ moveTime(IN := step >= 10 AND step <= 40 AND step = lastStep, PT := T#20s);'
	);

	await page.getByRole('button', { name: 'Show solution' }).click();
	await page.getByRole('button', { name: 'Versions', exact: true }).click();
	await expect(diff).toContainText('no differences');
	await page.getByLabel('Version name, e.g. v1.3').fill('v1.2');
	await page
		.getByLabel('What changed and why (change order)')
		.fill('Cofnięta nocna zmiana: nadzór 2 s, AirOk.');
	await page.getByRole('button', { name: 'Save version' }).click();
	await expect(page.getByRole('list', { name: 'Versions' })).toContainText('v1.2');

	await page.getByRole('button', { name: 'Check solution' }).click();
	await expect(page.getByText('Passed!')).toBeVisible({ timeout: 60_000 });
	await expect(page.getByText(/Step by step · 5\/5/)).toBeVisible();
});
