import { describe, expect, it } from 'vitest';
import { getLesson } from '#lib/lessons/lessons.js';
import { getTicket, nextTicket, ticketForLesson, TICKETS } from './tickets.js';
import {
	career,
	downtime,
	isUnlocked,
	loadStory,
	solveTicket,
	starsFor,
	totalStars,
	updateTicket
} from './progress.js';

const memory = () => {
	const data = new Map<string, string>();
	return {
		getItem: (k: string) => data.get(k) ?? null,
		setItem: (k: string, v: string) => void data.set(k, v)
	};
};

describe('tickets', () => {
	it('every ticket opens an existing lesson, once', () => {
		const slugs = TICKETS.map((t) => t.lesson);
		for (const s of slugs) expect(getLesson(s), s).not.toBeNull();
		expect(new Set(slugs).size).toBe(slugs.length);
		expect(new Set(TICKETS.map((t) => t.id)).size).toBe(TICKETS.length);
	});

	it('looks tickets up', () => {
		expect(getTicket('z03')?.lesson).toBe('self-holding');
		expect(ticketForLesson('self-holding')?.id).toBe('z03');
		expect(nextTicket('z01')?.id).toBe('z02');
		expect(nextTicket(TICKETS.at(-1)!.id)).toBeNull();
	});
});

describe('story progress', () => {
	it('grades with stars', () => {
		expect(starsFor({ failedChecks: 1, hints: 0, usedSolution: false })).toBe(3);
		expect(starsFor({ failedChecks: 3, hints: 1, usedSolution: false })).toBe(2);
		expect(starsFor({ failedChecks: 0, hints: 2, usedSolution: false })).toBe(1);
		expect(starsFor({ failedChecks: 0, hints: 0, usedSolution: true })).toBe(1);
	});

	it('records, solves, unlocks and keeps the best result', () => {
		const s = memory();
		expect(isUnlocked('z01', loadStory(s))).toBe(true);
		expect(isUnlocked('z02', loadStory(s))).toBe(false);
		updateTicket('z01', (r) => r.failedChecks++, s, 0);
		updateTicket('z01', (r) => r.hints++, s, 1000);
		const r = solveTicket('z01', s, 30 * 60_000);
		expect(r.stars).toBe(2);
		expect(downtime(r, 1200)).toEqual({ minutes: 30, cost: 600 });
		expect(isUnlocked('z02', loadStory(s))).toBe(true);
		updateTicket('z01', (x) => (x.hints = 5), s);
		expect(solveTicket('z01', s).stars).toBe(2);
		expect(totalStars(loadStory(s))).toBe(2);
	});

	it('survives broken storage', () => {
		const s = memory();
		s.setItem('plcsim:tickets', '{oops');
		expect(loadStory(s)).toEqual({});
	});

	it('climbs the career ladder', () => {
		expect(career(0).current.title).toBe('Praktykant');
		expect(career(12).current.title).toBe('Młodszy automatyk');
		expect(career(12).next?.stars).toBe(25);
		expect(career(51).next).toBeNull();
	});
});
