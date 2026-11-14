import { describe, expect, it } from 'vitest';
import { assemble, disassemble, mathOp, parseAddress, Plc } from '#lib/engine/index.js';
import { compileSt } from './compiler.js';

function run(src: string) {
	const result = compileSt(src);
	expect(result.diagnostics.map((d) => d.message)).toEqual([]);
	const plc = new Plc();
	plc.load(result.program);
	plc.run();
	plc.scan(10);
	const v = (name: string) => {
		const read = result.variables.find((x) => x.name === name)!.reads[0];
		const a = parseAddress(read.address);
		return read.kind === 'bool' ? plc.memory.readBit(a) : plc.memory.readNumber(a, read.numType);
	};
	return { plc, v };
}
const errorsOf = (src: string) => compileSt(src).diagnostics.map((d) => d.message);

describe('MATH functions in the VM', () => {
	it('computes every function', () => {
		const cases: [Parameters<typeof mathOp>, number | null][] = [
			[['MIN', 3, -2], -2],
			[['MAX', 3, -2], 3],
			[['WAND', 0b1100, 0b1010], 0b1000],
			[['WOR', 0b1100, 0b1010], 0b1110],
			[['WXOR', 0b1100, 0b1010], 0b0110],
			[['SHL', 1, 4], 16],
			[['SHL', 1, 40], 0],
			[['SHR', 256, 4], 16],
			[['SHR', -16, 2], -4],
			[['ABS', -7.5, 0], 7.5],
			[['NEG', 4, 0], -4],
			[['WNOT', 0, 0], -1],
			[['TRUNC', -2.7, 0], -2],
			[['ROUND', 2.5, 0], 3],
			[['ROUND', -2.5, 0], -3],
			[['DIV', 1, 0], null]
		];
		for (const [args, expected] of cases) expect(mathOp(...args), args.join(' ')).toBe(expected);
	});

	it('assembles and disassembles unary and binary forms', () => {
		const text = ['MAX MW0, 10, MW2', 'ABS MW0, MW4', 'WAND MW0, 255, MW6', 'ROUND MD8, MW10'];
		expect(disassemble(assemble(text.join('\n')))).toEqual(text);
	});
});

describe('Structured Text standard functions', () => {
	it('ABS, MIN, MAX, LIMIT and TRUNC', () => {
		const { v } = run(`
			VAR a : INT := -5; r : REAL := 7.9; x : INT; y : INT; z : INT; w : DINT; q : REAL; k : INT := 250; END_VAR
			x := ABS(a);
			y := MIN(a, 3) + MAX(a, 3);
			z := LIMIT(0, k, 100);
			w := TRUNC(r);
			q := LIMIT(0.0, r, 5.5);
			k := LIMIT(10, a, 20);
		`);
		expect([v('x'), v('y'), v('z'), v('w'), v('k')]).toEqual([5, -2, 100, 7, 10]);
		expect(v('q')).toBeCloseTo(5.5);
	});

	it('type conversions', () => {
		const { v } = run(`
			VAR i : INT := 7; r : REAL; n : INT; b : BOOL; c : INT; big : INT := 300; bt : BYTE; t : TIME; d : DINT; END_VAR
			r := INT_TO_REAL(i) / 2;
			n := REAL_TO_INT(r);
			b := INT_TO_BOOL(i);
			c := BOOL_TO_INT(b) + BOOL_TO_INT(NOT b);
			bt := INT_TO_BYTE(big);
			t := DINT_TO_TIME(1500);
			d := TIME_TO_DINT(t) + REAL_TO_DINT(-2.5);
		`);
		expect(v('r')).toBeCloseTo(3.5);
		expect([v('n'), v('b'), v('c'), v('bt'), v('d')]).toEqual([4, true, 1, 44, 1497]);
	});

	it('bitwise AND / OR / XOR / NOT and shifts on numbers', () => {
		const { v } = run(`
			VAR s : INT := 16#00F0; a : INT; o : INT; x : INT; n : INT; l : INT; r : INT; bit3 : BOOL; END_VAR
			a := s AND 16#003C;
			o := s OR 16#000F;
			x := s XOR 16#00FF;
			n := NOT 0;
			l := SHL(1, 3);
			r := SHR(s, 4);
			bit3 := (l AND 16#08) <> 0;
		`);
		expect([v('a'), v('o'), v('x'), v('n'), v('l'), v('r'), v('bit3')]).toEqual([
			0x30,
			0xff,
			0x0f,
			-1,
			8,
			0x0f,
			true
		]);
	});

	it('folds constant calls', () => {
		const r = compileSt('VAR x : INT; END_VAR x := MAX(2, 9) + ABS(-1);');
		expect(disassemble(r.program).filter((l) => l.startsWith('MOVE'))).toEqual(['MOVE 10, MW258']);
	});

	it('reports wrong calls clearly', () => {
		expect(errorsOf('VAR x : INT; END_VAR x := FOO(1);')).toEqual(['Unknown function "FOO"']);
		expect(errorsOf('VAR x : INT; END_VAR x := MAX(1);')).toEqual(['MAX takes 2 arguments, not 1']);
		expect(errorsOf('VAR t : TON; x : INT; END_VAR x := t(1);')[0]).toMatch(
			/call T as a statement/
		);
		expect(errorsOf('VAR x : INT; END_VAR x := ABS(TRUE);')).toEqual([
			'ABS needs numbers, not a BOOL'
		]);
		expect(errorsOf('VAR b : BOOL; x : INT; END_VAR x := REAL_TO_INT(b);')).toEqual([
			'REAL_TO_INT expects a REAL argument'
		]);
		expect(errorsOf('VAR r : REAL; END_VAR r := r AND 1;')).toEqual([
			'AND works on BOOL or integer values, not REAL'
		]);
		expect(errorsOf('VAR x : INT; END_VAR IF x AND 1 THEN x := 0; END_IF;')[0]).toMatch(
			/IF needs a BOOL condition/
		);
		expect(errorsOf('VAR x : INT; END_VAR x := INT_TO_BOOL(x);')).toEqual([
			'x is INT — a number is needed, not a BOOL'
		]);
	});
});

it('explains a bitwise result used as a condition', () => {
	expect(
		compileSt('VAR x : INT; END_VAR Q0.0 := I0.0 AND (x AND 1);').diagnostics[0].message
	).toMatch(/AND needs two BOOLs \(or two integers for a bitwise AND\)/);
});
