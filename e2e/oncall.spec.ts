import { expect, test } from '@playwright/test';

test('on-call: a broken sensor is found, a wrong repair costs time', async ({ page }) => {
	await page.goto('/oncall');
	await page.evaluate(() =>
		localStorage.setItem(
			'plcsim:oncall',
			JSON.stringify({
				current: {
					machine: 'p7',
					incident: 'p7-sensor',
					startedAt: Date.now(),
					wrong: 0,
					tried: []
				},
				history: []
			})
		)
	);
	await page.reload();
	await page.getByRole('link', { name: /Wróć do wezwania: Przenośnik P7/ }).click();

	const panel = page.getByRole('region', { name: 'Dyżur' });
	await expect(panel).toContainText('Zielona lampka „praca” świeci');

	// the sensor reports a part all the time
	await page.getByRole('button', { name: 'Test I/O' }).click();
	await page.getByRole('button', { name: '▶ Run' }).click();

	await panel.getByLabel('Uszkodzony element').selectOption('H1');
	await panel.getByLabel('Usterka').selectOption({ label: 'spalona żarówka / sygnalizator' });
	await panel.getByRole('button', { name: 'Naprawiam' }).click();
	await expect(panel).toContainText('+5 min przestoju');

	await panel.getByLabel('Uszkodzony element').selectOption('B1');
	await panel.getByLabel('Usterka').selectOption({ label: 'zgłasza obiekt cały czas' });
	await panel.getByRole('button', { name: 'Naprawiam' }).click();
	const result = page.getByTestId('oncall-result');
	await expect(result).toContainText('Maszyna naprawiona!');
	await expect(result.getByLabel('2 z 3 gwiazdek')).toBeVisible();

	await page.goto('/oncall');
	await expect(page.getByText('Wezwania: 1')).toBeVisible();
});
