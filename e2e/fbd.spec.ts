import { expect, test } from '@playwright/test';
import { openEditor } from './helpers';

test('FBD lesson: build an SR flip-flop with a negated input', async ({ page }) => {
	page.on('dialog', (d) => d.accept());
	await page.goto('/editor/lesson-tank-fbd');
	await page.evaluate(() => localStorage.setItem('plcsim:tips-off', '1'));
	await expect(async () => {
		await page.getByLabel('Wejście networku 1').click();
		await page
			.getByRole('toolbar', { name: 'Bloki FBD' })
			.getByRole('button', { name: 'SR', exact: true })
			.click();
		await expect(page.getByLabel('Instancja SR')).toBeVisible({ timeout: 1000 });
	}).toPass();
	await page.getByLabel('SR S1').fill('Low');
	await page.getByLabel('SR R').fill('High');
	await page.getByRole('button', { name: 'Wejście S1 bloku SR' }).click();
	await page.getByRole('button', { name: '¬ negacja' }).click();
	await page.getByRole('button', { name: 'Sprawdź rozwiązanie' }).click();
	await expect(page.getByText('Zaliczone!')).toBeVisible({ timeout: 30_000 });
});

test('FBD in an own project: the demo runs and shows the signal flow', async ({ page }) => {
	await openEditor(page);
	await page.evaluate(() => localStorage.setItem('plcsim:tips-off', '1'));
	await expect(async () => {
		await page.getByRole('button', { name: 'FBD', exact: true }).click();
		await expect(page.getByLabel('Instancja TON')).toHaveValue('Timer1', { timeout: 1000 });
	}).toPass();
	await page.getByRole('button', { name: '▶ Run' }).click();
	await expect(page.getByText(/Online — zielone linie/)).toBeVisible();
	await page.getByRole('button', { name: 'Pokaż wygenerowany ST' }).click();
	await expect(page.getByLabel('Wygenerowany ST')).toContainText('Timer1(IN := Q0.0, PT := T#2s);');
});
