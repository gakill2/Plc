import { describe, expect, it } from 'vitest';
import { Plc } from '#lib/engine/index.js';
import { compileSt } from '#lib/st/compiler.js';
import {
	checkSfc,
	demoSfc,
	expandCondition,
	sfcStep,
	sfcToSt,
	sfcTransition,
	type Sfc
} from './sfc.js';

function load(sfc: Sfc) {
	const { source } = sfcToSt(sfc);
	const r = compileSt(source);
	expect(r.diagnostics, source).toEqual([]);
	const plc = new Plc();
	plc.load(r.program);
	plc.run();
	return plc;
}
const run = (plc: Plc, ms: number) => {
	for (let t = 0; t < ms; t += 10) plc.scan(10);
};

describe('SFC', () => {
	it('starts in the initial step and follows timed transitions', () => {
		const plc = load(demoSfc());
		run(plc, 50);
		expect(plc.getOutput('Q0.0')).toBe(false);
		plc.setInput('I0.0', true);
		run(plc, 50);
		expect(plc.getOutput('Q0.0')).toBe(true);
		run(plc, 1000);
		expect(plc.getOutput('Q0.0')).toBe(false);
		expect(plc.getOutput('Q0.1')).toBe(true);
		run(plc, 1000);
		expect(plc.getOutput('Q0.0')).toBe(true);
	});

	it('gives the earlier transition priority in an alternative branch', () => {
		const plc = load(demoSfc());
		plc.setInput('I0.0', true);
		run(plc, 1100); // in Off
		plc.setInput('I0.0', false);
		plc.setInput('I0.1', true);
		run(plc, 1500); // Off → Idle wins over Off → On
		expect(plc.getOutput('Q0.0')).toBe(false);
		expect(plc.getOutput('Q0.1')).toBe(false);
	});

	it('runs parallel branches and waits for both at the convergence', () => {
		const sfc: Sfc = {
			steps: [
				sfcStep('Start', true),
				sfcStep('A', false, [['N', 'Q0.0']]),
				sfcStep('B', false, [['N', 'Q0.1']]),
				sfcStep('Done', false, [['S', 'Q0.2']])
			],
			transitions: [
				sfcTransition('Start', ['A', 'B'], 'I0.0'),
				sfcTransition(['A', 'B'], 'Done', 'A.T >= T#200ms AND B.X')
			],
			logic: 'VAR\n  n : INT;\nEND_VAR\nQ0.3 := Done.X;\n'.replace('Done.X', 'X_Done')
		};
		const plc = load(sfc);
		plc.setInput('I0.0', true);
		run(plc, 50);
		expect([plc.getOutput('Q0.0'), plc.getOutput('Q0.1')]).toEqual([true, true]);
		run(plc, 300);
		expect([plc.getOutput('Q0.0'), plc.getOutput('Q0.1'), plc.getOutput('Q0.2')]).toEqual([
			false,
			false,
			true
		]);
		expect(plc.getOutput('Q0.3')).toBe(true);
	});

	it('expands step time and activity in conditions', () => {
		const steps = [sfcStep('Fill')];
		expect(expandCondition('Fill.T >= T#3s AND NOT Fill.X', steps)).toBe(
			'T_Fill.ET >= T#3s AND NOT X_Fill'
		);
	});

	it('reports chart mistakes', () => {
		const sfc: Sfc = {
			steps: [sfcStep('A'), sfcStep('a'), sfcStep('9x')],
			transitions: [sfcTransition('A', 'Nope', '')],
			logic: ''
		};
		const messages = checkSfc(sfc).map((i) => i.message);
		expect(messages).toEqual(
			expect.arrayContaining([
				'Dwa kroki o nazwie „a”',
				expect.stringMatching(/9x/),
				'Brak kroku początkowego (zaznacz „początkowy”)',
				'Przejście 1: nie ma kroku „Nope”',
				'Przejście 1: brak warunku'
			])
		);
	});
});
