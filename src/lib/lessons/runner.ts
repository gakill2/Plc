import { Plc, ProgramError, type Instr } from '#lib/engine/index.js';
import { createProcess } from '#lib/processes/models.js';
import type { Lesson, TestContext, TestResult } from './types.js';

const SCAN_MS = 10;

/**
 * Runs a lesson's tests against a compiled program, headless and deterministic:
 * a fresh PLC (and process model) per test, fixed 10 ms scans.
 */
export function runLessonTests(lesson: Lesson, program: Instr[]): TestResult[] {
	return lesson.tests.map((test) => {
		const plc = new Plc();
		try {
			plc.load(program);
		} catch (e) {
			const message = e instanceof ProgramError ? e.message : String(e);
			return { name: test.name, passed: false, message: `Program się nie ładuje: ${message}` };
		}
		plc.run();

		const process = lesson.scenario ? createProcess(lesson.scenario) : null;
		const io = {
			output: (t: string) => plc.getOutput(t),
			input: (t: string, v: boolean) => plc.setInput(t, v)
		};
		process?.step(0, io); // initial sensor values
		const ctx: TestContext = { plc, process, out: (t) => plc.getOutput(t) };
		const fail = (message: string): TestResult => ({
			name: test.name,
			passed: false,
			message,
			atMs: plc.timeMs
		});

		for (const step of test.steps) {
			for (const [terminal, value] of Object.entries(step.set ?? {})) plc.setInput(terminal, value);
			for (const [name, value] of step.commands ?? []) process?.command(name, value);

			for (let t = 0; t < step.wait; t += SCAN_MS) {
				plc.scan(SCAN_MS);
				if (plc.mode === 'FAULT') return fail(`Błąd PLC: ${plc.fault?.message}`);
				process?.step(SCAN_MS, io);
				const problem = test.always?.(ctx);
				if (problem) return fail(problem);
			}

			for (const [terminal, expected] of Object.entries(step.expect ?? {})) {
				const actual = plc.getOutput(terminal);
				if (actual !== expected) {
					return fail(
						`Po kroku „${step.label}”: ${terminal} powinno być ${expected ? 1 : 0}, a jest ${actual ? 1 : 0}`
					);
				}
			}
			const problem = step.check?.(ctx);
			if (problem) return fail(`Po kroku „${step.label}”: ${problem}`);
		}
		return { name: test.name, passed: true };
	});
}
