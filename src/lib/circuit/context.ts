import { getContext, setContext } from 'svelte';
import type { ProjectState } from '#lib/project/state.svelte.js';
import type { RuntimeSnapshot } from '#lib/runtime/protocol.js';
import type { CircuitSim } from './sim.svelte.js';

export interface CircuitView {
	readonly project: ProjectState;
	readonly sim: CircuitSim;
	readonly snapshot: RuntimeSnapshot | null;
	/** Wiring is locked while the PLC is online; devices can still be operated. */
	readonly locked: boolean;
}

const KEY = Symbol('circuit-view');

export const setCircuitView = (view: CircuitView) => setContext(KEY, view);
export const getCircuitView = () => getContext<CircuitView>(KEY);

/** Bit `byte.bit` of a terminal image from the snapshot. */
export function terminalBit(data: Uint8Array | undefined, terminal: string): boolean {
	const m = /^[IQ](\d+)\.(\d)$/.exec(terminal);
	if (!data || !m) return false;
	return ((data[Number(m[1])] >> Number(m[2])) & 1) === 1;
}
