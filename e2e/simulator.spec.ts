import { expect, test } from '@playwright/test';
import { openEditor, output, pressDevice } from './helpers';

test('landing page leads to the demo', async ({ page }) => {
	await page.goto('/');
	await expect(page.getByRole('heading', { name: 'PLC Sim' })).toBeVisible();
	await page.getByRole('link', { name: 'Open the demo' }).click();
	await expect(page).toHaveURL(/\/editor\/demo$/);
	await expect(page.getByText('Network 1')).toBeVisible();
});

test('demo: start the motor from the circuit, watch it in the ladder', async ({ page }) => {
	await openEditor(page);
	await page.getByRole('button', { name: '▶ Run' }).click();
	await expect(page.getByRole('status', { name: 'PLC status' })).toHaveText('RUN');

	await page.getByRole('button', { name: 'Circuit' }).click();
	await pressDevice(page, 'Start');
	await expect(output(page, 'Q0.0')).toHaveAccessibleName('Q0.0 on');
	await expect(page.getByRole('img', { name: 'Motor running' })).toBeVisible();

	await page.getByRole('button', { name: 'Program', exact: true }).click();
	await expect(page.getByText('Online — live values from the PLC')).toBeVisible();

	await page.getByRole('button', { name: 'Circuit' }).click();
	await pressDevice(page, 'Stop');
	await expect(output(page, 'Q0.0')).toHaveAccessibleName('Q0.0 off');

	await page.getByRole('button', { name: '■ Stop' }).click();
	await expect(page.getByRole('status', { name: 'PLC status' })).toHaveText('STOP');
});

test('watch table: forcing an output overrides the program', async ({ page }) => {
	await openEditor(page);
	await page.getByRole('button', { name: '▶ Run' }).click();
	await page.getByRole('button', { name: 'Watch' }).click();
	// "Running" (Q0.1) is driven by a timer of the motor — the program keeps it off
	await page.locator('tbody tr').nth(4).getByRole('button', { name: 'F1' }).click();
	await expect(output(page, 'Q0.1')).toHaveAccessibleName('Q0.1 on');
	await expect(page.getByRole('button', { name: 'F × 1' })).toBeVisible();
	await page.getByRole('button', { name: /Release all forces/ }).click();
	await expect(output(page, 'Q0.1')).toHaveAccessibleName('Q0.1 off');
});

test('structured text: errors are shown, a fixed program runs', async ({ page }) => {
	await openEditor(page);
	await page.getByRole('button', { name: 'Structured Text' }).click();
	const editor = page.locator('.cm-content');
	await editor.click();
	await page.keyboard.press('ControlOrMeta+End');
	await page.keyboard.type('\nLamp := Missing;');
	await expect(page.getByText(/Line 19: Unknown variable "Lamp"/)).toBeVisible();

	await page.getByRole('button', { name: '▶ Run' }).click();
	await expect(page.getByRole('status', { name: 'PLC status' })).toHaveText('STOP'); // blocked by the error

	await editor.click(); // focus went to the Run button
	await page.keyboard.press('ControlOrMeta+A');
	await page.keyboard.type('Motor := Start AND NOT Stop;');
	await expect(page.getByText('Program compiles — ready to run.')).toBeVisible();
	await page.getByRole('button', { name: '▶ Run' }).click();
	await expect(page.getByRole('status', { name: 'PLC status' })).toHaveText('RUN');
});

test('undo and redo restore program edits', async ({ page }) => {
	await openEditor(page);
	const comment = page.getByLabel('Network 1 comment');
	const original = await comment.inputValue();
	await comment.fill('Changed comment');
	await page.waitForTimeout(700); // let the edit settle into its own undo step
	await page.locator('body').click({ position: { x: 5, y: 300 } });
	await page.getByRole('button', { name: 'Undo' }).click();
	await expect(comment).toHaveValue(original);
	await page.getByRole('button', { name: 'Redo' }).click();
	await expect(comment).toHaveValue('Changed comment');
});
