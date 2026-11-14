/*
 * Small models behind the interactive figures of the tutorial: sensor wiring, analog scaling
 * and a heated oven with on/off and PID control. Pure functions — the Svelte widgets only draw.
 */

/* ---------- wiring: PNP / NPN sensors and sink / source inputs ---------- */

export type SensorType = 'PNP' | 'NPN';
/** sink = common terminal (M) on 0 V, input reads +24 V; source = common on +24 V, input reads 0 V */
export type InputType = 'sink' | 'source';

export interface WiringResult {
	/** current flows through the input → the PLC sees 1 */
	signal: boolean;
	/** voltage on the sensor's signal wire (black), null = not driven (floating) */
	wire: 24 | 0 | null;
	compatible: boolean;
	explanation: string;
}

export function wiring(sensor: SensorType, input: InputType, detects: boolean): WiringResult {
	const compatible = (sensor === 'PNP') === (input === 'sink');
	// a PNP output switches +24 V onto the signal wire, an NPN output switches 0 V
	const wire = detects ? (sensor === 'PNP' ? 24 : 0) : null;
	const signal = compatible && detects;
	let explanation: string;
	if (!detects) {
		explanation =
			'Czujnik nic nie widzi: jego tranzystor jest wyłączony, przewód sygnałowy „wisi” i prąd przez wejście nie płynie — PLC widzi 0.';
	} else if (compatible) {
		explanation =
			sensor === 'PNP'
				? 'PNP podaje +24 V na wejście, a wspólny zacisk 1M jest na 0 V — prąd płynie przez wejście do masy. PLC widzi 1.'
				: 'NPN zwiera wejście do 0 V, a wspólny zacisk 1M jest na +24 V — prąd płynie z 1M przez wejście do czujnika. PLC widzi 1.';
	} else {
		explanation =
			sensor === 'PNP'
				? 'PNP podaje +24 V, ale wejście typu source ma wspólny zacisk też na +24 V — po obu stronach to samo napięcie, prąd nie płynie. PLC widzi 0, choć czujnik świeci!'
				: 'NPN zwiera do 0 V, ale wejście typu sink ma wspólny zacisk też na 0 V — brak różnicy napięć, prąd nie płynie. PLC widzi 0, choć czujnik świeci!';
	}
	return { signal, wire, compatible, explanation };
}

/* ---------- analog: 4–20 mA / 0–10 V → raw word → engineering units ---------- */

export type AnalogRange = '4-20mA' | '0-10V';

/** Siemens-style analog card: nominal range → 0 … 27648. */
export const RAW_NOMINAL = 27648;
export const RAW_OVERFLOW = 32767;

export interface AnalogReading {
	raw: number;
	/** the raw value in percent of the nominal range */
	percent: number;
	/** wire break (4–20 mA only) or overflow */
	fault: 'wire-break' | 'overflow' | null;
}

export function analogRaw(value: number, range: AnalogRange): AnalogReading {
	const [lo, hi] = range === '4-20mA' ? [4, 20] : [0, 10];
	if (range === '4-20mA' && value < 1.185)
		return { raw: RAW_OVERFLOW, percent: NaN, fault: 'wire-break' };
	const percent = ((value - lo) / (hi - lo)) * 100;
	const raw = Math.round((percent / 100) * RAW_NOMINAL);
	if (raw > 32511) return { raw: RAW_OVERFLOW, percent, fault: 'overflow' };
	return { raw: Math.max(range === '4-20mA' ? -4864 : 0, raw), percent, fault: null };
}

/** raw → engineering units, the formula students write in the program */
export const scale = (raw: number, lo: number, hi: number) => lo + (raw / RAW_NOMINAL) * (hi - lo);

/* ---------- control: an oven with a heater ---------- */

export interface Oven {
	/** heater element temperature (lags behind the power) */
	element: number;
	/** air temperature = the process value */
	temp: number;
}

export const AMBIENT = 20;

/** One step of a two-lag thermal model. `power` 0 … 100 %. Full power settles near 220 °C. */
export function stepOven(o: Oven, power: number, dt: number): Oven {
	const p = Math.min(100, Math.max(0, power)) / 100;
	const element = o.element + ((AMBIENT + 400 * p - o.element) / 8) * dt;
	const temp = o.temp + ((o.element - o.temp) / 25 - (o.temp - AMBIENT) / 60) * dt * 1.2;
	return { element, temp };
}

export const newOven = (): Oven => ({ element: AMBIENT, temp: AMBIENT });

/** Two-position control with hysteresis: on below SP − h/2, off above SP + h/2, else keep. */
export function onOff(pv: number, sp: number, hyst: number, wasOn: boolean): boolean {
	if (pv < sp - hyst / 2) return true;
	if (pv > sp + hyst / 2) return false;
	return wasOn;
}

export interface PidParams {
	kp: number;
	/** integral time in s, 0 = no I */
	ti: number;
	/** derivative time in s, 0 = no D */
	td: number;
}

export interface PidState {
	integral: number;
	lastPv: number | null;
}

export const newPid = (): PidState => ({ integral: 0, lastPv: null });

/**
 * Textbook PID (ideal form, derivative on the measurement), output clamped to 0 … 100 % with
 * anti-windup: the integral stops growing while the output is saturated.
 */
export function pid(
	s: PidState,
	pv: number,
	sp: number,
	k: PidParams,
	dt: number
): { out: number; state: PidState; p: number; i: number; d: number } {
	const e = sp - pv;
	const p = k.kp * e;
	const d = k.td > 0 && s.lastPv !== null ? (-k.kp * k.td * (pv - s.lastPv)) / dt : 0;
	let integral = s.integral;
	const i0 = k.ti > 0 ? ((k.kp * dt) / k.ti) * e : 0;
	const unclamped = p + integral + i0 + d;
	const saturated = (unclamped > 100 && e > 0) || (unclamped < 0 && e < 0);
	if (k.ti > 0 && !saturated) integral += i0;
	if (k.ti === 0) integral = 0;
	const out = Math.min(100, Math.max(0, p + integral + d));
	return { out, state: { integral, lastPv: pv }, p, i: integral, d };
}
