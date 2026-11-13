import type { CounterState } from './memory.js';

/* IEC 61131-3 counters on 16-bit INT, counting on rising edges of CU / CD. */

export const COUNTER_MAX = 32767;
export const COUNTER_MIN = -32768;

/** Up counter. R resets CV to 0. Q = CV >= PV. */
export function updateCtu(c: CounterState, cu: boolean, r: boolean, pv: number): boolean {
	c.pv = pv;
	if (r) c.cv = 0;
	else if (cu && !c.cuPrev && c.cv < COUNTER_MAX) c.cv++;
	c.cuPrev = cu;
	c.q = c.cv >= pv;
	return c.q;
}

/** Down counter. LD loads CV = PV. Q = CV <= 0. */
export function updateCtd(c: CounterState, cd: boolean, ld: boolean, pv: number): boolean {
	c.pv = pv;
	if (ld) c.cv = pv;
	else if (cd && !c.cdPrev && c.cv > COUNTER_MIN) c.cv--;
	c.cdPrev = cd;
	c.q = c.cv <= 0;
	return c.q;
}

/** Up/down counter. R has priority over LD. QU = CV >= PV, QD = CV <= 0. Returns QU. */
export function updateCtud(
	c: CounterState,
	cu: boolean,
	cd: boolean,
	r: boolean,
	ld: boolean,
	pv: number
): boolean {
	c.pv = pv;
	if (r) c.cv = 0;
	else if (ld) c.cv = pv;
	else {
		if (cu && !c.cuPrev && c.cv < COUNTER_MAX) c.cv++;
		if (cd && !c.cdPrev && c.cv > COUNTER_MIN) c.cv--;
	}
	c.cuPrev = cu;
	c.cdPrev = cd;
	c.q = c.cv >= pv;
	c.qd = c.cv <= 0;
	return c.q;
}
