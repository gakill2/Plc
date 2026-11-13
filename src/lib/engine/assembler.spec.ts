import { describe, expect, it } from 'vitest';
import { assemble, AssemblyError, disassemble, parseOperand, parseTime } from './assembler.js';
import { parseAddress as a } from './address.js';

describe('parseTime', () => {
	it.each([
		['T#500ms', 500],
		['T#2s', 2000],
		['t#1m30s', 90_000],
		['T#1h', 3_600_000],
		['T#1.5s', 1500]
	])('%s = %d ms', (text, ms) => {
		expect(parseTime(text)).toBe(ms);
	});

	it('rejects garbage', () => {
		expect(() => parseTime('T#5x')).toThrow();
	});
});

describe('parseOperand', () => {
	it('understands numbers, times, booleans and typed addresses', () => {
		expect(parseOperand('-12')).toEqual({ kind: 'const', value: -12 });
		expect(parseOperand('T#1s')).toEqual({ kind: 'const', value: 1000 });
		expect(parseOperand('TRUE')).toEqual({ kind: 'const', value: 1 });
		expect(parseOperand('MD4:real')).toEqual({ kind: 'addr', addr: a('MD4'), type: 'REAL' });
		expect(() => parseOperand('MD4:FLOAT')).toThrow(/Unknown type/);
	});
});

describe('assemble', () => {
	it('builds instructions, ignoring comments and blank lines', () => {
		const program = assemble(`
			// start / stop
			LD  I0.0      ; start
			OR  Q0.0
			AND I0.1
			=   Q0.0
			POP
			TON T1, T#2s
		`);
		expect(program).toEqual([
			{ op: 'LD', addr: a('I0.0') },
			{ op: 'OR', addr: a('Q0.0') },
			{ op: 'AND', addr: a('I0.1') },
			{ op: 'ST', addr: a('Q0.0') },
			{ op: 'POP' },
			{ op: 'TON', timer: 1, pt: { kind: 'const', value: 2000 } }
		]);
	});

	it('resolves labels (also forward references)', () => {
		const program = assemble(`
			LD I0.0
			JMPC end
			loop: LDC 1
			JMP loop
			end:
		`);
		expect(program[1]).toEqual({ op: 'JMPC', target: 4 });
		expect(program[3]).toEqual({ op: 'JMP', target: 2 });
	});

	it('maps comparisons and math', () => {
		const [cmp, add] = assemble('GE MW0, 10\nADD MW0 1 MW0');
		expect(cmp).toEqual({
			op: 'CMP',
			cmp: '>=',
			a: { kind: 'addr', addr: a('MW0') },
			b: { kind: 'const', value: 10 }
		});
		expect(add).toMatchObject({ op: 'MATH', fn: 'ADD' });
	});

	it.each([
		['FOO I0.0', /Unknown instruction/],
		['LD', /expects 1 operand/],
		['LD I0', /bit number/],
		['TON C1 T#1s', /timer/],
		['MOVE 1 5', /destination/],
		['JMP nowhere', /Unknown label/],
		['x:\nx:', /Duplicate label/]
	])('reports %j', (source, message) => {
		expect(() => assemble(source)).toThrow(message);
	});

	it('reports the line number', () => {
		try {
			assemble('LD I0.0\n\nBAD');
			expect.unreachable();
		} catch (e) {
			expect(e).toBeInstanceOf(AssemblyError);
			expect((e as AssemblyError).line).toBe(3);
		}
	});
});

describe('disassemble', () => {
	it('round-trips every kind of instruction', () => {
		const program = assemble(`
			LD I0.0
			LDN T1
			LDC 1
			AND
			AND I0.1
			ORN M0.0
			XOR
			NOT
			EDGE_P
			EDGE_N
			ST Q0.0
			STN Q0.1
			S M1.0
			R M1.0
			GE MW0, 10
			TON T1, 2000
			CTUD C2, 5
			MOVE MD4:REAL, MD8:REAL
			DIV MW0, 3, MW2
			JMPC 3
			TAP 4
			LDT 4
			POP
		`);
		expect(assemble(disassemble(program).join('\n'))).toEqual(program);
		expect(disassemble(program)[17]).toBe('MOVE MD4:REAL, MD8:REAL');
	});
});
