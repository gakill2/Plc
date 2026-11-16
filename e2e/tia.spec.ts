import { expect, test } from '@playwright/test';

test('a lesson shows how it looks in TIA Portal and links to the import guide', async ({
	page
}) => {
	await page.goto('/editor/lesson-fb-motor', { waitUntil: 'networkidle' });
	await page.evaluate(() => localStorage.setItem('plcsim:tips-off', '1'));
	await page.getByText('How it looks in TIA Portal').click();
	await expect(page.getByText(/multi-instancja/).first()).toBeVisible();
	await page.getByRole('link', { name: /PLCSIM import/ }).click();
	await expect(
		page.getByRole('heading', { name: /From the simulator to TIA Portal/ })
	).toBeVisible();
	await expect(page.getByText(/Generate blocks from source/)).toBeVisible();
});

test('the SCL export brings a tag table TIA Portal can import', async ({ page }) => {
	await page.goto('/editor/lesson-fb-motor', { waitUntil: 'networkidle' });
	const files: string[] = [];
	page.on('download', (d) => files.push(d.suggestedFilename()));
	await page.getByLabel('Export').selectOption('scl');
	await expect.poll(() => files.length).toBe(3);
	expect(files.some((f) => f.endsWith('_PLCTags.xlsx'))).toBe(true);
});
