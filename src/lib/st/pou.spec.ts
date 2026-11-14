import { describe, expect, it } from 'vitest';
import { parseAddress, Plc } from '#lib/engine/index.js';
import { compileSt } from './compiler.js';

function load(src: string) {
	const r = compileSt(src);
	expect(r.diagnostics.map((d) => d.message)).toEqual([]);
	const plc = new Plc();
	plc.load(r.program);
	plc.run();
	const read = (name: string) => {
		const v = r.variables.find((x) => x.name.toUpperCase() === name.toUpperCase());
		if (!v) throw new Error(`no variable ${name}: ${r.variables.map((x) => x.name).join(', ')}`);
		const a = v.reads[0];
		return a.kind === 'bool'
			? plc.memory.readBit(parseAddress(a.address))
			: plc.memory.readNumber(parseAddress(a.address), a.numType);
	};
	return { plc, read, scan: (ms = 10) => plc.scan(ms) };
}
const errors = (src: string) => compileSt(src).diagnostics.map((d) => d.message);

const MOTOR = `
FUNCTION_BLOCK Motor
VAR_INPUT
  Start : BOOL;
  Stop  : BOOL;
END_VAR
VAR_OUTPUT
  Running : BOOL;
  Ready   : BOOL;
END_VAR
VAR
  delay : TON;
END_VAR
Running := (Start OR Running) AND Stop;
delay(IN := Running, PT := T#200ms);
Ready := delay.Q;
END_FUNCTION_BLOCK
`;

describe('FUNCTION_BLOCK', () => {
	it('every instance has its own memory', () => {
		const { plc, scan } = load(`${MOTOR}
VAR
  m1 : Motor;
  m2 : Motor;
END_VAR
m1(Start := I0.0, Stop := I0.1, Running => Q0.0);
m2(Start := I0.2, Stop := I0.3, Running => Q0.1);
Q0.2 := m1.Ready;
`);
		plc.setInput('I0.1', true);
		plc.setInput('I0.3', true);
		plc.setInput('I0.0', true);
		scan();
		plc.setInput('I0.0', false);
		scan();
		expect(plc.getOutput('Q0.0')).toBe(true);
		expect(plc.getOutput('Q0.1')).toBe(false);
		for (let i = 0; i < 25; i++) scan();
		expect(plc.getOutput('Q0.2')).toBe(true); // m1's own timer
		plc.setInput('I0.1', false);
		scan();
		expect(plc.getOutput('Q0.0')).toBe(false);
	});

	it('nests instances and supports RETURN', () => {
		const { plc, scan } = load(`${MOTOR}
FUNCTION_BLOCK Line
VAR_INPUT
  Go : BOOL;
END_VAR
VAR_OUTPUT
  Both : BOOL;
END_VAR
VAR
  a : Motor;
  b : Motor;
END_VAR
IF NOT Go THEN
  Both := FALSE;
  RETURN;
END_IF;
a(Start := TRUE, Stop := TRUE);
b(Start := a.Running, Stop := TRUE);
Both := a.Running AND b.Running;
END_FUNCTION_BLOCK

VAR
  line : Line;
END_VAR
line(Go := I0.0, Both => Q0.0);
`);
		scan();
		expect(plc.getOutput('Q0.0')).toBe(false);
		plc.setInput('I0.0', true);
		scan();
		expect(plc.getOutput('Q0.0')).toBe(true);
	});

	it('reports misuse clearly', () => {
		const prog = (body: string) => `${MOTOR}\nVAR m : Motor; END_VAR\n${body}`;
		expect(errors(prog('m.Running := TRUE;'))).toEqual([expect.stringMatching(/output of Motor/)]);
		expect(errors(prog('Q0.0 := m.delay.Q;'))).not.toEqual([]);
		expect(errors(prog('Q0.0 := m.delay;'))).toEqual([expect.stringMatching(/internal to Motor/)]);
		expect(errors(prog('m(Speed := 1);'))).toEqual([expect.stringMatching(/no input speed/i)]);
		expect(errors(prog('Q0.0 := m;'))).toEqual([expect.stringMatching(/call it/)]);
		expect(
			errors(`FUNCTION_BLOCK Loop
VAR x : Loop; END_VAR
END_FUNCTION_BLOCK
VAR l : Loop; END_VAR`)
		).toEqual([expect.stringMatching(/contains itself/)]);
	});
});

describe('FUNCTION', () => {
	it('computes a value inside an expression', () => {
		const { plc, scan, read } = load(`
FUNCTION Scale : REAL
VAR_INPUT
  raw    : INT;
  lo, hi : REAL;
END_VAR
Scale := lo + INT_TO_REAL(raw) / 27648.0 * (hi - lo);
END_FUNCTION

VAR
  level : REAL;
  both  : REAL;
END_VAR
level := Scale(MW10, 0.0, 100.0);
both := Scale(MW10, 0.0, 100.0) + Scale(MW12, 0.0, 10.0);
`);
		plc.memory.writeNumber(parseAddress('MW10'), 13824);
		plc.memory.writeNumber(parseAddress('MW12'), 27648);
		scan();
		expect(read('level')).toBeCloseTo(50, 3);
		expect(read('both')).toBeCloseTo(60, 3);
	});

	it('refuses recursion and calls in loop conditions', () => {
		expect(
			errors(`FUNCTION F : INT
VAR_INPUT x : INT; END_VAR
F := F(x);
END_FUNCTION
MW0 := F(1);`)
		).toEqual([expect.stringMatching(/recursion/)]);
		expect(
			errors(`FUNCTION G : BOOL
VAR_INPUT x : INT; END_VAR
G := x > 0;
END_FUNCTION
WHILE G(MW0) DO MW0 := MW0 - 1; END_WHILE;`)
		).toEqual([expect.stringMatching(/assign it to a variable/)]);
	});
});

describe('STRUCT', () => {
	it('groups fields under one variable', () => {
		const { plc, scan, read } = load(`
TYPE
  Pump : STRUCT
    Speed : INT;
    On    : BOOL := TRUE;
  END_STRUCT;
END_TYPE

VAR
  p1 : Pump;
  p2 : Pump;
END_VAR
p1.Speed := 1200;
p2.Speed := p1.Speed / 2;
Q0.0 := p1.On;
`);
		scan();
		expect(read('p2.Speed')).toBe(600);
		expect(plc.getOutput('Q0.0')).toBe(true);
		expect(
			errors('TYPE P : STRUCT a : INT; END_STRUCT END_TYPE VAR p : P; END_VAR MW0 := p.b;')
		).toEqual([expect.stringMatching(/no field b/i)]);
	});
});
