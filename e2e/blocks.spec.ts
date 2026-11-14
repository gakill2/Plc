import { expect, test } from '@playwright/test';

test('ladder PID block lesson and the block library', async ({ page }) => {
	page.on('dialog', (d) => d.accept());
	await page.goto('/editor/lesson-oven-pid-lad');
	await page.evaluate(() => localStorage.setItem('plcsim:tips-off', '1'));
	await page.getByRole('button', { name: 'Pokaż rozwiązanie' }).click();
	await expect(page.getByLabel('PID_1 KP')).toHaveValue('80.0');
	await page.getByRole('button', { name: 'Sprawdź rozwiązanie' }).click();
	await expect(page.getByText('Zaliczone!')).toBeVisible({ timeout: 30_000 });

	// insert another block from the palette
	await page.getByLabel('Insert a function block').selectOption('SCALE');
	await expect(page.getByLabel('SCALE_1 IN', { exact: true })).toBeVisible();

	// own block in the library
	await page.getByRole('button', { name: 'Blocks', exact: true }).click();
	await page.getByRole('button', { name: 'Wstaw przykładowy blok' }).click();
	await expect(page.getByRole('paragraph').filter({ hasText: 'Valve' })).toBeVisible();
	await page.getByRole('button', { name: 'Program', exact: true }).click();
	await page.getByLabel('Insert a function block').selectOption('Valve');
	await expect(page.getByLabel('Valve_1 Open', { exact: true })).toBeVisible();
});

test('exports a lesson solution as TIA Portal SCL and PLCopen XML', async ({ page }) => {
	page.on('dialog', (d) => d.accept());
	await page.goto('/editor/lesson-oven-pid-lad');
	await page.evaluate(() => localStorage.setItem('plcsim:tips-off', '1'));
	await page.getByRole('button', { name: 'Pokaż rozwiązanie' }).click();
	await expect(page.getByLabel('PID_1 KP')).toHaveValue('80.0');

	const scl = page.waitForEvent('download');
	await page.getByLabel('Export').selectOption('scl');
	const sclFile = await scl;
	expect(sclFile.suggestedFilename()).toMatch(/\.scl$/);
	const text = await (await sclFile.createReadStream()).toArray();
	const source = Buffer.concat(text).toString();
	expect(source).toContain('FUNCTION_BLOCK "PID"');
	expect(source).toContain('ORGANIZATION_BLOCK "Main_OB1"');

	const xml = page.waitForEvent('download');
	await page.getByLabel('Export').selectOption('xml');
	const xmlFile = await xml;
	expect(xmlFile.suggestedFilename()).toMatch(/\.xml$/);
	const doc = Buffer.concat(await (await xmlFile.createReadStream()).toArray()).toString();
	expect(doc).toContain('<pou name="PID" pouType="functionBlock">');
});

test('arrays, RETAIN and a cyclic interrupt: the oven filter lesson', async ({ page }) => {
	page.on('dialog', (d) => d.accept());
	await page.goto('/editor/lesson-oven-filter');
	await page.evaluate(() => localStorage.setItem('plcsim:tips-off', '1'));
	await page.getByRole('button', { name: 'Pokaż rozwiązanie' }).click();
	await page.getByRole('button', { name: 'Sprawdź rozwiązanie' }).click();
	await expect(page.getByText('Zaliczone!')).toBeVisible({ timeout: 30_000 });
	await page.getByRole('button', { name: '▶ Run' }).click();
	await expect(page.getByLabel('Cyclic interrupt runs')).toBeVisible();
});
