import { describe, expect, it } from 'vitest';
import { Plc, parseAddress } from '#lib/engine/index.js';
import { compileSt } from '#lib/st/compiler.js';
import { stlToSt } from './stl.js';

function load(stl: string) {
	const gen = stlToSt(stl);
	expect(gen.issues).toEqual([]);
	const r = compileSt(gen.source);
	expect(r.diagnostics, gen.source).toEqual([]);
	const plc = new Plc();
	plc.load(r.program);
	plc.run();
	return plc;
}
const run = (plc: Plc, ms: number) => {
	for (let t = 0; t < ms; t += 10) plc.scan(10);
};
const truth = (stl: string, inputs: string[], out: string) => {
	const plc = load(stl);
	const rows: number[] = [];
	for (let n = 0; n < 1 << inputs.length; n++) {
		inputs.forEach((a, i) => plc.setInput(a, Boolean(n & (1 << i))));
		run(plc, 10);
		rows.push(Number(plc.getOutput(out)));
	}
	return rows.join('');
};

describe('STL', () => {
	it('binds AND before OR, like S7', () => {
		// (a·b) + (c·d); inputs counted a = bit 0 … d = bit 3
		const stl = 'A I0.0\nA I0.1\nO I0.2\nA I0.3\n= Q0.0';
		const expected = [...Array(16).keys()]
			.map((n) => Number((n & 1 && n & 2) || (n & 4 && n & 8) ? 1 : 0))
			.join('');
		expect(truth(stl, ['I0.0', 'I0.1', 'I0.2', 'I0.3'], 'Q0.0')).toBe(expected);
	});

	it('nests brackets, negations and the plain O', () => {
		const stl = `A(
O I0.0
ON I0.1
)
AN I0.2
O
A I0.2
A I0.1
= Q0.0`;
		const expected = [...Array(8).keys()]
			.map((n) => {
				const [a, b, c] = [n & 1, n & 2, n & 4].map(Boolean);
				return Number(((a || !b) && !c) || (c && b));
			})
			.join('');
		expect(truth(stl, ['I0.0', 'I0.1', 'I0.2'], 'Q0.0')).toBe(expected);
	});

	it('latches with S and R, using symbols in quotes and S5 spacing', () => {
		const gen = stlToSt('A "Start"\nS M 0.0\nA I 0.1\nR M0.0\nA M0.0\n= Q 0.0');
		expect(gen.issues).toEqual([]);
		const r = compileSt(gen.source, { symbols: new Map([['START', 'I0.0']]) });
		expect(r.diagnostics).toEqual([]);
		const plc = new Plc();
		plc.load(r.program);
		plc.run();
		plc.setInput('I0.0', true);
		run(plc, 20);
		plc.setInput('I0.0', false);
		run(plc, 20);
		expect(plc.getOutput('Q0.0')).toBe(true);
		plc.setInput('I0.1', true);
		run(plc, 20);
		expect(plc.getOutput('Q0.0')).toBe(false);
	});

	it('keeps the old RLO for a second assignment after the bit changed', () => {
		const plc = load('A I0.0\nS M0.1\nA M0.1\nR M0.1\n= Q0.0');
		plc.setInput('I0.0', true);
		run(plc, 10);
		expect(plc.getOutput('Q0.0')).toBe(true);
	});

	it('counts rising edges with FP', () => {
		const plc = load('A I0.0\nFP M1.0\nJCN skip\nL MW10\nL 1\n+I\nT MW10\nskip: NOP 0');
		for (let k = 0; k < 3; k++) {
			plc.setInput('I0.0', true);
			run(plc, 30);
			plc.setInput('I0.0', false);
			run(plc, 30);
		}
		expect(plc.memory.readNumber(parseAddress('MW10'))).toBe(3);
	});

	it('runs an S7 on-delay timer', () => {
		const plc = load('A I0.0\nL S5T#2S\nSD T1\nA T1\n= Q0.0');
		plc.setInput('I0.0', true);
		run(plc, 1500);
		expect(plc.getOutput('Q0.0')).toBe(false);
		run(plc, 600);
		expect(plc.getOutput('Q0.0')).toBe(true);
		plc.setInput('I0.0', false);
		run(plc, 20);
		expect(plc.getOutput('Q0.0')).toBe(false);
	});

	it('compares accumulators and skips code with JC', () => {
		const plc = load(`L MW2
L 100
>I
= Q0.0
JC big
L 0
T MW20
JU done
big: L 1
T MW20
done: NOP 0`);
		plc.memory.writeNumber(parseAddress('MW2'), 50);
		run(plc, 20);
		expect(plc.getOutput('Q0.0')).toBe(false);
		expect(plc.memory.readNumber(parseAddress('MW20'))).toBe(0);
		plc.memory.writeNumber(parseAddress('MW2'), 150);
		run(plc, 20);
		expect(plc.getOutput('Q0.0')).toBe(true);
		expect(plc.memory.readNumber(parseAddress('MW20'))).toBe(1);
	});

	it('ends the block conditionally with BEC', () => {
		const plc = load('A I0.0\nBEC\nSET\n= Q0.0');
		run(plc, 20);
		expect(plc.getOutput('Q0.0')).toBe(true);
	});

	it('explains what it cannot translate, with the line', () => {
		expect(stlToSt('top: A I0.0\n= Q0.0\nJU top').issues[0]).toMatchObject({ line: 3 });
		expect(stlToSt('A I0.0\nJC m1\nJC m2\nm1: NOP 0\nm2: NOP 0').issues).toEqual([]);
		expect(stlToSt('A C1\n= Q0.0').issues[0].message).toMatch(/Counters/);
		expect(stlToSt('A I0.0\nJC nowhere').issues[0].message).toMatch(/not found/);
		expect(stlToSt('UN E0.0').issues[0].message).toMatch(/Unknown/);
	});

	it('maps generated lines back to STL lines', () => {
		const gen = stlToSt('// comment\nA I0.0\n= Q0.0');
		const assign = gen.source.split('\n').findIndex((l) => l.startsWith('Q0.0')) + 1;
		expect(gen.origin[assign]).toBe(3);
	});
});
