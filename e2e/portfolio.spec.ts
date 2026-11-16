import { expect, test } from '@playwright/test';

test('a role narrows the path; a passed lesson lands in the portfolio with its code', async ({
	page
}) => {
	await page.goto('/learn', { waitUntil: 'networkidle' });
	await page.getByRole('button', { name: /PLC programmer/ }).click();
	await expect(page.getByText(/done: 0 \/ 38/)).toBeVisible();
	await expect(
		page.getByRole('link', { name: /Commissioning: a conveyor with a sensor/ })
	).toHaveCount(0);
	await page.getByRole('button', { name: 'Whole path' }).click();
	await expect(page.getByText(/done: 0 \/ 83/)).toBeVisible();

	await page.goto('/learn/portfolio', { waitUntil: 'networkidle' });
	await expect(page.getByText(/No lessons passed yet/)).toBeVisible();

	await page.goto('/editor/lesson-first-rung', { waitUntil: 'networkidle' });
	page.once('dialog', (d) => d.accept());
	await page.getByRole('button', { name: 'Show solution' }).click();
	await page.getByRole('button', { name: 'Check solution' }).click();
	await expect(page.getByText('Passed!')).toBeVisible();
	await expect
		.poll(() => page.evaluate(() => localStorage.getItem('plcsim:project:lesson-first-rung')))
		.toContain('rungs');

	await page.goto('/learn/portfolio', { waitUntil: 'networkidle' });
	await page.getByLabel('Your name').fill('Jan Kowalski');
	const article = page.getByRole('article', { name: 'Portfolio' });
	await expect(
		article.getByRole('heading', { name: 'Portfolio PLC — Jan Kowalski' })
	).toBeVisible();
	await expect(article).toContainText('✓ Lampka podąża za przyciskiem');
	await expect(article.locator('pre')).toContainText(':=');

	const md = page.waitForEvent('download');
	await page.getByRole('button', { name: 'Download Markdown' }).click();
	expect((await md).suggestedFilename()).toBe('portfolio-plc-Jan_Kowalski.md');
});
