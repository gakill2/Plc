import { isSfc, type Sfc } from '#lib/sfc/sfc.js';
import { isFbd, type Fbd } from '#lib/fbd/fbd.js';
import { isHardware, type Hardware } from '#lib/hw/hw.js';
import { isSafety, type SafetyConfig } from '#lib/safety/safety.js';
import { demoHmi, isHmi, type Hmi } from '#lib/hmi/model.js';
import { demoCircuit, type Circuit } from '#lib/circuit/model.js';
import { demoProgram } from '#lib/ladder/defaults.js';
import type { LadderProgram } from '#lib/ladder/model.js';
import { demoWatch, type WatchEntry } from '#lib/monitor/watch.js';
import { DEMO_ST } from '#lib/st/examples.js';
import type { SymbolEntry } from '#lib/symbols/symbols.js';
import { isProcessKind } from '#lib/processes/models.js';
import type { ProcessKind } from '#lib/processes/types.js';

/** Everything that is saved: the program, the wiring and the user's symbols. */
export interface Project {
	version: 2;
	name?: string;
	/** Last save, ms since epoch. */
	updatedAt?: number;
	ladder: LadderProgram;
	circuit: Circuit;
	symbols: SymbolEntry[];
	/** Rows of the watch table (also: which signals are trended). */
	watch: WatchEntry[];
	/** Simulated plant attached to the project. */
	scenario?: ProcessKind;
	/** Lesson this project belongs to. */
	lesson?: string;
	/** Which program is active: the ladder diagram or the Structured Text source. */
	language?: ProgramLanguage;
	/** Structured Text source (kept even while the ladder program is active). */
	st?: string;
	/** Operator panel and alarms. */
	hmi?: Hmi;
	/** Sequential function chart (when the SFC language is active). */
	sfc?: Sfc;
	/** The project's own function blocks (ST source), usable from LAD, ST and SFC. */
	library?: string;
	/** Function block diagram (when the FBD language is active). */
	fbd?: Fbd;
	/** Statement List source (when the STL language is active). */
	stl?: string;
	/** The rack: I/O modules, their addresses and measuring types, and the field wiring. */
	hw?: Hardware;
	/** F-CPU: the safety program and its fail-safe I/O. */
	safety?: SafetyConfig;
}

export type ProgramLanguage = 'ladder' | 'st' | 'sfc' | 'fbd' | 'stl';

export const demoProject = (): Project => ({
	version: 2,
	name: 'Motor demo',
	ladder: demoProgram(),
	circuit: demoCircuit(),
	watch: demoWatch(),
	language: 'ladder',
	st: DEMO_ST,
	hmi: demoHmi(),
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
			name: typeof raw.name === 'string' ? raw.name : undefined,
			updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : undefined,
			ladder: raw.ladder,
			circuit: raw.circuit,
			symbols: Array.isArray(raw.symbols) ? (raw.symbols as SymbolEntry[]) : [],
			watch: Array.isArray(raw.watch) ? (raw.watch as WatchEntry[]) : demoWatch(),
			scenario: isProcessKind(raw.scenario) ? raw.scenario : undefined,
			lesson: typeof raw.lesson === 'string' ? raw.lesson : undefined,
			language:
				raw.language === 'st' ||
				raw.language === 'sfc' ||
				raw.language === 'fbd' ||
				raw.language === 'stl'
					? raw.language
					: 'ladder',
			st: typeof raw.st === 'string' ? raw.st : '',
			hmi: isHmi(raw.hmi) ? raw.hmi : undefined,
			sfc: isSfc(raw.sfc) ? raw.sfc : undefined,
			library: typeof raw.library === 'string' ? raw.library : undefined,
			fbd: isFbd(raw.fbd) ? raw.fbd : undefined,
			stl: typeof raw.stl === 'string' ? raw.stl : undefined,
			hw: isHardware(raw.hw) ? raw.hw : undefined,
			safety: isSafety(raw.safety) ? raw.safety : undefined
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

export function loadProject(
	storage: Pick<Storage, 'getItem'>,
	id: string,
	fallback: () => Project = demoProject
): Project {
	for (const key of [projectKey(id), legacyKey(id)]) {
		try {
			const project = parseProject(JSON.parse(storage.getItem(key) ?? 'null'));
			if (project) return project;
		} catch {
			// corrupted save — try the next one
		}
	}
	return fallback();
}
