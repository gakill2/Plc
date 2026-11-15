import { describe, expect, it } from 'vitest';
import { allShapes, PAGES, TASKS, VOLTS, where } from './schematic.js';

describe('the schematic of conveyor T1', () => {
	const ids = new Set([
		...allShapes.map((s) => s.id),
		...PAGES.flatMap((p) => p.wires.map((w) => w.id))
	]);

	it('has unique ids and every cross reference leads somewhere', () => {
		expect(ids.size).toBe(allShapes.length + PAGES.flatMap((p) => p.wires).length);
		const targets = [
			...allShapes.flatMap((s) => [...(s.refs ?? []), ...(s.mirror ?? []).map(([, id]) => id)]),
			...PAGES.flatMap((p) => [
				...p.rails.flatMap((r) => (r.refTo ? [r.refTo] : [])),
				...(p.notes ?? []).flatMap((n) => (n.refTo ? [n.refTo] : []))
			])
		];
		for (const t of targets) expect(where(t), t).not.toBe('');
	});

	it('prints cross references as /page.column', () => {
		expect(where('k1coil')).toBe('/4.2');
		expect(where('k1aux')).toBe('/3.5');
		expect(where('q2')).toBe('/1.3');
	});

	it('has an answer for every task and a measurable fault', () => {
		for (const t of TASKS) expect(ids.has(t.answer), t.answer).toBe(true);
		const page4 = PAGES.find((p) => p.no === 4)!;
		for (const p of PAGES.flatMap((x) => x.points)) expect(VOLTS[p.net], p.id).toBeDefined();
		const v = (id: string) => VOLTS[page4.points.find((p) => p.id === id)!.net];
		// 24 V up to the terminal, gone at the coil: the broken wire is in between
		expect([v('tp-q0'), v('tp-x21'), v('tp-a1')]).toEqual([24, 24, 0]);
		expect(page4.wires.find((w) => w.id === 'o2')!.net).toBe('K1:A1');
	});
});
