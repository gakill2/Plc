import { expect, test } from '@playwright/test';
import { openEditor } from './helpers';

test('lesson: fail, show the solution, pass, get the tick', async ({ page }) => {
	await page.goto('/learn', { waitUntil: 'networkidle' });
	await page.getByRole('link', { name: /Pierwszy szczebel/ }).click();
	await expect(page.getByText('Krok po kroku · 0/5')).toBeVisible();
	await page.getByRole('button', { name: 'Sprawdź rozwiązanie' }).click();
	await expect(page.getByText(/✗\s*Lampka podąża za przyciskiem/)).toBeVisible();

	page.once('dialog', (d) => d.accept());
	await page.getByRole('button', { name: 'Pokaż rozwiązanie' }).click();
	await page.getByRole('button', { name: 'Sprawdź rozwiązanie' }).click();
	await expect(page.getByText('Zaliczone!')).toBeVisible();
	await expect(page.getByText('Krok po kroku · 5/5')).toBeVisible();

	await page.goto('/learn', { waitUntil: 'networkidle' });
	await expect(page.getByText(/ukończone: 1 \/ 29/)).toBeVisible();
	await expect(page.getByRole('link', { name: /Kontynuuj naukę/ })).toBeVisible();
});

test('projects: create, rename, find in the list, delete', async ({ page }) => {
	await page.goto('/projects', { waitUntil: 'networkidle' }); // wait for hydration
	await page.getByRole('button', { name: '+ New project' }).click();
	await expect(page).toHaveURL(/\/editor\/p/);
	await page.getByLabel('Project name').fill('Garage door');
	await page.waitForTimeout(100);

	await page.goto('/projects', { waitUntil: 'networkidle' });
	const item = page.getByRole('listitem').filter({ hasText: 'Garage door' });
	await expect(item).toBeVisible();
	page.once('dialog', (d) => d.accept());
	await item.getByRole('button', { name: 'Delete' }).click();
	await expect(page.getByText('Garage door')).toHaveCount(0);
});

test('share link opens a copy of the project', async ({ page }) => {
	await openEditor(page);
	await page.getByLabel('Project name').fill('Shared conveyor');
	await page.getByLabel('Network 1 comment').fill('Hello from the share link');
	await page.getByRole('button', { name: 'Share' }).click();
	const link = await page.getByLabel('Share link').inputValue();
	expect(link).toMatch(/\/share#[A-Za-z0-9_-]+$/);

	await page.goto(link);
	await expect(page).toHaveURL(/\/editor\/p/);
	await expect(page.getByLabel('Project name')).toHaveValue('Shared conveyor');
	await expect(page.getByLabel('Network 1 comment')).toHaveValue('Hello from the share link');
});

test('a broken share link explains itself', async ({ page }) => {
	await page.goto('/share#garbage');
	await expect(page.getByText('This share link is incomplete or damaged.')).toBeVisible();
});
