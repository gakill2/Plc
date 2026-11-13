import { describe, expect, it } from 'vitest';
import { parseAddress } from './address.js';
import { assemble } from './assembler.js';
import { Plc } from './plc.js';

/** Loads IL source into a fresh PLC in RUN. */
function plcWith(source: string): Plc {
	const plc = new Plc();
	plc.load(assemble(source));
	plc.run();
	return plc;
}

const num = (plc: Plc, addr: string, type?: 'REAL') =>
	plc.memory.readNumber(parseAddress(addr), type);

describe('logic', () => {
	const truthTable = [
		[false, false],
		[false, true],
		[true, false],
		[true, true]
	] as const;

	it.each(truthTable)('stack form: a=%s b=%s', (a, b) => {
		const plc = plcWith(`
			LD I0.0
			LD I0.1
			AND
			ST Q0.0
			POP
			LD I0.0
			LD I0.1
			OR
			ST Q0.1
			POP
			LD I0.0
			LD I0.1
			XOR
			ST Q0.2
			NOT
			ST Q0.3
			POP
			LD I0.0
			LD I0.1
			ANDN
			ST Q0.4
			POP
		`);
		plc.setInput('I0.0', a);
		plc.setInput('I0.1', b);
		plc.scan(10);
		expect(['Q0.0', 'Q0.1', 'Q0.2', 'Q0.3', 'Q0.4'].map((q) => plc.getOutput(q))).toEqual([
			a && b,
			a || b,
			a !== b,
			a === b,
			a && !b
		]);
	});

	it.each(truthTable)('IL form with operands: a=%s b=%s', (a, b) => {
		const plc = plcWith(`
			LD I0.0
			AND I0.1
			ST Q0.0
			ORN I0.1
			ST Q0.1
			POP
			LDN I0.0
			STN Q0.2
			POP
		`);
		plc.setInput('I0.0', a);
		plc.setInput('I0.1', b);
		plc.scan(10);
		expect(plc.getOutput('Q0.0')).toBe(a && b);
		expect(plc.getOutput('Q0.1')).toBe((a && b) || !b);
		expect(plc.getOutput('Q0.2')).toBe(a);
	});

	it('SET and RESET latch an output', () => {
		const plc = plcWith(`
			LD I0.0
			S Q0.0
			POP
			LD I0.1
			R Q0.0
			POP
		`);
		plc.setInput('I0.0', true);
		plc.scan(10);
		plc.setInput('I0.0', false);
		plc.scan(10);
		expect(plc.getOutput('Q0.0')).toBe(true);
		plc.setInput('I0.1', true);
		plc.scan(10);
		expect(plc.getOutput('Q0.0')).toBe(false);
	});

	it.each([
		['EDGE_P', [false, true, true, false, false], [false, true, false, false, false]],
		['EDGE_N', [false, true, true, false, false], [false, false, false, true, false]]
	] as const)('%s is true for exactly one scan', (edge, inputs, expected) => {
		const plc = plcWith(`LD I0.0\n${edge}\nST Q0.0\nPOP`);
		const outputs = inputs.map((input) => {
			plc.setInput('I0.0', input);
			plc.scan(10);
			return plc.getOutput('Q0.0');
		});
		expect(outputs).toEqual(expected);
	});
});

describe('numbers', () => {
	it('MOVE, math and compare, gated by EN', () => {
		const plc = plcWith(`
			LDC 1
			MOVE 7 MW0
			ADD MW0 5 MW2       // 12
			DIV MW2 0 MW4       // ENO = false
			ST Q0.0
			POP
			GE MW2 12
			ST Q0.1
			POP
			LDC 0
			MOVE 99 MW6         // EN = false, not executed
			POP
		`);
		plc.scan(10);
		expect([num(plc, 'MW2'), num(plc, 'MW4'), num(plc, 'MW6')]).toEqual([12, 0, 0]);
		expect(plc.getOutput('Q0.0')).toBe(false);
		expect(plc.getOutput('Q0.1')).toBe(true);
	});

	it('integer division truncates toward zero, REAL does not', () => {
		const plc = plcWith(`
			LDC 1
			DIV -7 2 MW0
			DIV 7 2 MD2:REAL
			MOD 7 3 MW6
			MUL 3 4 MW8
		`);
		plc.scan(10);
		expect([num(plc, 'MW0'), num(plc, 'MD2', 'REAL'), num(plc, 'MW6'), num(plc, 'MW8')]).toEqual([
			-3, 3.5, 1, 12
		]);
	});

	it.each([
		['EQ', [false, true, false]],
		['NE', [true, false, true]],
		['LT', [true, false, false]],
		['GT', [false, false, true]],
		['LE', [true, true, false]],
		['GE', [false, true, true]]
	] as const)('%s compares correctly', (cmp, expected) => {
		const results = [4, 5, 6].map((value) => {
			const plc = plcWith(`LDC 1\nMOVE ${value} MW0\nPOP\n${cmp} MW0 5\nST Q0.0\nPOP`);
			plc.scan(10);
			return plc.getOutput('Q0.0');
		});
		expect(results).toEqual(expected);
	});
});

describe('control flow and faults', () => {
	it('JMPC skips code when the condition is true', () => {
		const source = `
			LD I0.0
			JMPC skip
			LDC 1
			ST Q0.0
			POP
			skip:
			LDC 1
			ST Q0.1
			POP
		`;
		const taken = plcWith(source);
		taken.setInput('I0.0', true);
		taken.scan(10);
		expect([taken.getOutput('Q0.0'), taken.getOutput('Q0.1')]).toEqual([false, true]);

		const notTaken = plcWith(source);
		notTaken.scan(10);
		expect([notTaken.getOutput('Q0.0'), notTaken.getOutput('Q0.1')]).toEqual([true, true]);
	});

	it('the watchdog stops an endless loop', () => {
		const plc = plcWith('loop:\nJMP loop');
		plc.maxStepsPerScan = 1000;
		expect(plc.scan(10)).toBe(false);
		expect(plc.mode).toBe('FAULT');
		expect(plc.fault?.message).toMatch(/Watchdog/);
	});

	it('stack underflow is a fault with the program counter', () => {
		const plc = plcWith('LDC 1\nPOP\nAND');
		plc.scan(10);
		expect(plc.mode).toBe('FAULT');
		expect(plc.fault?.pc).toBe(2);
	});

	it('TAP records the RLO and LDT reloads it', () => {
		const plc = plcWith(`
			LD  I0.0
			TAP 0
			POP
			LDT 0
			AND I0.1
			TAP 1
			ST  Q0.0
			POP
		`);
		plc.setInput('I0.0', true);
		plc.scan(10);
		expect(Array.from(plc.snapshot().taps)).toEqual([1, 0]);
		expect(plc.getOutput('Q0.0')).toBe(false);
		plc.setInput('I0.1', true);
		plc.scan(10);
		expect(Array.from(plc.snapshot().taps)).toEqual([1, 1]);
		expect(plc.getOutput('Q0.0')).toBe(true);
	});
});
