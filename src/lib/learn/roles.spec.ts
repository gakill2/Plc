import { describe, expect, it } from 'vitest';
import { LESSONS } from '#lib/lessons/lessons.js';
import { CHAPTERS } from '#lib/tutorial/chapters.js';
import { learningPath } from './path.js';
import { portfolioEntries, portfolioMarkdown, programText } from './portfolio.js';
import { ROLES, rolePath, roleOf, savedRole, saveRole } from './roles.js';

describe('role paths', () => {
	const stages = learningPath();
	const known = new Set([
		...CHAPTERS.map((c) => `chapter:${c.slug}`),
		...LESSONS.map((l) => `lesson:${l.slug}`)
	]);

	it.each(ROLES.map((r) => [r.id, r] as const))('%s lists only existing steps, once', (_id, r) => {
		expect(r.steps.filter((s) => !known.has(s))).toEqual([]);
		expect(new Set(r.steps).size).toBe(r.steps.length);
		expect(r.steps.length).toBeGreaterThanOrEqual(15);
	});

	it('keeps the order of the whole path and drops empty stages', () => {
		const role = roleOf('programmer')!;
		const steps = rolePath(stages, role).flatMap((s) => s.steps);
		expect(steps).toHaveLength(role.steps.length);
		const all = stages.flatMap((s) => s.steps);
		const at = steps.map((s) => all.indexOf(s));
		expect(at).toEqual([...at].sort((a, b) => a - b));
		expect(rolePath(stages, null)).toBe(stages);
	});

	it('puts every lesson after its chapter in each role', () => {
		for (const role of ROLES) {
			const steps = rolePath(stages, role).flatMap((s) => s.steps);
			expect(steps[0]).toMatchObject({ kind: 'chapter', slug: 'czym-jest-plc' });
		}
	});

	it('remembers the chosen role', () => {
		const m = new Map<string, string>();
		const s = {
			getItem: (k: string) => m.get(k) ?? null,
			setItem: (k: string, v: string) => void m.set(k, v),
			removeItem: (k: string) => void m.delete(k)
		};
		expect(savedRole(s)).toBeNull();
		saveRole('commissioning', s);
		expect(savedRole(s)).toBe('commissioning');
		saveRole(null, s);
		expect(savedRole(s)).toBeNull();
	});
});

describe('portfolio', () => {
	it('lists passed lessons with their tests and the student program', () => {
		const lesson = LESSONS.find((l) => l.slug === 'pneumatic-press')!;
		const project = { ...lesson.starter(), st: lesson.solutionSt! };
		const entries = portfolioEntries(
			learningPath(),
			new Set(['pneumatic-press', 'first-rung']),
			(s) => (s === 'pneumatic-press' ? project : null)
		);
		expect(entries.map((e) => e.slug)).toEqual(['first-rung', 'pneumatic-press']);
		expect(entries[0].code).toBeNull();
		expect(entries[1].code).toContain('CASE step OF');
		expect(entries[1].tests).toContain('Auto: detal za detalem');

		const md = portfolioMarkdown({
			name: 'Jan Kowalski',
			role: 'Programista PLC',
			date: '2026-11-16',
			chaptersDone: 3,
			chaptersTotal: 40,
			entries
		});
		expect(md).toContain('# Portfolio PLC — Jan Kowalski');
		expect(md).toContain('- ✓ Auto: detal za detalem');
		expect(md).toContain('```\n(* Prasa');
		expect(md).toContain('| Program od zera | 2 |');
	});

	it('turns a ladder program into ST', () => {
		const lesson = LESSONS.find((l) => l.slug === 'first-rung')!;
		const text = programText({ ...lesson.starter(), ladder: lesson.solution() });
		expect(text).toMatch(/:=/);
	});
});
