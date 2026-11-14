import { describe, expect, it } from 'vitest';
import { parseAddress, Plc } from '#lib/engine/index.js';
import { blockCatalog } from '#lib/st/stdlib.js';
import { compileLadder } from './compiler.js';
import { blockBox, coil, contact, rung, type LadderProgram } from './model.js';

const prog = (...rungs: LadderProgram['rungs']): LadderProgram => ({ version: 1, rungs });

function run(ladder: LadderProgram, library = '') {
	const c = compileLadder(ladder, { library });
	expect(c.diagnostics).toEqual([]);
	const plc = new Plc();
	plc.load(c.program);
	plc.run();
	return plc;
}
const word = (plc: Plc, a: string) => plc.memory.readNumber(parseAddress(a));

describe('function blocks in ladder', () => {
	it('SCALE runs while powered and keeps its output otherwise', () => {
		const plc = run(
			prog(
				rung(
					[
						contact('NO', 'I0.0'),
						blockBox('SCALE', 'Level', { IN: 'IW4', OUT_HI: '1000.0', '>OUT': 'MW20' })
					],
					[coil('COIL', 'Q0.0')]
				)
			)
		);
		plc.setInputNumber('IW4', 13824);
		plc.scan(10);
		expect(word(plc, 'MW20')).toBe(0); // not powered
		expect(plc.getOutput('Q0.0')).toBe(false);
		plc.setInput('I0.0', true);
		plc.scan(10);
		expect(word(plc, 'MW20')).toBe(500);
		expect(plc.getOutput('Q0.0')).toBe(true); // ENO = EN
	});

	it('PID drives its output towards the setpoint, instances are separate', () => {
		const plc = run(
			prog(
				rung(
					[
						blockBox('PID', 'Loop1', {
							SP: '500',
							PV: 'MW10',
							KP: '2.0',
							TI: '0.0',
							'>OUT': 'MW30'
						})
					],
					[coil('COIL', 'M0.0')]
				),
				rung(
					[
						blockBox('PID', 'Loop2', {
							SP: '500',
							PV: 'MW12',
							KP: '0.1',
							TI: '0.0',
							'>OUT': 'MW32'
						})
					],
					[coil('COIL', 'M0.1')]
				)
			)
		);
		plc.memory.writeNumber(parseAddress('MW10'), 480);
		plc.memory.writeNumber(parseAddress('MW12'), 480);
		for (let i = 0; i < 20; i++) plc.scan(10);
		expect(word(plc, 'MW30')).toBe(40); // 2 · (500 − 480)
		expect(word(plc, 'MW32')).toBe(2); // 0.1 · 20
	});

	it('uses the user library and reports problems on the box', () => {
		const library = `FUNCTION_BLOCK Twice
VAR_INPUT x : INT; END_VAR
VAR_OUTPUT y : INT; END_VAR
y := x * 2;
END_FUNCTION_BLOCK`;
		const plc = run(
			prog(rung([blockBox('Twice', 'Dbl', { x: 'MW0', '>y': 'MW2' })], [coil('COIL', 'M0.0')])),
			library
		);
		plc.memory.writeNumber(parseAddress('MW0'), 21);
		plc.scan(10);
		expect(word(plc, 'MW2')).toBe(42);

		const bad = blockBox('PID', 'P1', { NOPE: '1' });
		const c = compileLadder(prog(rung([bad], [coil('COIL', 'M0.0')])));
		expect(c.diagnostics).toEqual([
			{ id: bad.id, message: expect.stringMatching(/no input NOPE/) }
		]);
	});

	it('lists the blocks with their pins', () => {
		const cat = blockCatalog('');
		const pid = cat.find((b) => b.name === 'PID')!;
		expect(pid.inputs.map((p) => p.name)).toContain('KP');
		expect(pid.outputs.map((p) => p.name)).toEqual(['OUT', 'ERR']);
		expect(pid.inputs.find((p) => p.name === 'OUT_HI')?.init).toBe('100.0');
	});
});
