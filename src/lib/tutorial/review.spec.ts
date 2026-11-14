import { describe, expect, it } from 'vitest';
import { CHAPTERS } from './chapters.js';
import { pickReview, recordAnswer, reviewItems, reviewStats, shuffled } from './review.js';

const memory = () => {
	const data = new Map<string, string>();
	return {
		getItem: (k: string) => data.get(k) ?? null,
		setItem: (k: string, v: string) => void data.set(k, v)
	};
};

describe('review', () => {
	const items = reviewItems();

	it('collects chapter quizzes and extra questions, all valid', () => {
		expect(new Set(items.map((i) => i.id)).size).toBe(items.length);
		for (const it of items) {
			expect(
				CHAPTERS.some((c) => c.slug === it.chapter),
				it.id
			).toBe(true);
			expect(it.correct).toBeGreaterThanOrEqual(0);
			expect(it.correct).toBeLessThan(it.options.length);
		}
		expect(items.filter((i) => i.id.startsWith('x:')).length).toBeGreaterThanOrEqual(10);
	});

	it('uses the first chapters when nothing is started, then the started ones', () => {
		const none = pickReview(items, {}, new Set(), 50, 0, () => 0);
		const first = CHAPTERS.slice(0, 3).map((c) => c.slug);
		expect(none.every((q) => first.includes(q.chapter))).toBe(true);

		const started = pickReview(items, {}, new Set(['timery:0']), 50, 0, () => 0);
		expect(new Set(started.map((q) => q.chapter))).toEqual(new Set(['timery']));
	});

	it('brings back wrong answers first, fresh questions next, well-known last', () => {
		const pool = items.filter((i) => i.chapter === 'timery');
		const [a, b, c] = pool;
		const now = 10 * 86_400_000;
		const stats = {
			[a.id]: { right: 5, wrong: 0, seen: now },
			[b.id]: { right: 0, wrong: 2, seen: now }
		};
		const order = pickReview(items, stats, new Set(['timery:0']), pool.length, now, () => 0);
		expect(order[0].id).toBe(b.id);
		expect(order.at(-1)!.id).toBe(a.id);
		expect(order.slice(1, -1).map((q) => q.id)).toContain(c.id);
	});

	it('records answers and shuffles options keeping the right one', () => {
		const store = memory();
		recordAnswer('timery:0', false, store, 1);
		recordAnswer('timery:0', true, store, 2);
		expect(reviewStats(store)).toEqual({ 'timery:0': { right: 1, wrong: 1, seen: 2 } });

		const q = items[0];
		const s = shuffled(q, () => 0.9);
		expect(s.options[s.correct]).toBe(q.options[q.correct]);
		expect([...s.options].sort()).toEqual([...q.options].sort());
		expect(reviewStats({ getItem: () => 'oops', setItem: () => {} })).toEqual({});
	});
});
