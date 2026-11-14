import { expect, test } from '@playwright/test';
import { openEditor, pressDevice } from './helpers';

test('HMI: the demo panel shows the machine and raises a warning to acknowledge', async ({
	page
}) => {
	await openEditor(page);
	await page.getByRole('button', { name: 'HMI', exact: true }).click();
	await expect(page.getByRole('application', { name: 'Panel HMI' })).toBeVisible();
	await expect(page.getByRole('button', { name: '+ Przycisk' })).toBeVisible(); // edit mode

	await page.getByRole('button', { name: '▶ Run' }).click();
	await expect(page.getByText('● Panel online')).toBeVisible();
	await page.getByRole('button', { name: 'Circuit' }).click();
	for (let i = 0; i < 5; i++) {
		await pressDevice(page, 'Start', 80);
		await pressDevice(page, 'Stop', 80);
	}
	await expect(page.getByLabel('1 unacknowledged alarms')).toBeVisible();
	await page.getByRole('button', { name: /^HMI/ }).click();
	await expect(page.getByRole('img', { name: 'HMI Serwis on' })).toBeVisible();
	await page.getByRole('button', { name: 'ACK', exact: true }).click();
	await expect(page.getByLabel('1 unacknowledged alarms')).toHaveCount(0);
});

test('commissioning: faulty wiring fails, the corrected circuit passes', async ({ page }) => {
	await page.goto('/editor/lesson-commissioning-conveyor', { waitUntil: 'networkidle' });
	await expect(page.getByText('🔧 Uruchomienie')).toBeVisible();
	await page.getByRole('button', { name: 'Test I/O' }).click();
	await expect(page.getByRole('heading', { name: 'Test sygnałów (I/O check)' })).toBeVisible();
	await expect(page.locator('tr', { hasText: 'BeltFeedback' })).toContainText('— nic —');

	await page.getByRole('button', { name: 'Sprawdź rozwiązanie' }).click();
	await expect(page.getByText(/✗\s*Start i Stop sterują taśmą/)).toBeVisible();

	page.once('dialog', (d) => d.accept());
	await page.getByRole('button', { name: 'Pokaż rozwiązanie' }).click();
	await page.getByRole('button', { name: 'Sprawdź rozwiązanie' }).click();
	await expect(page.getByText('Zaliczone!')).toBeVisible();
	await page.getByRole('button', { name: 'Test I/O' }).click();
	await expect(page.locator('tr', { hasText: 'BeltFeedback' })).toContainText('K1 (FB)');
});

test('VFD: the inverter follows RUN and the speed word', async ({ page }) => {
	await page.goto('/editor/lesson-commissioning-vfd', { waitUntil: 'networkidle' });
	page.once('dialog', (d) => d.accept());
	await page.getByRole('button', { name: 'Pokaż rozwiązanie' }).click();
	await page.getByRole('button', { name: '▶ Run' }).click();
	await page.getByRole('button', { name: 'Circuit' }).click();
	await pressDevice(page, 'S1');
	await expect(page.getByRole('img', { name: /^U1 35\.0 Hz$/ })).toBeVisible({ timeout: 8000 });
	await page.getByRole('button', { name: 'Trip' }).click();
	await expect(page.getByRole('img', { name: /U1 .*F001/ })).toBeVisible();
	await expect(page.getByRole('img', { name: 'H2 on' })).toBeVisible();
});
