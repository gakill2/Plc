import { describe, expect, it } from 'vitest';
import { Plc, parseAddress } from '#lib/engine/index.js';
import { compileSt } from '#lib/st/compiler.js';
import { STDLIB } from '#lib/st/stdlib.js';
import { AxisProcess } from './axis.js';
import { deviceSymbols } from '#lib/circuit/model.js';
import { getLesson } from '#lib/lessons/lessons.js';
import { runLessonTests } from '#lib/lessons/runner.js';
import { checkSymbols } from '#lib/symbols/symbols.js';

function rig(src: string) {
	const r = compileSt(src, { prelude: STDLIB });
	expect(r.diagnostics).toEqual([]);
	const plc = new Plc();
	plc.load(r.program, r.load);
	plc.run();
	const axis = new AxisProcess();
	const io = {
		output: (t: string) => plc.getOutput(t),
		input: (t: string, v: boolean) => plc.setInput(t, v),
		word: (a: string) => plc.memory.readNumber(parseAddress(a)),
		setWord: (a: string, v: number) => plc.setInputNumber(a, v)
	};
	axis.step(0, io);
	const run = (ms: number) => {
		for (let t = 0; t < ms; t += 10) {
			plc.scan(10);
			axis.step(10, io);
		}
	};
	return { plc, axis, run };
}

const PROGRAM = `VAR
  power : MC_Power;
  home : MC_Home;
  move : MC_MoveAbsolute;
  stop : MC_Stop;
  reset : MC_Reset;
END_VAR
power(Enable := M0.0);
home(Execute := M0.1, Position := 0.0);
move(Execute := M0.2, Position := MD10_pos, Velocity := 400.0, Acceleration := 2000.0);
stop(Execute := M0.3, Deceleration := 4000.0);
reset(Execute := M0.4);
Q1.0 := home.Done;
Q1.1 := move.Done;
Q1.2 := move.Busy;
Q1.3 := move.Error;
Q1.4 := move.CommandAborted;
MW20 := move.ErrorID;
Q1.5 := power.Error;
`.replace('MD10_pos', 'DINT_TO_REAL(MD10) / 1000.0');

describe('servo axis with PLCopen blocks', () => {
	it('powers, homes and moves to a position with a trapezoid profile', () => {
		const { plc, axis, run } = rig(PROGRAM);
		const set = (a: string, v: boolean) => plc.modify(a, v ? 1 : 0);
		plc.memory.writeNumber(parseAddress('MD10'), 650_000);
		set('M0.2', true); // move before homing: rejected
		run(50);
		set('M0.0', true);
		run(200);
		set('M0.2', false);
		run(20);
		set('M0.2', true);
		run(50);
		expect(plc.getOutput('Q1.3')).toBe(true);
		expect(plc.memory.readNumber(parseAddress('MW20'))).toBe(2); // not homed
		set('M0.2', false);
		set('M0.1', true);
		run(8000);
		expect(plc.getOutput('Q1.0')).toBe(true);
		expect(axis.homed).toBe(true);
		set('M0.2', true);
		run(20);
		expect(plc.getOutput('Q1.2')).toBe(true);
		let vmax = 0;
		for (let i = 0; i < 300; i++) {
			run(10);
			vmax = Math.max(vmax, axis.v);
		}
		expect(plc.getOutput('Q1.1')).toBe(true);
		expect(axis.state().position).toBeCloseTo(650, 2);
		expect(vmax).toBeCloseTo(400, 0);
	});

	it('aborts a move with a newer command and stops', () => {
		const { plc, axis, run } = rig(PROGRAM);
		const set = (a: string, v: boolean) => plc.modify(a, v ? 1 : 0);
		set('M0.0', true);
		run(200); // home only once the drive reports PowerOn
		set('M0.1', true);
		run(8000);
		plc.memory.writeNumber(parseAddress('MD10'), 900_000);
		set('M0.2', true);
		run(500);
		set('M0.3', true);
		run(500);
		expect(plc.getOutput('Q1.4')).toBe(true); // CommandAborted
		expect(axis.state().mode).toBe('Standstill');
		expect(axis.state().position).toBeLessThan(900);
	});

	it('goes to ErrorStop on a blocked axis and recovers with MC_Reset', () => {
		const { plc, axis, run } = rig(PROGRAM);
		const set = (a: string, v: boolean) => plc.modify(a, v ? 1 : 0);
		set('M0.0', true);
		run(200); // home only once the drive reports PowerOn
		set('M0.1', true);
		run(8000);
		axis.command('fault', { id: 'blocked', on: true });
		plc.memory.writeNumber(parseAddress('MD10'), 500_000);
		set('M0.2', true);
		run(1000);
		expect(axis.state().mode).toBe('ErrorStop');
		expect(plc.getOutput('Q1.3')).toBe(true);
		expect(plc.memory.readNumber(parseAddress('MW20'))).toBe(5);
		expect(plc.getOutput('Q1.5')).toBe(true);
		axis.command('fault', { id: 'blocked', on: false });
		set('M0.4', true);
		run(100);
		expect(axis.state().mode).toBe('Standstill');
	});

	it('rejects a target outside the software limits', () => {
		const { plc, run } = rig(PROGRAM);
		const set = (a: string, v: boolean) => plc.modify(a, v ? 1 : 0);
		set('M0.0', true);
		run(200); // home only once the drive reports PowerOn
		set('M0.1', true);
		run(8000);
		plc.memory.writeNumber(parseAddress('MD10'), 1_200_000);
		set('M0.2', true);
		run(100);
		expect(plc.memory.readNumber(parseAddress('MW20'))).toBe(3);
	});
});

describe('the pick-and-place lesson', () => {
	const lesson = getLesson('motion-pickplace')!;
	const project = lesson.starter();
	const { map } = checkSymbols([...deviceSymbols(project.circuit), ...project.symbols]);
	const failing = (src: string) => {
		const r = compileSt(src, { symbols: map, prelude: STDLIB });
		expect(r.diagnostics).toEqual([]);
		return runLessonTests(lesson, r.program, project.circuit, [], r.load)
			.filter((t) => !t.passed)
			.map((t) => t.name);
	};

	it('fails a program without Stop handling or without error recovery', () => {
		const sol = lesson.solutionSt!;
		expect(failing(sol)).toEqual([]);
		const noStop = sol.replace(
			/IF NOT Stop AND \(step = 5 OR step = 10 OR step = 30\) THEN[\s\S]*?END_IF;/,
			''
		);
		expect(failing(noStop)).toContain(
			'Stop w ruchu: oś staje z rampą, chwytak trzyma, Start wznawia'
		);
		const noReset = sol.replace('reset(Execute := step = 99 AND Ack);', 'reset(Execute := FALSE);');
		expect(failing(noReset)).toContain(
			'Przeszkoda na torze: ErrorStop, lampka; po Ack i Start dalej bez straty detalu'
		);
	});
});
