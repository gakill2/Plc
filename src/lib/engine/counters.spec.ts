import { describe, expect, it } from 'vitest';
import { COUNTER_MAX, updateCtd, updateCtu, updateCtud } from './counters.js';
import { newCounterState } from './memory.js';

/** Produces `n` rising edges on CU. */
function pulsesUp(n: number, c = newCounterState(), pv = 3) {
	for (let i = 0; i < n; i++) {
		updateCtu(c, true, false, pv);
		updateCtu(c, false, false, pv);
	}
	return c;
}

describe('CTU', () => {
	it('counts rising edges only', () => {
		const c = newCounterState();
		updateCtu(c, true, false, 3);
		updateCtu(c, true, false, 3); // held — no new edge
		expect(c.cv).toBe(1);
	});

	it('sets Q at PV and resets on R', () => {
		const c = pulsesUp(3);
		expect(c.q).toBe(true);
		expect(updateCtu(c, false, true, 3)).toBe(false);
		expect(c.cv).toBe(0);
	});

	it('saturates at the INT limit', () => {
		const c = newCounterState();
		c.cv = COUNTER_MAX;
		updateCtu(c, true, false, 3);
		expect(c.cv).toBe(COUNTER_MAX);
	});
});

describe('CTD', () => {
	it('loads PV, counts down and sets Q at zero', () => {
		const c = newCounterState();
		updateCtd(c, false, true, 2);
		expect(c.cv).toBe(2);
		expect(c.q).toBe(false);
		updateCtd(c, true, false, 2);
		updateCtd(c, false, false, 2);
		expect(updateCtd(c, true, false, 2)).toBe(true);
		expect(c.cv).toBe(0);
	});
});

describe('CTUD', () => {
	it('counts both ways with QU / QD', () => {
		const c = newCounterState();
		expect(c.cv).toBe(0);
		updateCtud(c, true, false, false, false, 2);
		updateCtud(c, false, false, false, false, 2);
		updateCtud(c, true, false, false, false, 2);
		expect([c.cv, c.q, c.qd]).toEqual([2, true, false]);
		updateCtud(c, false, true, false, false, 2);
		expect([c.cv, c.q, c.qd]).toEqual([1, false, false]);
	});

	it('R has priority over LD, LD loads PV', () => {
		const c = newCounterState();
		updateCtud(c, false, false, false, true, 5);
		expect(c.cv).toBe(5);
		updateCtud(c, false, false, true, true, 5);
		expect([c.cv, c.qd]).toEqual([0, true]);
	});
});
