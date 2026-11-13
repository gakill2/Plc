import { parseAddress, type CounterState, type TimerState } from '#lib/engine/index.js';
import type { RuntimeSnapshot } from '#lib/runtime/protocol.js';

/** Live values for the editor while the PLC is online. */
export interface Monitor {
	/** Power on the right side of a node (null = rail, always powered). */
	power(id: string | null): boolean;
	/** Current value of a bit operand, or null if the operand is invalid. */
	bit(operand: string): boolean | null;
	timer(operand: string): TimerState | null;
	counter(operand: string): CounterState | null;
	number(operand: string): number | null;
}

export function createMonitor(
	snapshot: RuntimeSnapshot,
	taps: Map<string, number>,
	resolve: (operand: string) => string = (o) => o
): Monitor {
	const tryParse = (text: string) => {
		try {
			return parseAddress(text);
		} catch {
			return null;
		}
	};

	return {
		power(id) {
			if (id === null) return true;
			const slot = taps.get(id);
			return slot !== undefined && snapshot.taps[slot] === 1;
		},
		bit(operand) {
			const a = tryParse(resolve(operand));
			if (!a) return null;
			if (a.area === 'T') return snapshot.timers[a.index]?.q ?? null;
			if (a.area === 'C') return snapshot.counters[a.index]?.q ?? null;
			if (a.size !== 'X') return null;
			const byte = snapshot[a.area][a.byte];
			return byte === undefined ? null : ((byte >> a.bit) & 1) === 1;
		},
		timer(operand) {
			const a = tryParse(resolve(operand));
			return a?.area === 'T' ? (snapshot.timers[a.index] ?? null) : null;
		},
		counter(operand) {
			const a = tryParse(resolve(operand));
			return a?.area === 'C' ? (snapshot.counters[a.index] ?? null) : null;
		},
		number(operand) {
			const a = tryParse(resolve(operand));
			if (!a) return null;
			if (a.area === 'T') return snapshot.timers[a.index]?.et ?? null;
			if (a.area === 'C') return snapshot.counters[a.index]?.cv ?? null;
			const bytes = snapshot[a.area];
			const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
			try {
				if (a.size === 'X') return (bytes[a.byte] >> a.bit) & 1;
				if (a.size === 'B') return view.getUint8(a.byte);
				if (a.size === 'W') return view.getInt16(a.byte);
				return view.getInt32(a.byte);
			} catch {
				return null;
			}
		}
	};
}
