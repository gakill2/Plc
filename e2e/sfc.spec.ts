import { expect, test } from '@playwright/test';

test('SFC: the demo chart runs, active steps light up, edits compile', async ({ page }) => {
	await page.goto('/editor/demo');
	await page.evaluate(() => localStorage.setItem('plcsim:tips-off', '1'));
	await page.reload();
	await page.getByRole('button', { name: 'SFC', exact: true }).click();
	await expect(page.getByTestId('sfc-step')).toHaveCount(3);

	await page.getByRole('button', { name: '▶ Run' }).click();
	await expect(page.getByTestId('sfc-step').first().locator('[aria-current="step"]')).toBeVisible();
	await page.getByRole('button', { name: '■ Stop' }).click();

	// a broken condition is reported against the transition
	await page.getByLabel('Warunek przejścia T1').fill('I0.0 AND');
	await expect(page.getByRole('region', { name: /Problems/ })).toContainText('przejście 1');
	await page.getByLabel('Warunek przejścia T1').fill('I0.0');
	await expect(page.getByRole('region', { name: /Problems \(0\)/ })).toBeVisible();

	await page.getByRole('button', { name: 'Pokaż wygenerowany ST' }).click();
	await expect(page.getByLabel('Wygenerowany ST')).toContainText('X_Idle');
});

test('SFC lesson: the reference chart passes the drilling tests', async ({ page }) => {
	page.on('dialog', (d) => d.accept());
	await page.goto('/editor/lesson-sfc-drilling');
	await expect(page.getByTestId('sfc-step')).toHaveCount(2);
	await page.getByRole('button', { name: 'Pokaż rozwiązanie' }).click();
	await expect(page.getByTestId('sfc-step')).toHaveCount(6);
	await page.getByRole('button', { name: 'Sprawdź rozwiązanie' }).click();
	await expect(page.getByText('Zaliczone!')).toBeVisible({ timeout: 20_000 });
});
