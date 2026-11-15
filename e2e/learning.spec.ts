import { expect, test } from '@playwright/test';
import { openEditor } from './helpers';

test('explain panel and scan-cycle debugger', async ({ page }) => {
	await openEditor(page);
	await page.getByText('Network 1').click();
	const explain = page.locator('section', { has: page.getByRole('button', { name: /Explain/ }) });
	await expect(explain).toContainText(
		'Motor (Q0.0) = 1 gdy (Start (I0.0) LUB Motor (Q0.0)) I NIE Stop (I0.1)'
	);

	await page.getByRole('button', { name: '▶ Run' }).click();
	await expect(explain.getByRole('status')).toContainText(
		'Start (I0.0) = 0 — styk NO jest otwarty'
	);

	await page.getByRole('button', { name: 'Debug' }).click();
	await page.getByRole('button', { name: /Zrób zdjęcie/ }).click();
	await expect(page.getByText(/krok 1 \/ \d+/)).toBeVisible();
	const step = page.getByRole('status').filter({ hasText: /na stos/ });
	await expect(step).toContainText('Wstaw 1 na stos — zasilanie z lewej szyny');
	await page.keyboard.press('ArrowRight');
	await expect(page.getByText(/krok 2 \//)).toBeVisible();
	await page
		.getByRole('list', { name: 'Instrukcje cyklu' })
		.getByRole('button', { name: /AND I0\.0/ })
		.click();
	await expect(page.getByText('AND: RLO 1 AND Start (I0.0) = 0 → 0.')).toBeVisible();
});

test('production line plant runs a part through the drill', async ({ page }) => {
	await page.goto('/learn', { waitUntil: 'networkidle' });
	await page.getByRole('link', { name: /Proces: stacja wiercenia/ }).click();
	await expect(page.getByRole('list', { name: 'Step by step' })).toBeVisible();
	page.once('dialog', (d) => d.accept());
	await page.getByRole('button', { name: 'Show solution' }).click();
	await expect(page.getByText(/Step by step · 8\/10/)).toBeVisible();

	await page.getByRole('button', { name: '▶ Run' }).click();
	await page.getByRole('button', { name: 'Process' }).click();
	await page.getByRole('button', { name: '+ Part', exact: true }).click();
	// press Start through the I/O panel (I1.0)
	await page.getByRole('button', { name: 'Circuit' }).click();
	await page
		.getByRole('button', { name: 'Press Start' })
		.dispatchEvent('pointerdown', { pointerId: 1 });
	await page.waitForTimeout(150);
	await page
		.getByRole('button', { name: 'Press Start' })
		.dispatchEvent('pointerup', { pointerId: 1 });
	await page.getByRole('button', { name: 'Process' }).click();
	await expect(page.getByText(/good 1/)).toBeVisible({ timeout: 25_000 });
	await expect(page.getByRole('alert')).toHaveCount(0);
});

test('find-the-bug lesson and the review quiz', async ({ page }) => {
	await page.goto('/learn', { waitUntil: 'networkidle' });
	await page.getByRole('link', { name: /Znajdź błąd: lampka z dwóch miejsc/ }).click();
	await expect(page.getByText('🐞 Find the bug · logic')).toBeVisible();
	await page.getByRole('button', { name: 'Check solution' }).click();
	await expect(page.getByText(/✗\s*Każdy przycisk zapala lampkę/)).toBeVisible();
	await expect(
		page.getByText(/Po kroku „tylko Button1”: Q0.0 powinno być 1, a jest 0/)
	).toBeVisible();

	await page.goto('/learn/review', { waitUntil: 'networkidle' });
	await expect(page.getByText('Pytanie 1 / 5')).toBeVisible();
	for (let i = 0; i < 5; i++) {
		await page
			.getByRole('region', { name: 'Pytanie sprawdzające' })
			.getByRole('button')
			.first()
			.click();
		await page.getByRole('button', { name: /^(Następne pytanie →|Wynik)$/ }).click();
	}
	await expect(page.getByText(/^\d \/ 5$/)).toBeVisible();
	await expect(page.getByRole('button', { name: 'Nowa powtórka' })).toBeVisible();
});

test('capstone: FAT protocol and code review', async ({ page }) => {
	test.setTimeout(90_000);
	await page.goto('/learn', { waitUntil: 'networkidle' });
	await page.getByRole('link', { name: /Projekt końcowy: mieszalnik MX2/ }).click();
	await expect(page.getByText(/🏁 Final project/)).toBeVisible();
	await page.getByRole('button', { name: 'Check solution' }).click();
	await expect(page.getByText(/FAT protocol · 0\/7/)).toBeVisible({ timeout: 30_000 });
	await page.getByText('Code review').click();
	await expect(page.getByText(/TODO/).first()).toBeVisible();

	page.once('dialog', (d) => d.accept());
	await page.getByRole('button', { name: 'Show solution' }).click();
	await page.getByRole('button', { name: 'Check solution' }).click();
	await expect(page.getByText('Passed!')).toBeVisible({ timeout: 60_000 });
	await expect(page.getByText(/FAT protocol · 7\/7/)).toBeVisible();
});
