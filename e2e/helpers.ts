import { expect, type Page } from '@playwright/test';

/** Opens a fresh project (unique id) in the editor and waits for the PLC worker. */
export async function openEditor(page: Page, id = `e2e-${Math.random().toString(36).slice(2)}`) {
	await page.goto(`/editor/${id}`);
	await expect(page.getByRole('status', { name: 'PLC status' })).toHaveText('STOP');
	return id;
}

/** Holds a push button of the circuit view for a moment. */
export async function pressDevice(page: Page, label: string, ms = 200) {
	const button = page.getByRole('button', { name: `Press ${label}` });
	await button.dispatchEvent('pointerdown', { pointerId: 1 });
	await page.waitForTimeout(ms);
	await button.dispatchEvent('pointerup', { pointerId: 1 });
}

export const output = (page: Page, address: string) =>
	page.getByLabel(new RegExp(`^${address.replace('.', '\\.')} (on|off)$`));
