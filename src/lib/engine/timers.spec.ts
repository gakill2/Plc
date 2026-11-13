import { describe, expect, it } from 'vitest';
import { newTimerState, type TimerState } from './memory.js';
import { updateTof, updateTon, updateTp } from './timers.js';

type Update = typeof updateTon;
const DT = 10;
const PT = 100;

/** Calls the timer `n` times with the same input, returns Q after each call. */
function scans(update: Update, t: TimerState, input: boolean, n: number): boolean[] {
	return Array.from({ length: n }, () => update(t, input, PT, DT));
}

describe('TON (on-delay)', () => {
	it('switches on exactly PT after IN goes true', () => {
		const t = newTimerState();
		expect(scans(updateTon, t, true, 10)).toEqual(Array(10).fill(false)); // ET 0 … 90
		expect(t.et).toBe(90);
		expect(updateTon(t, true, PT, DT)).toBe(true);
		expect(t.et).toBe(PT);
		expect(updateTon(t, true, PT, DT)).toBe(true);
		expect(t.et).toBe(PT); // ET is capped
	});

	it('resets immediately when IN goes false', () => {
		const t = newTimerState();
		scans(updateTon, t, true, 5);
		expect(updateTon(t, false, PT, DT)).toBe(false);
		expect(t.et).toBe(0);
		expect(scans(updateTon, t, true, 10).at(-1)).toBe(false); // starts from scratch
	});

	it('PT = 0 switches on at once', () => {
		expect(updateTon(newTimerState(), true, 0, DT)).toBe(true);
	});
});

describe('TOF (off-delay)', () => {
	it('follows IN on, then holds Q for PT after IN goes false', () => {
		const t = newTimerState();
		expect(updateTof(t, false, PT, DT)).toBe(false);
		expect(updateTof(t, true, PT, DT)).toBe(true);
		expect(scans(updateTof, t, false, 10)).toEqual(Array(10).fill(true)); // ET 0 … 90
		expect(updateTof(t, false, PT, DT)).toBe(false);
		expect(t.et).toBe(PT);
	});

	it('is retriggered when IN comes back during timing', () => {
		const t = newTimerState();
		updateTof(t, true, PT, DT);
		scans(updateTof, t, false, 8);
		expect(updateTof(t, true, PT, DT)).toBe(true);
		expect(t.et).toBe(0);
		expect(scans(updateTof, t, false, 10).at(-1)).toBe(true);
	});
});

describe('TP (pulse)', () => {
	it('gives a pulse of PT even if IN drops early', () => {
		const t = newTimerState();
		expect(updateTp(t, true, PT, DT)).toBe(true);
		expect(scans(updateTp, t, false, 9)).toEqual(Array(9).fill(true)); // ET 10 … 90
		expect(updateTp(t, false, PT, DT)).toBe(false);
		expect(t.et).toBe(0);
	});

	it('ignores retriggering during the pulse', () => {
		const t = newTimerState();
		updateTp(t, true, PT, DT);
		scans(updateTp, t, false, 3);
		updateTp(t, true, PT, DT); // rising edge mid-pulse
		expect(t.et).toBe(40);
		expect(scans(updateTp, t, true, 6).at(-1)).toBe(false);
	});

	it('holds ET while IN stays on, re-arms after IN goes off', () => {
		const t = newTimerState();
		scans(updateTp, t, true, 15);
		expect(t.q).toBe(false);
		expect(t.et).toBe(PT);
		updateTp(t, false, PT, DT);
		expect(t.et).toBe(0);
		expect(updateTp(t, true, PT, DT)).toBe(true);
	});
});
