import { expect, test } from '@playwright/test';

test('a programming error stops the CPU and shows up in the diagnostic buffer; OB121 fixes it', async ({
	page
}) => {
	page.on('dialog', (d) => d.accept());
	await page.goto('/editor/lesson-recipe-index');
	await page.evaluate(() => localStorage.setItem('plcsim:tips-off', '1'));
	await expect(page.getByRole('status', { name: 'PLC status' })).toHaveText('STOP');
	await page.getByRole('button', { name: '▶ Run' }).click();
	await expect(page.getByRole('status', { name: 'PLC status' })).toHaveText('FAULT');
	await page.getByRole('button', { name: 'Diagnostics', exact: true }).click();
	await expect(page.getByRole('table', { name: 'Bufor diagnostyczny' })).toContainText(
		'indeks poza zakresem tablicy temps[1..3]'
	);
	await page.getByRole('button', { name: 'Pokaż rozwiązanie' }).click();
	await page.getByRole('button', { name: 'Sprawdź rozwiązanie' }).click();
	await expect(page.getByText('Zaliczone!')).toBeVisible({ timeout: 30_000 });
});
