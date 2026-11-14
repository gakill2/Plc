import type { Instr, LoadOptions, NumType, PlcSnapshot, ProgramIssue } from '#lib/engine/index.js';
import type { ProcessKind, ProcessState } from '#lib/processes/types.js';

/** A signal recorded for the timing diagram. `bit` reads Q of timers/counters, `number` reads ET/CV. */
export interface TraceSignal {
	address: string;
	kind: 'bit' | 'number';
	type?: NumType;
}

/** Values of all traced signals at simulated time `t` (only stored when something changed). */
export interface TraceSample {
	t: number;
	v: number[];
}

/** Messages from the UI to the PLC worker. */
export type RuntimeCommand =
	| { type: 'load'; program: Instr[]; options?: LoadOptions }
	| { type: 'run' }
	| { type: 'pause' }
	| { type: 'step' }
	| { type: 'stop' }
	| { type: 'reset' }
	| { type: 'setInput'; address: string; value: boolean }
	| { type: 'setInputNumber'; address: string; value: number }
	| { type: 'setSpeed'; speed: number }
	| { type: 'force'; address: string; value: boolean | null }
	| { type: 'clearForces' }
	| { type: 'modify'; address: string; value: number; numType?: NumType }
	| { type: 'setTrace'; signals: TraceSignal[] }
	| { type: 'setProcess'; kind: ProcessKind | null }
	| { type: 'processCommand'; name: string; value?: unknown };

/** What the UI shows: the CPU mode plus whether the simulation clock is paused. */
export type RuntimeStatus = 'STOP' | 'RUN' | 'PAUSED' | 'FAULT';

export interface RuntimeSnapshot extends PlcSnapshot {
	status: RuntimeStatus;
	speed: number;
	scanMs: number;
	/** New trace samples since the previous snapshot. A new epoch means "start over". */
	trace: { epoch: number; samples: TraceSample[] };
	/** State of the simulated plant, if the project has one. */
	process: ProcessState | null;
}

/** Messages from the PLC worker to the UI. */
export type RuntimeEvent =
	| { type: 'snapshot'; snapshot: RuntimeSnapshot }
	| { type: 'loadError'; message: string; issues: ProgramIssue[] }
	| { type: 'commandError'; message: string };
