import { expect, test } from '@playwright/test';

test('a foreman ticket opens a lesson, is graded and unlocks the next one', async ({ page }) => {
	page.on('dialog', (d) => d.accept());
	await page.goto('/work');
	await expect(page.getByTestId('career')).toHaveText('Praktykant');
	await expect(page.getByText('#02').locator('..').getByLabel('zablokowane')).toBeVisible();

	await page.getByRole('link', { name: /Lampka kontrolna przy sprężarce/ }).click();
	const card = page.getByRole('article', { name: 'Zgłoszenie' });
	await expect(card.getByText('Zgłoszenie #01')).toBeVisible();

	await page.getByRole('button', { name: 'Pokaż rozwiązanie' }).click();
	await page.getByRole('button', { name: 'Sprawdź rozwiązanie' }).click();
	const debrief = page.getByTestId('debrief');
	await expect(debrief).toContainText('Zgłoszenie zamknięte!');
	await expect(debrief.getByLabel('1 z 3 gwiazdek')).toBeVisible();
	await expect(debrief).toContainText('Rada starszego kolegi');

	await page.goto('/work');
	await expect(page.getByRole('link', { name: /Prasa: sterowanie oburęczne/ })).toBeVisible();
	await expect(page.getByText('Zamknięte: 1 / 22')).toBeVisible();
});

test('a tip pops up on the first timer, glossary terms explain themselves', async ({ page }) => {
	page.on('dialog', (d) => d.accept());
	await page.goto('/learn/basics/timery');
	const term = page.locator('abbr', { hasText: /^TON$/ }).first();
	await term.focus();
	await expect(
		page.getByRole('tooltip').filter({ hasText: 'Timer On-delay' }).first()
	).toBeVisible();

	await page.goto('/editor/lesson-traffic-light');
	await page.getByRole('button', { name: 'Pokaż rozwiązanie' }).click();
	const tip = page.getByRole('complementary', { name: 'Podpowiedź' });
	await expect(tip).toBeVisible();
	const first = await tip.locator('p').nth(1).textContent();
	await tip.getByRole('button', { name: 'Rozumiem' }).click();
	await expect(tip.locator('p').nth(1)).not.toHaveText(first ?? '');
	await tip.getByRole('button', { name: 'Wyłącz podpowiedzi' }).click();
	await expect(tip).toBeHidden();
});
