import type { Instr, PlcSnapshot, ProgramIssue } from '#lib/engine/index.js';

/** Messages from the UI to the PLC worker. */
export type RuntimeCommand =
	| { type: 'load'; program: Instr[] }
	| { type: 'run' }
	| { type: 'pause' }
	| { type: 'step' }
	| { type: 'stop' }
	| { type: 'reset' }
	| { type: 'setInput'; address: string; value: boolean }
	| { type: 'setSpeed'; speed: number };

/** What the UI shows: the CPU mode plus whether the simulation clock is paused. */
export type RuntimeStatus = 'STOP' | 'RUN' | 'PAUSED' | 'FAULT';

export interface RuntimeSnapshot extends PlcSnapshot {
	status: RuntimeStatus;
	speed: number;
	scanMs: number;
}

/** Messages from the PLC worker to the UI. */
export type RuntimeEvent =
	| { type: 'snapshot'; snapshot: RuntimeSnapshot }
	| { type: 'loadError'; message: string; issues: ProgramIssue[] };
