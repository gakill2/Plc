import { describe, expect, it } from 'vitest';
import { disassemble, Plc } from '#lib/engine/index.js';
import { compileLadder, inputTap } from './compiler.js';
import { demoProgram } from './defaults.js';
import {
	coil,
	compare,
	contact,
	counterBox,
	parallel,
	rung,
	timer,
	type LadderProgram,
	type Parallel
} from './model.js';

const program = (...rungs: ReturnType<typeof rung>[]): LadderProgram => ({ version: 1, rungs });

function load(ladder: LadderProgram) {
	const compiled = compileLadder(ladder);
	expect(compiled.diagnostics).toEqual([]);
	const plc = new Plc();
	plc.load(compiled.program);
	plc.run();
	const power = (id: string) => plc.snapshot().taps[compiled.taps.get(id)!] === 1;
	return { plc, compiled, power };
}

describe('compileLadder', () => {
	it('emits readable IL for a simple rung', () => {
		const ladder = program(
			rung([contact('NO', 'I0.0'), contact('NC', 'I0.1')], [coil('COIL', 'Q0.0')])
		);
		const il = disassemble(compileLadder(ladder).program).filter((l) => !l.startsWith('TAP'));
		expect(il).toEqual(['LD I0.0', 'ANDN I0.1', 'ST Q0.0', 'POP']);
	});

	it('runs the demo start/stop circuit with self-holding', () => {
		const { plc } = load(demoProgram());
		plc.setInput('I0.0', true);
		plc.scan(10);
		plc.setInput('I0.0', false);
		plc.scan(10);
		expect(plc.getOutput('Q0.0')).toBe(true);
		plc.setInput('I0.1', true); // stop (NC contact in the program)
		plc.scan(10);
		expect(plc.getOutput('Q0.0')).toBe(false);
	});

	it('gives a timer inside a branch the power from the left of the block', () => {
		const t = timer('TON', 'T0', 'T#50ms');
		const ladder = program(
			rung(
				[contact('NO', 'I0.0'), parallel([[contact('NO', 'I0.1')], [contact('NO', 'I0.2'), t]])],
				[coil('COIL', 'Q0.0')]
			)
		);
		const { plc } = load(ladder);
		plc.setInput('I0.2', true); // branch closed, but I0.0 open → timer must not run
		for (let i = 0; i < 10; i++) plc.scan(10);
		expect(plc.snapshot().timers[0].et).toBe(0);
		plc.setInput('I0.0', true);
		for (let i = 0; i < 6; i++) plc.scan(10);
		expect(plc.getOutput('Q0.0')).toBe(true);
	});

	it('records power flow for every element, branch and rung', () => {
		const a = contact('NO', 'I0.0');
		const b = contact('NO', 'I0.1');
		const c = contact('NC', 'I0.2');
		const p = parallel([[a], [b]]);
		const r = rung([p, c], [coil('COIL', 'Q0.0')]);
		const { plc, power } = load(program(r));

		plc.setInput('I0.1', true);
		plc.scan(10);
		expect([
			power(inputTap(p.id)),
			power(a.id),
			power(b.id),
			power(p.id),
			power(c.id),
			power(r.id)
		]).toEqual([true, false, true, true, true, true]);

		plc.setInput('I0.2', true);
		plc.scan(10);
		expect([power(p.id), power(c.id), power(r.id)]).toEqual([true, false, false]);
	});

	it('supports edges, set/reset coils, counters and compare', () => {
		const ladder = program(
			rung([contact('P', 'I0.0'), counterBox('CTU', 'C1', '2', 'I0.1')], [coil('SET', 'Q0.0')]),
			rung([contact('NO', 'I0.1')], [coil('RESET', 'Q0.0')]),
			rung([compare('>=', 'C1', '1')], [coil('COIL', 'Q0.1'), coil('NCOIL', 'Q0.2')])
		);
		const { plc } = load(ladder);
		const pulse = () => {
			plc.setInput('I0.0', true);
			plc.scan(10);
			plc.setInput('I0.0', false);
			plc.scan(10);
		};
		pulse();
		expect([plc.getOutput('Q0.0'), plc.getOutput('Q0.1'), plc.getOutput('Q0.2')]).toEqual([
			false,
			true,
			false
		]);
		pulse();
		expect(plc.getOutput('Q0.0')).toBe(true);
		plc.setInput('I0.1', true);
		plc.scan(10);
		expect([plc.getOutput('Q0.0'), plc.getOutput('Q0.1')]).toEqual([false, false]);
	});

	it('an empty rung is connected straight to the rail', () => {
		const { plc } = load(program(rung([], [coil('COIL', 'Q0.3')])));
		plc.scan(10);
		expect(plc.getOutput('Q0.3')).toBe(true);
	});

	it('reports bad operands on the element that owns them', () => {
		const bad = contact('NO', 'I0');
		const t = timer('TON', 'C1', '');
		const out = coil('COIL', 'I0.0');
		const r = rung([bad, t], [out]);
		const { diagnostics } = compileLadder(program(r, rung([contact()], [])));
		const byId = (id: string) => diagnostics.filter((d) => d.id === id).map((d) => d.message);

		expect(byId(bad.id)).toEqual([expect.stringMatching(/bit number/)]);
		expect(byId(t.id)).toEqual([
			expect.stringMatching(/not a timer/),
			expect.stringMatching(/Preset time/)
		]);
		expect(byId(out.id)).toEqual([expect.stringMatching(/cannot be written/)]);
		expect(diagnostics.some((d) => /no output/.test(d.message))).toBe(true);
	});

	it('nests parallels', () => {
		const inner = parallel([[contact('NO', 'I0.2')], [contact('NO', 'I0.3')]]);
		const outer = parallel([[contact('NO', 'I0.0'), inner], [contact('NO', 'I0.1')]]) as Parallel;
		const { plc } = load(program(rung([outer], [coil('COIL', 'Q0.0')])));
		const check = (inputs: string[]) => {
			for (const i of ['I0.0', 'I0.1', 'I0.2', 'I0.3']) plc.setInput(i, inputs.includes(i));
			plc.scan(10);
			return plc.getOutput('Q0.0');
		};
		expect(check(['I0.0'])).toBe(false);
		expect(check(['I0.0', 'I0.3'])).toBe(true);
		expect(check(['I0.1'])).toBe(true);
		expect(check(['I0.2', 'I0.3'])).toBe(false);
	});

	it('resolves symbol names in operands', () => {
		const symbols = new Map([
			['START', 'I0.0'],
			['MOTOR', 'Q0.0'],
			['DELAY', 'T3']
		]);
		const ladder = program(
			rung([contact('NO', 'start'), timer('TON', 'Delay', 'T#1s')], [coil('COIL', 'Motor')])
		);
		const { program: code, diagnostics } = compileLadder(ladder, { symbols });
		expect(diagnostics).toEqual([]);
		expect(disassemble(code).filter((l) => !l.startsWith('TAP'))).toEqual([
			'LD I0.0',
			'TON T3, 1000',
			'ST Q0.0',
			'POP'
		]);
		expect(compileLadder(ladder).diagnostics).toHaveLength(3); // unknown without the table
	});
});
