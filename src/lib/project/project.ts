import { demoCircuit, type Circuit } from '#lib/circuit/model.js';
import { demoProgram } from '#lib/ladder/defaults.js';
import type { LadderProgram } from '#lib/ladder/model.js';
import { demoWatch, type WatchEntry } from '#lib/monitor/watch.js';
import type { SymbolEntry } from '#lib/symbols/symbols.js';

/** Everything that is saved: the program, the wiring and the user's symbols. */
export interface Project {
	version: 2;
	ladder: LadderProgram;
	circuit: Circuit;
	symbols: SymbolEntry[];
	/** Rows of the watch table (also: which signals are trended). */
	watch: WatchEntry[];
}

export const demoProject = (): Project => ({
	version: 2,
	ladder: demoProgram(),
	circuit: demoCircuit(),
	watch: demoWatch(),
	symbols: [
		{
			id: 'sym-motor-starts',
			name: 'MotorStarts',
			address: 'C0',
			comment: 'Number of motor starts'
		},
		{ id: 'sym-run-delay', name: 'RunDelay', address: 'T0', comment: 'Delay before "running" lamp' }
	]
});

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const isLadder = (v: unknown): v is LadderProgram =>
	isObject(v) && v.version === 1 && Array.isArray(v.rungs);
const isCircuit = (v: unknown): v is Circuit =>
	isObject(v) && isObject(v.plc) && Array.isArray(v.devices) && Array.isArray(v.wires);

/** Accepts a saved project (any known version) and returns the current format, or null. */
export function parseProject(raw: unknown): Project | null {
	if (isObject(raw) && raw.version === 2 && isLadder(raw.ladder) && isCircuit(raw.circuit)) {
		return {
			version: 2,
			ladder: raw.ladder,
			circuit: raw.circuit,
			symbols: Array.isArray(raw.symbols) ? (raw.symbols as SymbolEntry[]) : [],
			watch: Array.isArray(raw.watch) ? (raw.watch as WatchEntry[]) : demoWatch()
		};
	}
	// stage 2 saved the bare ladder program
	if (isLadder(raw)) {
		return { version: 2, ladder: raw, circuit: demoCircuit(), symbols: [], watch: demoWatch() };
	}
	return null;
}

export const projectKey = (id: string) => `plcsim:project:${id}`;
const legacyKey = (id: string) => `plcsim:ladder:${id}`;

export function loadProject(storage: Pick<Storage, 'getItem'>, id: string): Project {
	for (const key of [projectKey(id), legacyKey(id)]) {
		try {
			const project = parseProject(JSON.parse(storage.getItem(key) ?? 'null'));
			if (project) return project;
		} catch {
			// corrupted save — try the next one
		}
	}
	return demoProject();
}
