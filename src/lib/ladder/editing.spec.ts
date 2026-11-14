import { describe, expect, it } from 'vitest';
import { disassemble, parseAddress, Plc } from '#lib/engine/index.js';
import { compileLadder } from './compiler.js';
import {
	coil,
	contact,
	mathBox,
	moveBox,
	parallel,
	rung,
	timer,
	type LadderProgram,
	type Parallel
} from './model.js';
import { cloneWithNewIds, insertBefore } from './ops.js';

const ids = (r: ReturnType<typeof rung>) =>
	r.logic.items.map((e) => (e.kind === 'contact' ? e.operand : e.kind));

describe('insertBefore', () => {
	it('inserts before an element, at the start of a branch, or at the start of the rung', () => {
		const b = contact('NO', 'B');
		const r = rung([b]);
		insertBefore(r, b.id, contact('NO', 'A'));
		insertBefore(r, null, contact('NO', 'Z'));
		expect(ids(r)).toEqual(['Z', 'A', 'B']);

		const p = parallel([[contact('NO', 'M0.0')], [contact('NO', 'M0.1')]]);
		r.logic.items.push(p);
		insertBefore(r, p.branches[1].id, contact('NC', 'M0.2'));
		expect(p.branches[1].items.map((e) => (e.kind === 'contact' ? e.operand : ''))).toEqual([
			'M0.2',
			'M0.1'
		]);
	});
});

describe('cloneWithNewIds', () => {
	it('copies deeply and gives every node a new id', () => {
		const original = rung(
			[parallel([[contact()], [contact(), timer()]])],
			[coil(), coil('SET', 'M0.0')],
			'note'
		);
		const copy = cloneWithNewIds(original);
		const collect = (r: typeof original) => {
			const out: string[] = [r.id, r.logic.id, ...r.coils.map((c) => c.id)];
			const p = r.logic.items[0] as Parallel;
			out.push(p.id, ...p.branches.flatMap((b) => [b.id, ...b.items.map((e) => e.id)]));
			return out;
		};
		const before = collect(original);
		const after = collect(copy);
		expect(after).toHaveLength(before.length);
		expect(after.some((id) => before.includes(id))).toBe(false);
		expect(copy.comment).toBe('note');
		(copy.logic.items[0] as Parallel).branches.pop();
		expect((original.logic.items[0] as Parallel).branches).toHaveLength(2); // independent
	});
});

describe('MOVE and MATH boxes', () => {
	const program = (...rungs: ReturnType<typeof rung>[]): LadderProgram => ({ version: 1, rungs });

	it('compile to MOVE / MATH gated by the power on the left', () => {
		const ladder = program(
			rung(
				[contact('NO', 'I0.0'), moveBox('42', 'MW0'), mathBox('MUL', 'MW0', '2', 'MW2')],
				[coil('COIL', 'Q0.0')]
			)
		);
		const c = compileLadder(ladder);
		expect(c.diagnostics).toEqual([]);
		expect(disassemble(c.program).filter((l) => !l.startsWith('TAP'))).toEqual([
			'LD I0.0',
			'MOVE 42, MW0',
			'MUL MW0, 2, MW2',
			'ST Q0.0',
			'POP'
		]);

		const plc = new Plc();
		plc.load(c.program);
		plc.run();
		plc.scan(10);
		expect(plc.memory.readNumber(parseAddress('MW2'))).toBe(0); // not powered
		plc.setInput('I0.0', true);
		plc.scan(10);
		expect(plc.memory.readNumber(parseAddress('MW2'))).toBe(84);
		expect(plc.getOutput('Q0.0')).toBe(true);
	});

	it('division by zero switches ENO (the power after the box) off', () => {
		const c = compileLadder(
			program(rung([mathBox('DIV', '10', 'MW0', 'MW2')], [coil('COIL', 'Q0.0')]))
		);
		const plc = new Plc();
		plc.load(c.program);
		plc.run();
		plc.scan(10);
		expect(plc.getOutput('Q0.0')).toBe(false);
	});

	it('reports a constant or an input as the output', () => {
		const m = moveBox('1', '5');
		const a = mathBox('ADD', 'MW0', '1', 'IW0');
		const { diagnostics } = compileLadder(program(rung([m, a], [coil()])));
		expect(diagnostics.find((d) => d.id === m.id)?.message).toMatch(/needs an address/);
		expect(diagnostics.find((d) => d.id === a.id)?.message).toMatch(
			/Invalid address|cannot be written/
		);
	});
});
