import { byteWidth, formatAddress } from './address.js';
import type { Address, ByteArea, MemAddress, NumType } from './types.js';

export interface MemoryConfig {
	inputBytes: number;
	outputBytes: number;
	markerBytes: number;
	timers: number;
	counters: number;
}

export const DEFAULT_MEMORY_CONFIG: MemoryConfig = {
	inputBytes: 128,
	outputBytes: 128,
	markerBytes: 1024,
	timers: 64,
	counters: 64
};

export class MemoryError extends Error {
	override name = 'MemoryError';
}

/** IEC timer instance state (TON / TOF / TP). Times in ms. */
export interface TimerState {
	pt: number;
	et: number;
	q: boolean;
	/** IN value from the previous call — used for edge detection. */
	in: boolean;
	running: boolean;
}

/** IEC counter instance state (CTU / CTD / CTUD). */
export interface CounterState {
	cv: number;
	pv: number;
	/** CTU / CTUD: CV >= PV, CTD: CV <= 0 */
	q: boolean;
	/** CTUD only: CV <= 0 */
	qd: boolean;
	cuPrev: boolean;
	cdPrev: boolean;
}

export const newTimerState = (): TimerState => ({
	pt: 0,
	et: 0,
	q: false,
	in: false,
	running: false
});

export const newCounterState = (): CounterState => ({
	cv: 0,
	pv: 0,
	q: false,
	qd: false,
	cuPrev: false,
	cdPrev: false
});

function areaBytes(area: ByteArea, config: MemoryConfig): number {
	return area === 'I' ? config.inputBytes : area === 'Q' ? config.outputBytes : config.markerBytes;
}

/** Throws MemoryError when the address does not exist in a PLC with this configuration. */
export function checkAddress(addr: Address, config: MemoryConfig): void {
	if (addr.area === 'T') {
		if (addr.index >= config.timers) {
			throw new MemoryError(`${formatAddress(addr)} does not exist (T0–T${config.timers - 1})`);
		}
		return;
	}
	if (addr.area === 'C') {
		if (addr.index >= config.counters) {
			throw new MemoryError(`${formatAddress(addr)} does not exist (C0–C${config.counters - 1})`);
		}
		return;
	}
	const size = areaBytes(addr.area, config);
	if (addr.byte + byteWidth(addr.size) > size) {
		throw new MemoryError(
			`${formatAddress(addr)} is out of range (${addr.area} area has ${size} bytes)`
		);
	}
}

/**
 * PLC data memory: process images I and Q, markers M, timers and counters.
 * Multi-byte values are big-endian, as in Siemens S7 (MW10 = MB10 high byte, MB11 low byte).
 */
export class Memory {
	readonly config: MemoryConfig;
	readonly I: Uint8Array;
	readonly Q: Uint8Array;
	readonly M: Uint8Array;
	readonly timers: TimerState[];
	readonly counters: CounterState[];
	readonly #views: Record<ByteArea, DataView>;

	constructor(config: MemoryConfig = DEFAULT_MEMORY_CONFIG) {
		this.config = config;
		this.I = new Uint8Array(config.inputBytes);
		this.Q = new Uint8Array(config.outputBytes);
		this.M = new Uint8Array(config.markerBytes);
		this.timers = Array.from({ length: config.timers }, newTimerState);
		this.counters = Array.from({ length: config.counters }, newCounterState);
		this.#views = {
			I: new DataView(this.I.buffer),
			Q: new DataView(this.Q.buffer),
			M: new DataView(this.M.buffer)
		};
	}

	bytes(area: ByteArea): Uint8Array {
		return this[area];
	}

	timer(index: number): TimerState {
		checkAddress({ area: 'T', index }, this.config);
		return this.timers[index];
	}

	counter(index: number): CounterState {
		checkAddress({ area: 'C', index }, this.config);
		return this.counters[index];
	}

	readBit(addr: Address): boolean {
		checkAddress(addr, this.config);
		if (addr.area === 'T') return this.timers[addr.index].q;
		if (addr.area === 'C') return this.counters[addr.index].q;
		this.#requireBit(addr);
		return ((this[addr.area][addr.byte] >> addr.bit) & 1) === 1;
	}

	writeBit(addr: Address, value: boolean): void {
		checkAddress(addr, this.config);
		if (addr.area === 'T' || addr.area === 'C') {
			throw new MemoryError(`${formatAddress(addr)} cannot be written directly`);
		}
		this.#requireBit(addr);
		const bytes = this[addr.area];
		if (value) bytes[addr.byte] |= 1 << addr.bit;
		else bytes[addr.byte] &= ~(1 << addr.bit);
	}

	readNumber(addr: Address, type?: NumType): number {
		checkAddress(addr, this.config);
		if (addr.area === 'T') return this.timers[addr.index].et;
		if (addr.area === 'C') return this.counters[addr.index].cv;
		const view = this.#views[addr.area];
		switch (addr.size) {
			case 'X':
				return this.readBit(addr) ? 1 : 0;
			case 'B':
				return view.getUint8(addr.byte);
			case 'W':
				return view.getInt16(addr.byte);
			case 'D':
				return type === 'REAL' ? view.getFloat32(addr.byte) : view.getInt32(addr.byte);
		}
	}

	/** Integer targets truncate toward zero and wrap on overflow, like the real thing. */
	writeNumber(addr: Address, value: number, type?: NumType): void {
		checkAddress(addr, this.config);
		if (addr.area === 'T' || addr.area === 'C') {
			throw new MemoryError(`${formatAddress(addr)} cannot be written directly`);
		}
		const view = this.#views[addr.area];
		const int = Math.trunc(value);
		switch (addr.size) {
			case 'X':
				return this.writeBit(addr, value !== 0);
			case 'B':
				return view.setUint8(addr.byte, int);
			case 'W':
				return view.setInt16(addr.byte, int);
			case 'D':
				return type === 'REAL' ? view.setFloat32(addr.byte, value) : view.setInt32(addr.byte, int);
		}
	}

	/** Cold restart: clears every area, timer and counter. */
	reset(): void {
		this.I.fill(0);
		this.Q.fill(0);
		this.M.fill(0);
		this.timers.forEach((t) => Object.assign(t, newTimerState()));
		this.counters.forEach((c) => Object.assign(c, newCounterState()));
	}

	#requireBit(addr: MemAddress): void {
		if (addr.size !== 'X') throw new MemoryError(`${formatAddress(addr)} is not a bit address`);
	}
}
