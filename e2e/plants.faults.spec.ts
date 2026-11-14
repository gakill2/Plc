import { expect, test } from '@playwright/test';

test('pneumatic press: lesson passes, a plant fault is injected from the Process view', async ({
	page
}) => {
	page.on('dialog', (d) => d.accept());
	await page.goto('/editor/lesson-pneumatic-press');
	await page.evaluate(() => localStorage.setItem('plcsim:tips-off', '1'));
	await page.getByRole('button', { name: 'Pokaż rozwiązanie' }).click();
	await page.getByRole('button', { name: 'Sprawdź rozwiązanie' }).click();
	await expect(page.getByText('Zaliczone!')).toBeVisible({ timeout: 30_000 });

	await page.getByRole('button', { name: '▶ Run' }).click();
	await page.getByRole('button', { name: 'Process', exact: true }).click();
	await expect(page.getByText('powietrze 6 bar', { exact: true })).toBeVisible();
	await page.getByText('Czujniki i usterki', { exact: true }).click();
	await page.getByLabel('Brak sprężonego powietrza').check();
	await expect(page.getByText('BRAK POWIETRZA', { exact: true })).toBeVisible();
	await page.getByLabel('Usterka AirOk').selectOption('stuck1');
	await expect(page.getByText('2 aktywne')).toBeVisible();
});

test('batch mixer lesson passes with noisy signals', async ({ page }) => {
	page.on('dialog', (d) => d.accept());
	await page.goto('/editor/lesson-mixer-batch');
	await page.evaluate(() => localStorage.setItem('plcsim:tips-off', '1'));
	await page.getByRole('button', { name: 'Pokaż rozwiązanie' }).click();
	await page.getByRole('button', { name: 'Sprawdź rozwiązanie' }).click();
	await expect(page.getByText('Zaliczone!')).toBeVisible({ timeout: 30_000 });
	await page.getByRole('button', { name: 'Process', exact: true }).click();
	await expect(page.getByText('realistyczne sygnały', { exact: true })).toBeVisible();
});
