import { expect, test } from '@playwright/test';
import { openEditor } from './helpers';

test('report: ladder, symbols and I/O list ready for printing', async ({ page }) => {
	await openEditor(page);
	await page.getByRole('link', { name: 'Report' }).click();
	await expect(page).toHaveURL(/\/report$/);
	await expect(page.getByLabel('Report title')).toHaveValue('Motor demo');
	await expect(page.getByRole('heading', { name: 'Program' })).toBeVisible();
	await expect(page.getByText('Network 1')).toBeVisible();

	const symbols = page.locator('section', {
		has: page.getByRole('heading', { name: 'Symbol table' })
	});
	await expect(symbols.getByRole('row', { name: /Start I0.0/ })).toBeVisible();
	const io = page.locator('section', { has: page.getByRole('heading', { name: 'I/O list' }) });
	await expect(io.getByRole('row', { name: /Q0.0 Motor/ })).toBeVisible();

	await page.getByLabel('Author').fill('Jan Kowalski 123456');
	const download = page.waitForEvent('download');
	await symbols.getByRole('button', { name: 'PNG' }).click();
	expect((await download).suggestedFilename()).toBe('Motor_demo-symbols.png');

	await page.getByRole('checkbox', { name: 'Program' }).uncheck();
	await expect(page.getByRole('heading', { name: 'Program' })).toHaveCount(0);
	await page.reload();
	await expect(page.getByLabel('Author')).toHaveValue('Jan Kowalski 123456');
});
