import { expect, test } from '@playwright/test';

test('alarm lesson: rationalized alarms pass, the flood fails', async ({ page }) => {
	test.setTimeout(120_000);
	page.on('dialog', (d) => d.accept());
	await page.goto('/editor/lesson-alarm-flood');
	await page.evaluate(() => localStorage.setItem('plcsim:tips-off', '1'));
	await page.getByRole('button', { name: 'Check solution' }).click();
	await expect(page.getByText(/✗\s*Normalna partia: ani jednego alarmu/)).toBeVisible({
		timeout: 60_000
	});

	await page.getByRole('button', { name: 'Show solution' }).click();
	await expect(async () => {
		await page.getByRole('button', { name: 'HMI', exact: true }).click();
		await page.getByRole('button', { name: /^Alarmy \(/ }).click();
		await expect(page.getByLabel('Wskaźniki alarmów')).toBeVisible({ timeout: 1000 });
	}).toPass();
	await expect(
		page.getByLabel('Priorytet alarmu Zbiornik przepełniony (wyłącznik HH)')
	).toHaveValue('1');
	await expect(page.getByLabel('Tłumienie Mieszadło nie pracuje')).toHaveValue('NotMixing');

	await page.getByRole('button', { name: 'Check solution' }).click();
	await expect(page.getByText('Passed!')).toBeVisible({ timeout: 60_000 });
});
