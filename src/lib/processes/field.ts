/**
 * The field between a plant and the PLC: real sensors are not perfect.
 *
 * - **Realistic signals** (optional): analog inputs carry noise, values outside the measuring
 *   range read as the S7 overflow / underflow codes (32767 / −32768).
 * - **Faults** (injected by hand, in lessons or on call): a digital sensor stuck at 0 or 1, a dirty
 *   sensor that drops out, a slow one; an analog transmitter with a broken wire (4–20 mA → 32767),
 *   a frozen value or an offset. Plant faults (a jammed belt, a worn pump …) are passed to the
 *   model.
 *
 * Random numbers come from a seeded generator, so a test run is always the same.
 */
import type { ProcessIO, ProcessModel } from './types.js';

export type DigitalFault = 'stuck0' | 'stuck1' | 'flicker' | 'slow';
export type AnalogFault = 'wireBreak' | 'frozen' | 'offset';
export type SignalFault = DigitalFault | AnalogFault;

export const SIGNAL_FAULTS: Record<SignalFault, { label: string; analog: boolean }> = {
	stuck0: { label: 'stale 0 (przerwa, czujnik uszkodzony)', analog: false },
	stuck1: { label: 'stale 1 (zwarcie, zablokowany)', analog: false },
	flicker: { label: 'zabrudzony — gubi sygnał', analog: false },
	slow: { label: 'opóźniony o 0,5 s', analog: false },
	wireBreak: { label: 'zerwany przewód (4–20 mA)', analog: true },
	frozen: { label: 'zamrożona wartość', analog: true },
	offset: { label: 'przesunięcie +10 % zakresu', analog: true }
};

/** S7 analog value codes: nominal range 0 … 27648, overflow 32767, underflow −32768. */
export const ANALOG_NOMINAL = 27648;
export const ANALOG_OVERFLOW = 32767;
export const ANALOG_UNDERFLOW = -32768;
const OVERRANGE = 32511;
const UNDERRANGE = -4864;

export interface FieldSettings {
	/** noise and range limits on analog inputs */
	realism: boolean;
	/** address → fault */
	faults: Record<string, SignalFault>;
	/** faults of the plant itself, by id */
	plantFaults: string[];
}

/** mulberry32 — a small seeded PRNG */
function rng(seed: number) {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

export class FieldLayer {
	realism = false;
	readonly faults = new Map<string, SignalFault>();
	readonly plantFaults = new Set<string>();
	/** noise (counts, one standard deviation) per analog input of the plant */
	noise: Record<string, number> = {};

	#random: () => number;
	#time = 0;
	/** last value the plant produced, per address */
	#raw = new Map<string, boolean | number>();
	/** what the PLC sees, per address (for slow / frozen signals) */
	#seen = new Map<string, boolean | number>();
	/** slow sensor: when the pending change shows up */
	#pending = new Map<string, { value: boolean; at: number }>();

	constructor(seed = 1) {
		this.#random = rng(seed);
	}

	get settings(): FieldSettings {
		return {
			realism: this.realism,
			faults: Object.fromEntries(this.faults),
			plantFaults: [...this.plantFaults]
		};
	}

	/** Advances the field's clock (call before the plant's step). */
	tick(dtMs: number) {
		this.#time += dtMs;
	}

	/** Applies the plant faults to a (new) plant model. */
	applyPlantFaults(model: ProcessModel | null) {
		for (const id of this.plantFaults) model?.command('fault', { id, on: true });
	}

	setPlantFault(model: ProcessModel | null, id: string, on: boolean) {
		if (on) this.plantFaults.add(id);
		else this.plantFaults.delete(id);
		model?.command('fault', { id, on });
	}

	setFault(address: string, fault: SignalFault | null) {
		const key = address.toUpperCase();
		if (fault) this.faults.set(key, fault);
		else this.faults.delete(key);
		this.#pending.delete(key);
	}

	/** A gaussian sample (Box–Muller). */
	#gauss() {
		const u = Math.max(1e-9, this.#random());
		const v = this.#random();
		return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
	}

	digital(address: string, value: boolean): boolean {
		const key = address.toUpperCase();
		this.#raw.set(key, value);
		const fault = this.faults.get(key);
		let out = value;
		switch (fault) {
			case 'stuck0':
				out = false;
				break;
			case 'stuck1':
				out = true;
				break;
			case 'flicker':
				// a dirty reflector: the signal drops out for a moment now and then
				out = value && this.#random() > 0.15;
				break;
			case 'slow': {
				// the change reaches the PLC half a second late
				const seen = (this.#seen.get(key) as boolean | undefined) ?? value;
				if (value === seen) {
					this.#pending.delete(key);
					break;
				}
				let p = this.#pending.get(key);
				if (!p || p.value !== value) {
					p = { value, at: this.#time + 500 };
					this.#pending.set(key, p);
				}
				out = p.at <= this.#time ? value : seen;
				if (out === value) this.#pending.delete(key);
				break;
			}
		}
		this.#seen.set(key, out);
		return out;
	}

	analog(address: string, value: number): number {
		const key = address.toUpperCase();
		this.#raw.set(key, value);
		const fault = this.faults.get(key);
		let out = value;
		if (this.realism && this.noise[key]) out += this.#gauss() * this.noise[key];
		if (fault === 'offset') out += ANALOG_NOMINAL / 10;
		if (fault === 'frozen') {
			const seen = this.#seen.get(key);
			if (typeof seen === 'number') return seen;
		}
		out = Math.round(out);
		if (fault === 'wireBreak') out = ANALOG_OVERFLOW;
		else if (this.realism || fault) {
			if (out > OVERRANGE) out = ANALOG_OVERFLOW;
			else if (out < UNDERRANGE) out = ANALOG_UNDERFLOW;
		}
		this.#seen.set(key, out);
		return out;
	}

	/** The plant's I/O as the PLC experiences it. */
	wrap(io: ProcessIO): ProcessIO {
		return {
			output: (t) => io.output(t),
			word: (a) => io.word(a),
			input: (t, v) => io.input(t, this.digital(t, v)),
			setWord: (a, v) => io.setWord(a, this.analog(a, v))
		};
	}
}
