import { describe, expect, it } from 'vitest';
import { Plc } from '#lib/engine/index.js';
import { compileSt } from '#lib/st/compiler.js';
import { STDLIB } from '#lib/st/stdlib.js';
import { signature, type SafetyConfig } from './safety.js';
import { deviceSymbols } from '#lib/circuit/model.js';
import { getLesson } from '#lib/lessons/lessons.js';
import { runLessonTests } from '#lib/lessons/runner.js';
import { checkSymbols } from '#lib/symbols/symbols.js';

const cfg = (program: string): SafetyConfig => ({
	inputs: [{ name: 'F_EStop', ch1: 'I8.0', ch2: 'I8.1', discrepancyMs: 200 }],
	outputs: ['Q8.0'],
	ackRei: 'I0.3',
	program
});

const SAFE = `VAR
  estop : ESTOP1;
  k1 : FDBACK;
END_VAR
estop(E_STOP := F_EStop, ACK_NEC := TRUE, ACK := I0.3);
k1(ON := estop.Q AND M10.0, FEEDBACK := NOT I0.2, QBAD_FIO := F_EStop_QBAD, ACK := I0.3, FDB_TIME := T#500ms);
Q8.0 := k1.Q;
Q0.1 := estop.ACK_REQ OR k1.ACK_REQ OR F_EStop_ACK_REQ;
Q0.2 := F_EStop_QBAD;
`;

function load(std: string, program = SAFE) {
	const r = compileSt(std, { prelude: STDLIB, safety: cfg(program) });
	expect(r.diagnostics).toEqual([]);
	const plc = new Plc();
	plc.load(r.program, r.load);
	plc.run();
	return plc;
}
const run = (plc: Plc, ms: number) => {
	for (let t = 0; t < ms; t += 10) {
		// the contactor's NO auxiliary contact follows the coil
		plc.setInput('I0.2', plc.getOutput('Q8.0'));
		plc.scan(10);
	}
};
const pulse = (plc: Plc, a: string) => {
	plc.setInput(a, true);
	run(plc, 30);
	plc.setInput(a, false);
	run(plc, 30);
};

describe('F-CPU', () => {
	it('runs the safety program first and needs an acknowledgement after an e-stop', () => {
		const plc = load('M10.0 := TRUE;');
		plc.setInput('I8.0', true);
		plc.setInput('I8.1', true);
		run(plc, 50);
		expect(plc.getOutput('Q8.0')).toBe(false); // startup: acknowledge first
		expect(plc.getOutput('Q0.1')).toBe(true);
		pulse(plc, 'I0.3');
		expect(plc.getOutput('Q8.0')).toBe(true);
		plc.setInput('I8.0', false);
		plc.setInput('I8.1', false);
		run(plc, 20);
		expect(plc.getOutput('Q8.0')).toBe(false);
		plc.setInput('I8.0', true);
		plc.setInput('I8.1', true);
		run(plc, 100);
		expect(plc.getOutput('Q8.0')).toBe(false);
		pulse(plc, 'I0.3');
		expect(plc.getOutput('Q8.0')).toBe(true);
	});

	it('passivates a channel discrepancy until reintegration', () => {
		const plc = load('M10.0 := TRUE;');
		plc.setInput('I8.0', true);
		plc.setInput('I8.1', true);
		run(plc, 50);
		pulse(plc, 'I0.3');
		plc.setInput('I8.1', false); // wire break in channel 2
		run(plc, 150);
		// fail-safe at once; within the discrepancy time it is not a fault yet
		expect(plc.getOutput('Q8.0')).toBe(false);
		expect(plc.getOutput('Q0.2')).toBe(false);
		run(plc, 100);
		expect(plc.getOutput('Q0.2')).toBe(true); // passivated
		plc.setInput('I8.1', true); // repaired
		run(plc, 100);
		expect(plc.getOutput('Q8.0')).toBe(false);
		expect(plc.getOutput('Q0.2')).toBe(true); // until reintegration
		pulse(plc, 'I0.3');
		expect(plc.getOutput('Q8.0')).toBe(true);
	});

	it('detects a welded contactor with FDBACK', () => {
		const r = compileSt('M10.0 := I0.0;', { prelude: STDLIB, safety: cfg(SAFE) });
		const plc = new Plc();
		plc.load(r.program);
		plc.run();
		plc.setInput('I8.0', true);
		plc.setInput('I8.1', true);
		plc.setInput('I0.0', true);
		const step = (ms: number, welded: boolean) => {
			for (let t = 0; t < ms; t += 10) {
				plc.setInput('I0.2', welded || plc.getOutput('Q8.0'));
				plc.scan(10);
			}
		};
		step(50, false);
		plc.setInput('I0.3', true);
		step(30, false);
		plc.setInput('I0.3', false);
		step(30, false);
		expect(plc.getOutput('Q8.0')).toBe(true);
		plc.setInput('I0.0', false);
		step(800, true); // switched off, but the contacts stay closed
		plc.setInput('I0.0', true);
		step(100, true);
		expect(plc.getOutput('Q8.0')).toBe(false);
	});

	it('keeps the standard program away from F-outputs and F-data', () => {
		const r = compileSt('Q8.0 := TRUE;\nestop.Q := TRUE;\nestop(E_STOP := TRUE);', {
			prelude: STDLIB,
			safety: cfg(SAFE)
		});
		const messages = r.diagnostics.map((d) => d.message).join('\n');
		expect(messages).toMatch(/Q8.0 is a fail-safe output/);
		expect(messages).toMatch(/estop is safety data/);
		expect(messages).toMatch(/belongs to the safety program/);
		// reading F-data is fine
		expect(
			compileSt('Q0.5 := estop.ACK_REQ;', { prelude: STDLIB, safety: cfg(SAFE) }).diagnostics
		).toEqual([]);
	});

	it('restricts the safety program and points at its lines', () => {
		const r = compileSt('', {
			prelude: STDLIB,
			safety: cfg(
				'VAR\n  x : REAL;\n  i : INT;\nEND_VAR\nFOR i := 1 TO 3 DO\n  Q8.0 := TRUE;\nEND_FOR;'
			)
		});
		const m = r.diagnostics.map((d) => d.message);
		expect(m.some((x) => /line 2: REAL is not allowed/.test(x))).toBe(true);
		expect(m.some((x) => /line 5: FOR is not allowed/.test(x))).toBe(true);
		expect(r.diagnostics.every((d) => d.safety)).toBe(true);
	});

	it('changes the signature with the safety program', () => {
		expect(signature(cfg(SAFE))).toMatch(/^[0-9A-F]{8}$/);
		expect(signature(cfg(SAFE))).toBe(signature(cfg(`${SAFE}\n// a comment`)));
		expect(signature(cfg(SAFE))).not.toBe(signature(cfg(SAFE.replace('T#500ms', 'T#300ms'))));
	});
});

describe('the F-CPU lesson', () => {
	const lesson = getLesson('f-estop')!;
	const project = lesson.starter();
	const { map } = checkSymbols([...deviceSymbols(project.circuit), ...project.symbols]);
	const failing = (std: string, safety: string) => {
		const r = compileSt(std, { symbols: map, safety: { ...project.safety!, program: safety } });
		expect(r.diagnostics).toEqual([]);
		return runLessonTests(lesson, r.program, project.circuit, [], r.load)
			.filter((t) => !t.passed)
			.map((t) => t.name);
	};

	it('fails a restart after the acknowledgement and a missing feedback monitoring', () => {
		expect(failing(lesson.solutionSt!, lesson.solutionSafety!)).toEqual([]);
		const autoRestart = lesson.solutionSt!.replace(
			/IF NOT eStop1\.Q THEN run := FALSE; END_IF;/,
			''
		);
		expect(failing(autoRestart, lesson.solutionSafety!)).toContain(
			'E-stop: wyłączenie od razu, kwitowanie nie uruchamia taśmy'
		);
		const noFdback = lesson.solutionSafety!.replace(
			'K1 := fdbK1.Q;',
			'K1 := eStop1.Q AND RunRequest;'
		);
		expect(failing(lesson.solutionSt!, noFdback)).toEqual([
			'Zgrzany stycznik K1: FDBACK nie pozwala na ponowny start'
		]);
	});
});
