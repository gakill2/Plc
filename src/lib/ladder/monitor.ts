import {
	formatAddress,
	parseAddress,
	type CounterState,
	type TimerState
} from '#lib/engine/index.js';
import type { RuntimeSnapshot } from '#lib/runtime/protocol.js';
import { readBit, readNumber } from '#lib/runtime/read.js';

/** Live values for the editor while the PLC is online. */
export interface Monitor {
	/** Power on the right side of a node (null = rail, always powered). */
	power(id: string | null): boolean;
	/** Current value of a bit operand, or null if the operand is invalid. */
	bit(operand: string): boolean | null;
	timer(operand: string): TimerState | null;
	counter(operand: string): CounterState | null;
	number(operand: string): number | null;
	/** The forced value of a bit operand, or null if it is not forced. */
	forced(operand: string): boolean | null;
}

export function createMonitor(
	snapshot: RuntimeSnapshot,
	taps: Map<string, number>,
	resolve: (operand: string) => string = (o) => o
): Monitor {
	const parse = (text: string) => {
		try {
			return parseAddress(resolve(text));
		} catch {
			return null;
		}
	};
	const forces = new Map(snapshot.forces.map((f) => [f.address, f.value]));

	return {
		power(id) {
			if (id === null) return true;
			const slot = taps.get(id);
			return slot !== undefined && snapshot.taps[slot] === 1;
		},
		bit(operand) {
			const a = parse(operand);
			return a ? readBit(snapshot, a) : null;
		},
		timer(operand) {
			const a = parse(operand);
			return a?.area === 'T' ? (snapshot.timers[a.index] ?? null) : null;
		},
		counter(operand) {
			const a = parse(operand);
			return a?.area === 'C' ? (snapshot.counters[a.index] ?? null) : null;
		},
		number(operand) {
			const a = parse(operand);
			return a ? readNumber(snapshot, a) : null;
		},
		forced(operand) {
			if (forces.size === 0) return null;
			const a = parse(operand);
			return a ? (forces.get(formatAddress(a)) ?? null) : null;
		}
	};
}
