import type { AlarmLog } from '#lib/hmi/alarms.js';
import type { AlarmDef } from '#lib/hmi/model.js';
import type { Fault } from '#lib/circuit/model.js';
import type { Hardware } from '#lib/hw/hw.js';
import type { Plc } from '#lib/engine/index.js';
import type { LadderProgram } from '#lib/ladder/model.js';
import type { Project } from '#lib/project/project.js';
import type { Circuit } from '#lib/circuit/model.js';
import type { Hmi } from '#lib/hmi/model.js';
import type { Sfc } from '#lib/sfc/sfc.js';
import type { Fbd } from '#lib/fbd/fbd.js';
import type { SignalFault } from '#lib/processes/field.js';
import type { ProcessKind, ProcessModel } from '#lib/processes/types.js';

export interface TestContext {
	plc: Plc;
	process: ProcessModel | null;
	/** Physical output terminal. */
	out(terminal: string): boolean;
	/** A device of the circuit by its label (commissioning lessons): is it on, how fast. */
	device(label: string): { on: boolean; hz: number } | null;
	/** the operator panel's alarm log, evaluated after every scan (lessons with an HMI) */
	alarms: AlarmLog;
	/** the alarm definitions of the project's panel */
	alarmDefs: readonly AlarmDef[];
	/** a variable of the ST program by name (a DB field, a STRING …), null if unknown */
	value(name: string): boolean | number | string | null;
}

/** A failing check returns a message for the student, a passing one returns null. */
export type Check = (ctx: TestContext) => string | null;

export interface LessonStep {
	/** Shown in the result, e.g. "press Start". */
	label: string;
	/** Input terminals to set before waiting. */
	set?: Record<string, boolean>;
	/**
	 * Commissioning lessons: operate devices of the circuit by label (press S1, trip K1 …).
	 * Values stay until changed by a later step.
	 */
	/** write variables of the program, like an operator on a recipe screen: `{ 'Recipes.Items[2].Temp': 520 }` */
	vars?: Record<string, number>;
	/** faults of field devices from this step on (a wire break, a welded contact …) */
	deviceFaults?: Fault[];
	actuate?: Record<string, boolean>;
	/** Values written like an operator panel does, e.g. `{ 'M10.0': 1 }` (an HMI button). */
	hmi?: Record<string, number>;
	/** Commissioning lessons: expected state of devices by label (lamp lit, contactor pulled in …). */
	expectDevices?: Record<string, boolean>;
	/** Inject (or clear, with null) faults of sensors between the plant and the PLC. */
	fieldFaults?: Record<string, SignalFault | null>;
	/** Switch faults of the plant itself on or off, e.g. `{ jam: true }`. */
	plantFaults?: Record<string, boolean>;
	/**
	 * Power loss first, for that many ms: outputs drop (monostable valves spring back), the plant
	 * keeps moving, then a cold start — only RETAIN data survives.
	 */
	powerLoss?: number;
	/** Restart the CPU first (Stop → Run: a new download) — retentive variables must survive it. */
	restart?: boolean;
	/** Commands to the process model (e.g. feed boxes). */
	commands?: [name: string, value?: unknown][];
	/** Simulated time to run, in ms. */
	wait: number;
	/** Expected output terminal values after waiting. */
	expect?: Record<string, boolean>;
	check?: Check;
}

export interface LessonTest {
	name: string;
	steps: LessonStep[];
	/** Checked after every scan of the whole test (safety conditions). */
	always?: Check;
	/**
	 * Run the scenario many times, interrupting it at each of these moments (Stop, power loss …
	 * in every step of the cycle). `steps` is then ignored; the first failing run is reported.
	 */
	sweep?: {
		atMs: number[];
		steps: (atMs: number) => LessonStep[];
		/** names the run in the failure message, e.g. "Stop po 1,3 s" */
		label: (atMs: number) => string;
	};
}

export interface Lesson {
	slug: string;
	/** build = write the program, debug = find and fix the bug in a given program */
	kind?: 'build' | 'debug' | 'commissioning' | 'capstone' | 'brownfield';
	/** Run the tests through the project's circuit (like commissioning lessons do). */
	fieldTests?: boolean;
	/** Commissioning: the correctly wired circuit (the program is right from the start). */
	solutionCircuit?: () => Circuit;
	/** The finished operator panel (HMI lessons). */
	solutionHmi?: () => Hmi;
	title: string;
	level: 'basics' | 'logic' | 'timers' | 'process';
	summary: string;
	/** Paragraphs; text in `backticks` is shown as code. */
	instructions: string[];
	hints: string[];
	scenario?: ProcessKind;
	starter: () => Project;
	solution: () => LadderProgram;
	/** Structured Text lessons: the reference solution as ST source (the ladder one is empty). */
	solutionSt?: string;
	/** SFC lessons: the reference chart. */
	solutionSfc?: () => Sfc;
	/** Analog noise and range limits on the plant's sensors. */
	realism?: boolean;
	/** FBD lessons: the reference diagram */
	/** the versions a finished change leaves behind (change-management lessons) */
	solutionHistory?: () => { name: string; comment: string }[];
	/** reference safety program (F-CPU lessons) */
	solutionSafety?: string;
	/** reference hardware configuration (hardware lessons) */
	solutionHw?: () => Hardware;
	/** reference solution in Statement List (STL lessons) */
	solutionStl?: string;
	solutionFbd?: () => Fbd;
	tests: LessonTest[];
}

export interface TestResult {
	name: string;
	passed: boolean;
	message?: string;
	/** Simulated time at which the test failed. */
	atMs?: number;
}
