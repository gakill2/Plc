import { describe, expect, it } from 'vitest';
import { compileLadder } from '#lib/ladder/compiler.js';
import { demoProgram } from '#lib/ladder/defaults.js';
import { coil, compare, contact, rung, timer, type LadderProgram } from '#lib/ladder/model.js';
import { compileSt } from '#lib/st/compiler.js';
import { analyze, compareAddresses, crossReference } from './analysis.js';

const program = (...rungs: ReturnType<typeof rung>[]): LadderProgram => ({ version: 1, rungs });

function check(ladder: LadderProgram, wired: string[] = [], names: Record<string, string> = {}) {
	const c = compileLadder(ladder);
	const xref = crossReference(c.program, c.sourceMap);
	return {
		xref,
		warnings: analyze({ xref, language: 'ladder', names: new Map(Object.entries(names)), wired })
	};
}

describe('crossReference', () => {
	it('lists reads and writes per address with the node that does them', () => {
		const start = contact('NO', 'I0.0');
		const hold = contact('NO', 'Q0.0');
		const out = coil('COIL', 'Q0.0');
		const { xref } = check(program(rung([start, hold], [out])));
		expect(xref).toEqual([
			{ address: 'I0.0', reads: [start.id], writes: [] },
			{ address: 'Q0.0', reads: [hold.id], writes: [{ owner: out.id, kind: 'coil' }] }
		]);
	});

	it('sorts addresses by area, byte and bit', () => {
		expect(['C0', 'MW10', 'I1.0', 'Q0.0', 'I0.7', 'T3', 'MB4'].sort(compareAddresses)).toEqual([
			'I0.7',
			'I1.0',
			'Q0.0',
			'MB4',
			'MW10',
			'T3',
			'C0'
		]);
	});

	it('the demo program is clean when everything is wired', () => {
		const { warnings } = check(demoProgram(), ['I0.0', 'I0.1', 'I0.2', 'Q0.0', 'Q0.1', 'Q0.2']);
		expect(warnings).toEqual([]);
	});
});

describe('analyze', () => {
	it('warns about double coils on every coil but the last', () => {
		const first = coil('COIL', 'Q0.0');
		const second = coil('COIL', 'Q0.0');
		const { warnings } = check(
			program(rung([contact('NO', 'I0.0')], [first]), rung([contact('NO', 'I0.1')], [second])),
			[],
			{
				'Q0.0': 'Lamp'
			}
		);
		expect(warnings).toEqual([
			{ id: first.id, message: 'Lamp (Q0.0) is written by 2 coils — only the last one counts' }
		]);
	});

	it('warns about a coil mixed with SET/RESET, and a timer used twice', () => {
		const c = coil('COIL', 'Q0.0');
		const t2 = timer('TON', 'T0', 'T#2s');
		const { warnings } = check(
			program(
				rung([contact('NO', 'I0.0')], [c, coil('SET', 'Q0.0')]),
				rung([contact('NO', 'I0.1'), timer('TON', 'T0', 'T#1s')], [coil('COIL', 'M0.0')]),
				rung([contact('NO', 'I0.2'), t2], [coil('COIL', 'M0.1')])
			)
		);
		expect(warnings.map((w) => [w.id, w.message.split(' — ')[0]])).toEqual([
			[c.id, 'Q0.0 has a normal coil and SET/RESET coils'],
			[t2.id, 'T0 is used by 2 timer boxes']
		]);
	});

	it('warns about markers read but never written, and timers without a box', () => {
		const typo = contact('NO', 'M0.1');
		const cmp = compare('>=', 'T5', '100');
		const { warnings } = check(
			program(
				rung([contact('NO', 'I0.0')], [coil('COIL', 'M0.0')]),
				rung([typo, cmp], [coil('COIL', 'Q0.0')])
			)
		);
		expect(warnings.map((w) => w.id)).toEqual([typo.id, cmp.id]);
	});

	it('warns about wired devices the program ignores', () => {
		const { warnings } = check(
			program(rung([contact('NO', 'I0.0')], [coil('COIL', 'Q0.0')])),
			['I0.0', 'I0.5', 'Q0.0', 'Q0.3'],
			{
				'I0.5': 'Spare',
				'Q0.3': 'Horn'
			}
		);
		expect(warnings.map((w) => w.message)).toEqual([
			'Spare (I0.5) is wired but never used in the program',
			'Horn (Q0.3) is wired but the program never switches it'
		]);
	});

	it('ST: assignments in several branches are fine, internal variables are hidden', () => {
		const c = compileSt(`
			VAR t : TON; END_VAR
			IF I0.0 THEN Q0.0 := TRUE; END_IF;
			IF I0.1 THEN Q0.0 := FALSE; END_IF;
			t(IN := I0.2, PT := T#1s);
		`);
		const xref = crossReference(
			c.program,
			c.lines.map((l) => (l ? `L${l}` : null))
		);
		expect(xref.map((e) => e.address)).toEqual(['I0.0', 'I0.1', 'I0.2', 'Q0.0', 'T32']);
		expect(analyze({ xref, language: 'st', names: new Map(), wired: [] })).toEqual([]);
	});
});
