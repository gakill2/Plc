import type { TimerState } from './memory.js';

/*
 * IEC 61131-3 timers. Each function is called once per scan with the elapsed scan time `dt`
 * and returns Q. Timing starts on the scan where the triggering edge is seen (ET = 0) and
 * advances by `dt` on every following scan.
 */

/** On-delay: Q goes true PT after IN goes true; IN false resets immediately. */
export function updateTon(t: TimerState, input: boolean, pt: number, dt: number): boolean {
	t.pt = pt;
	if (!input) {
		t.et = 0;
		t.running = false;
	} else if (!t.in) {
		t.et = 0;
		t.running = true;
	} else {
		t.et = Math.min(pt, t.et + dt);
	}
	if (input && t.et >= pt) t.running = false;
	t.q = input && t.et >= pt;
	t.in = input;
	return t.q;
}

/** Off-delay: Q follows IN going true, then stays true for PT after IN goes false. */
export function updateTof(t: TimerState, input: boolean, pt: number, dt: number): boolean {
	t.pt = pt;
	if (input) {
		t.q = true;
		t.et = 0;
		t.running = false;
	} else {
		if (t.in) {
			// falling edge — start timing if the output was on
			t.running = t.q;
			t.et = 0;
		} else if (t.running) {
			t.et = Math.min(pt, t.et + dt);
		}
		if (t.running && t.et >= pt) {
			t.running = false;
			t.q = false;
		}
	}
	t.in = input;
	return t.q;
}

/** Pulse: a rising edge on IN gives a pulse of exactly PT; retriggering during the pulse is ignored. */
export function updateTp(t: TimerState, input: boolean, pt: number, dt: number): boolean {
	t.pt = pt;
	if (!t.running && input && !t.in) {
		t.running = pt > 0;
		t.et = 0;
		t.q = pt > 0;
	} else if (t.running) {
		t.et = Math.min(pt, t.et + dt);
		if (t.et >= pt) {
			t.running = false;
			t.q = false;
		}
	}
	// after the pulse, ET is held at PT while IN stays true and cleared once IN is false
	if (!t.running && !input) t.et = 0;
	t.in = input;
	return t.q;
}
