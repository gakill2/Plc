import type { Plc } from '#lib/engine/index.js';
import type { LadderProgram } from '#lib/ladder/model.js';
import type { Project } from '#lib/project/project.js';
import type { ProcessKind, ProcessModel } from '#lib/processes/types.js';

export interface TestContext {
	plc: Plc;
	process: ProcessModel | null;
	/** Physical output terminal. */
	out(terminal: string): boolean;
}

/** A failing check returns a message for the student, a passing one returns null. */
export type Check = (ctx: TestContext) => string | null;

export interface LessonStep {
	/** Shown in the result, e.g. "press Start". */
	label: string;
	/** Input terminals to set before waiting. */
	set?: Record<string, boolean>;
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
}

export interface Lesson {
	slug: string;
	title: string;
	level: 'basics' | 'logic' | 'timers' | 'process';
	summary: string;
	/** Paragraphs; text in `backticks` is shown as code. */
	instructions: string[];
	hints: string[];
	scenario?: ProcessKind;
	starter: () => Project;
	solution: () => LadderProgram;
	tests: LessonTest[];
}

export interface TestResult {
	name: string;
	passed: boolean;
	message?: string;
	/** Simulated time at which the test failed. */
	atMs?: number;
}
