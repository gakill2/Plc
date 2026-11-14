import { describe, expect, it } from 'vitest';
import { newRelay, requiredPl, stepRelay, type RelayInputs, type RelayState } from './safety.js';

const ok: RelayInputs = { ch1: true, ch2: true, reset: false, feedback: true };
function run(s: RelayState, i: RelayInputs, ms: number) {
	for (let t = 0; t < ms; t += 50) s = stepRelay(s, i, 50);
	return s;
}
const pressReset = (s: RelayState, i: RelayInputs) =>
	run(run(s, { ...i, reset: true }, 100), i, 50);

describe('safety relay', () => {
	it('switches on only after the reset button is released', () => {
		let s = run(newRelay(), ok, 100);
		expect(s.on).toBe(false);
		s = run(s, { ...ok, reset: true }, 200);
		expect(s.on).toBe(false);
		s = run(s, ok, 50);
		expect(s.on).toBe(true);
	});

	it('drops out with the e-stop and refuses a reset while it is pressed', () => {
		let s = pressReset(newRelay(), ok);
		s = run(s, { ...ok, ch1: false, ch2: false }, 50);
		expect(s.on).toBe(false);
		s = pressReset(s, { ...ok, ch1: false, ch2: false });
		expect(s.on).toBe(false);
	});

	it('detects a shorted channel and stays locked until both open', () => {
		let s = pressReset(newRelay(), ok);
		s = run(s, { ...ok, ch1: false }, 600); // channel 2 shorted: only channel 1 opens
		expect(s.on).toBe(false);
		expect(s.fault).toBe(true);
		s = pressReset(s, ok);
		expect(s.on).toBe(false);
		s = run(s, { ...ok, ch1: false, ch2: false }, 50);
		s = pressReset(run(s, ok, 50), ok);
		expect(s.on).toBe(true);
	});

	it('blocks the reset when a contactor is welded (no feedback)', () => {
		const s = pressReset(newRelay(), { ...ok, feedback: false });
		expect(s.on).toBe(false);
		expect(s.reason).toMatch(/zgrzany/);
	});
});

describe('risk graph', () => {
	it('gives the required performance level', () => {
		expect(requiredPl('S1', 'F1', 'P1')).toBe('a');
		expect(requiredPl('S1', 'F2', 'P2')).toBe('c');
		expect(requiredPl('S2', 'F1', 'P2')).toBe('d');
		expect(requiredPl('S2', 'F2', 'P2')).toBe('e');
	});
});
