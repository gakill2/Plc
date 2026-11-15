/*
 * Hardware configuration: which I/O modules sit in the rack, at which address the program sees
 * them, and how every analog channel measures. Like the device view in TIA Portal.
 *
 * The plant and the field devices are wired to module *channels* (the field wiring, fixed — that
 * is the cabinet). The configuration decides the *logical address* of each channel. A wrong start
 * address moves the signals away from where the program looks; a wrong measuring type turns a
 * good transmitter into nonsense values (32767, an offset zero, a reading that never moves).
 */
import type { ProcessIO } from '#lib/processes/types.js';

export type ModuleKind = 'DI16' | 'DQ16' | 'AI4' | 'AQ2';

/** Measuring type of an analog input channel. */
export type AiMode = 'I_4_20' | 'I_0_20' | 'U_0_10' | 'RTD' | 'off';
/** What the transmitter in the field actually delivers. */
export type SensorSignal = 'I_4_20' | 'U_0_10' | 'RTD';

export interface ModuleInfo {
	name: string;
	area: 'I' | 'Q';
	bytes: number;
	channels: number;
	analog: boolean;
}

export const MODULES: Record<ModuleKind, ModuleInfo> = {
	DI16: { name: 'DI 16 × 24 V DC', area: 'I', bytes: 2, channels: 16, analog: false },
	DQ16: { name: 'DQ 16 × 24 V DC / 0,5 A', area: 'Q', bytes: 2, channels: 16, analog: false },
	AI4: { name: 'AI 4 × U / I / RTD', area: 'I', bytes: 8, channels: 4, analog: true },
	AQ2: { name: 'AQ 2 × U / I', area: 'Q', bytes: 4, channels: 2, analog: true }
};

export const AI_MODES: Record<AiMode, string> = {
	I_4_20: '4–20 mA',
	I_0_20: '0–20 mA',
	U_0_10: '0–10 V',
	RTD: 'RTD Pt100 (0,1 °C)',
	off: 'wyłączony'
};

export const SIGNALS: Record<SensorSignal, string> = {
	I_4_20: 'przetwornik 4–20 mA (2-przewodowy)',
	U_0_10: 'przetwornik 0–10 V',
	RTD: 'czujnik Pt100'
};

export interface AiChannel {
	mode: AiMode;
	/** wire break / under-range diagnostics: the value reads 32767 on a broken loop */
	diag: boolean;
}

export interface HwModule {
	slot: number;
	kind: ModuleKind;
	/** first byte of the module in the process image */
	start: number;
	/** analog inputs: one entry per channel */
	ai?: AiChannel[];
}

/** One cable in the cabinet: a field terminal (as the plant names it) on a module channel. */
export interface FieldWire {
	terminal: string;
	/** what is connected, for the I/O list */
	device: string;
	slot: number;
	channel: number;
	/** analog inputs: the transmitter's signal */
	signal?: SensorSignal;
}

export interface Hardware {
	cpu: string;
	/** size of the process image (inputs and outputs), bytes */
	imageBytes: number;
	modules: HwModule[];
	wiring: FieldWire[];
}

export interface HwIssue {
	id: string;
	message: string;
}

export const range = (m: HwModule) => {
	const info = MODULES[m.kind];
	return { area: info.area, from: m.start, to: m.start + info.bytes - 1 };
};

export const rangeText = (m: HwModule) => {
	const r = range(m);
	return MODULES[m.kind].analog
		? `${r.area}W${r.from} … ${r.area}W${r.to - 1}`
		: `${r.area}${r.from}.0 … ${r.area}${r.to}.7`;
};

/** Address the program uses for a channel, or null when the slot holds no fitting module. */
export function channelAddress(hw: Hardware, slot: number, channel: number): string | null {
	const m = hw.modules.find((x) => x.slot === slot);
	if (!m) return null;
	const info = MODULES[m.kind];
	if (channel < 0 || channel >= info.channels) return null;
	return info.analog
		? `${info.area}W${m.start + 2 * channel}`
		: `${info.area}${m.start + Math.floor(channel / 8)}.${channel % 8}`;
}

export function checkHardware(hw: Hardware): HwIssue[] {
	const issues: HwIssue[] = [];
	const slots = new Set<number>();
	for (const m of hw.modules) {
		const r = range(m);
		const label = `Slot ${m.slot} (${MODULES[m.kind].name})`;
		if (slots.has(m.slot))
			issues.push({ id: `hw:${m.slot}:slot`, message: `${label}: slot used twice` });
		slots.add(m.slot);
		if (!Number.isInteger(m.start) || m.start < 0)
			issues.push({ id: `hw:${m.slot}:start`, message: `${label}: invalid start address` });
		else if (r.to >= hw.imageBytes)
			issues.push({
				id: `hw:${m.slot}:start`,
				message: `${label}: ${rangeText(m)} is outside the process image (0 … ${hw.imageBytes - 1})`
			});
		if (MODULES[m.kind].analog && m.start % 2)
			issues.push({
				id: `hw:${m.slot}:start`,
				message: `${label}: an analog module starts on an even byte`
			});
		for (const o of hw.modules) {
			if (o === m || o.slot < m.slot) continue;
			const q = range(o);
			if (q.area === r.area && q.from <= r.to && r.from <= q.to)
				issues.push({
					id: `hw:${o.slot}:start`,
					message: `${label} and slot ${o.slot}: addresses overlap (${rangeText(m)} / ${rangeText(o)})`
				});
		}
	}
	return issues;
}

const NOMINAL = 27648;
const OVERFLOW = 32767;
const UNDERRANGE = -4864;
const clampRaw = (v: number) => Math.round(Math.max(UNDERRANGE, Math.min(32511, v)));

/**
 * What an analog input card reads. `raw` is the value the plant meant (0 … 27648, or °C × 10 for
 * an RTD), `broken` an open loop. Mismatched sensor and channel give what a real card gives.
 */
export function analogReading(
	raw: number,
	signal: SensorSignal,
	ch: AiChannel,
	broken: boolean
): number {
	if (ch.mode === 'off') return OVERFLOW;
	if (signal === 'RTD') {
		if (ch.mode === 'RTD') return broken ? OVERFLOW : raw;
		// a passive resistor drives no current and no voltage
		if (ch.mode === 'U_0_10') return 0;
		return ch.mode === 'I_4_20' ? (ch.diag ? OVERFLOW : UNDERRANGE) : 0;
	}
	if (!broken && (raw === OVERFLOW || raw <= -32768)) return raw; // the plant's own over- / underflow
	const f = raw / NOMINAL;
	if (signal === 'I_4_20') {
		const mA = broken ? 0 : 4 + 16 * f;
		switch (ch.mode) {
			case 'I_4_20':
				if (mA < 1.185) return ch.diag ? OVERFLOW : UNDERRANGE;
				return clampRaw(((mA - 4) / 16) * NOMINAL);
			case 'I_0_20':
				return clampRaw((mA / 20) * NOMINAL);
			case 'U_0_10':
			case 'RTD':
				// the loop drives into a high-impedance input: the transmitter saturates
				return broken ? 0 : OVERFLOW;
		}
	}
	// 0–10 V transmitter
	const v = broken ? 0 : 10 * f;
	switch (ch.mode) {
		case 'U_0_10':
			return clampRaw((v / 10) * NOMINAL);
		case 'I_4_20':
			return ch.diag ? OVERFLOW : UNDERRANGE; // no loop current
		case 'I_0_20':
		case 'RTD':
			return broken ? 0 : OVERFLOW;
	}
	return OVERFLOW;
}

/** Puts the configured hardware between the field (plant, buttons) and the PLC's I/O image. */
export class HwLayer {
	readonly #wires = new Map<string, FieldWire>();

	constructor(
		readonly hw: Hardware,
		/** is the loop of this field terminal broken (an injected fault)? */
		private readonly broken: (terminal: string) => boolean = () => false
	) {
		for (const w of hw.wiring) this.#wires.set(w.terminal.toUpperCase(), w);
	}

	#target(terminal: string, analog: boolean, area: 'I' | 'Q') {
		const w = this.#wires.get(terminal.toUpperCase());
		if (!w) return { wire: null, address: terminal };
		const m = this.hw.modules.find((x) => x.slot === w.slot);
		const ok = m && MODULES[m.kind].analog === analog && MODULES[m.kind].area === area;
		return { wire: w, module: m, address: ok ? channelAddress(this.hw, w.slot, w.channel) : null };
	}

	/** Logical address of a field input terminal, or null when no module reads it. */
	inputAddress(terminal: string): string | null {
		return this.#target(terminal, false, 'I').address;
	}

	wrap(io: ProcessIO): ProcessIO {
		return {
			input: (t, v) => {
				const a = this.inputAddress(t);
				if (a) io.input(a, v);
			},
			output: (t) => {
				const a = this.#target(t, false, 'Q').address;
				return a ? io.output(a) : false;
			},
			setWord: (t, v) => {
				const { wire, module, address } = this.#target(t, true, 'I');
				if (!address) return;
				if (!wire || !module?.ai) return io.setWord(address, v);
				const ch = module.ai[wire.channel] ?? { mode: 'off', diag: false };
				io.setWord(address, analogReading(v, wire.signal ?? 'I_4_20', ch, this.broken(t)));
			},
			word: (t) => {
				const a = this.#target(t, true, 'Q').address;
				return a ? io.word(a) : 0;
			}
		};
	}
}

export const cloneHardware = (hw: Hardware): Hardware => JSON.parse(JSON.stringify(hw));

export function isHardware(v: unknown): v is Hardware {
	const o = v as Hardware;
	return (
		typeof o === 'object' &&
		o !== null &&
		Array.isArray(o.modules) &&
		Array.isArray(o.wiring) &&
		typeof o.imageBytes === 'number'
	);
}
