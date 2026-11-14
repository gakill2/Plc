/**
 * Machine safety helpers for the safety chapter: a two-channel safety relay with feedback
 * monitoring (EDM) and the ISO 13849-1 risk graph.
 */

export interface RelayInputs {
	/** E-stop contact, channel 1 — closed (true) when the e-stop is released */
	ch1: boolean;
	ch2: boolean;
	/** reset button held */
	reset: boolean;
	/** feedback loop: NC auxiliary contacts of K1 and K2 in series — closed when both dropped out */
	feedback: boolean;
}

export interface RelayState {
	/** safety outputs (K1, K2 energised) */
	on: boolean;
	/** channels disagreed for too long — wiring fault, locked until both open */
	fault: boolean;
	/** ms the channels have disagreed */
	discrepancyMs: number;
	resetWasHeld: boolean;
	/** why the relay refuses to switch on, for the view */
	reason: string | null;
}

export const DISCREPANCY_MS = 500;

export const newRelay = (): RelayState => ({
	on: false,
	fault: false,
	discrepancyMs: 0,
	resetWasHeld: false,
	reason: null
});

/** One step of the relay: monitored manual reset (on release of the button), cross monitoring. */
export function stepRelay(s: RelayState, i: RelayInputs, dtMs: number): RelayState {
	const next = { ...s };
	next.discrepancyMs = i.ch1 !== i.ch2 ? s.discrepancyMs + dtMs : 0;
	if (next.discrepancyMs >= DISCREPANCY_MS) next.fault = true;
	// the fault clears only when both channels open together (the e-stop is really pressed)
	if (!i.ch1 && !i.ch2) next.fault = false;

	if (!i.ch1 || !i.ch2 || next.fault) next.on = false;

	const released = s.resetWasHeld && !i.reset;
	if (released && !next.on) {
		if (next.fault)
			next.reason = 'Błąd: kanały e-stopu się różnią (zwarcie / przerwa w okablowaniu).';
		else if (!i.ch1 || !i.ch2) next.reason = 'E-stop wciśnięty — najpierw go odblokuj.';
		else if (!i.feedback)
			next.reason =
				'Brak sprzężenia zwrotnego: stycznik nie odpadł (zgrzany styk?) — reset zablokowany.';
		else {
			next.on = true;
			next.reason = null;
		}
	}
	if (next.fault && !s.fault)
		next.reason = 'Błąd: kanały e-stopu się różnią (zwarcie / przerwa w okablowaniu).';
	next.resetWasHeld = i.reset;
	return next;
}

/* ---------- ISO 13849-1 risk graph ---------- */

export type Severity = 'S1' | 'S2';
export type Frequency = 'F1' | 'F2';
export type Avoidance = 'P1' | 'P2';
export type PerformanceLevel = 'a' | 'b' | 'c' | 'd' | 'e';

/** Required performance level PLr from severity, frequency/exposure and possibility of avoidance. */
export function requiredPl(s: Severity, f: Frequency, p: Avoidance): PerformanceLevel {
	const score = (s === 'S2' ? 2 : 0) + (f === 'F2' ? 1 : 0) + (p === 'P2' ? 1 : 0);
	return (['a', 'b', 'c', 'd', 'e'] as const)[score];
}

/** Typical architecture (category) that can reach the PL — a rule of thumb, not a calculation. */
export const TYPICAL_CATEGORY: Record<PerformanceLevel, string> = {
	a: 'kategoria B',
	b: 'kategoria B lub 1',
	c: 'kategoria 1, 2 lub 3',
	d: 'kategoria 2 lub 3 (dwa kanały, diagnostyka)',
	e: 'kategoria 4 (dwa kanały, wykrywanie każdego pojedynczego błędu)'
};
