import { describe, expect, it } from 'vitest';
import { parseAddress, Plc } from '#lib/engine/index.js';
import { compileSt } from './compiler.js';

function load(src: string, plc = new Plc()) {
	const r = compileSt(src);
	expect(r.diagnostics.map((d) => d.message)).toEqual([]);
	plc.load(r.program, r.load);
	plc.run();
	const read = (name: string) => {
		const v = r.variables.find((x) => x.name.toUpperCase() === name.toUpperCase());
		if (!v) throw new Error(`no variable ${name}: ${r.variables.map((x) => x.name).join(', ')}`);
		const a = v.reads[0];
		return a.kind === 'bool'
			? plc.memory.readBit(parseAddress(a.address))
			: plc.memory.readNumber(parseAddress(a.address), a.numType);
	};
	return { plc, read, r, scan: (ms = 10) => plc.scan(ms) };
}
const errors = (src: string) => compileSt(src).diagnostics.map((d) => d.message);

describe('ARRAY', () => {
	it('sums an initialised array in a FOR loop', () => {
		const { read, scan } = load(`
VAR
  a : ARRAY[1..5] OF INT := [10, 20, 30, 40, 50];
  i : INT;
  sum : INT;
END_VAR
sum := 0;
FOR i := 1 TO 5 DO
  sum := sum + a[i];
END_FOR;
`);
		scan();
		expect(read('sum')).toBe(150);
		expect(read('a[3]')).toBe(30);
	});

	it('writes with a computed index and reads 0 outside the bounds', () => {
		const { read, scan } = load(`
VAR
  buf : ARRAY[0..9] OF DINT;
  i, k : INT;
  out, last : DINT;
END_VAR
FOR i := 0 TO 9 DO
  buf[i] := i * i;
END_FOR;
k := 12;
out := buf[k];
buf[k] := 99;
last := buf[k - 3];
`);
		scan();
		expect(read('buf[7]')).toBe(49);
		expect(read('out')).toBe(0);
		expect(read('last')).toBe(81);
	});

	it('a shift register of BOOLs', () => {
		const { plc, read, scan } = load(`
VAR
  slot : ARRAY[0..3] OF BOOL;
  i : INT;
  edge : R_TRIG;
END_VAR
edge(CLK := I0.0);
IF edge.Q THEN
  FOR i := 3 TO 1 BY -1 DO
    slot[i] := slot[i - 1];
  END_FOR;
  slot[0] := I0.1;
END_IF;
Q0.0 := slot[3];
`);
		const pulse = (part: boolean) => {
			plc.setInput('I0.1', part);
			plc.setInput('I0.0', true);
			scan();
			plc.setInput('I0.0', false);
			scan();
		};
		pulse(true);
		pulse(false);
		pulse(false);
		expect(read('slot[2]')).toBe(true);
		expect(plc.getOutput('Q0.0')).toBe(false);
		pulse(false);
		expect(plc.getOutput('Q0.0')).toBe(true);
	});

	it('an array of function block instances and of structs', () => {
		const { plc, read, scan } = load(`
FUNCTION_BLOCK Motor
VAR_INPUT Start : BOOL; END_VAR
VAR_OUTPUT Running : BOOL; END_VAR
Running := Start;
END_FUNCTION_BLOCK
TYPE Recipe : STRUCT Temp : INT; Time : TIME; END_STRUCT; END_TYPE
VAR
  m : ARRAY[1..3] OF Motor;
  r : ARRAY[0..1] OF Recipe;
  i : INT;
  n : INT;
  t : TON;
  timers : ARRAY[1..2] OF TON;
END_VAR
r[1].Temp := 180;
FOR i := 1 TO 3 DO
  m[i](Start := i = 2);
END_FOR;
n := r[i - 3].Temp;
Q0.0 := m[2].Running;
Q0.1 := m[i - 1].Running;
timers[1](IN := TRUE, PT := T#20ms);
Q0.2 := timers[1].Q;
`);
		scan();
		scan();
		scan();
		expect(plc.getOutput('Q0.0')).toBe(true);
		expect(plc.getOutput('Q0.1')).toBe(false);
		expect(plc.getOutput('Q0.2')).toBe(true);
		expect(read('n')).toBe(180);
	});

	it('reports bad arrays', () => {
		expect(errors('VAR a : ARRAY[0..2] OF INT; END_VAR a[3] := 1;')).toEqual([
			'Index 3 is outside a[0..2]'
		]);
		expect(errors('VAR a : ARRAY[0..2] OF INT; END_VAR a := 1;')[0]).toMatch(/is an ARRAY/);
		expect(errors('VAR a : ARRAY[0..1] OF INT := [1, 2, 3]; END_VAR')[0]).toMatch(
			/3 initial values for 2 elements/
		);
		expect(errors('VAR a : ARRAY[0..1, 0..1] OF INT; END_VAR')[0]).toMatch(/one-dimensional/);
		expect(errors('VAR x : INT; END_VAR x[0] := 1;')[0]).toMatch(/not an ARRAY/);
	});
});

describe('VAR RETAIN', () => {
	const SRC = `
VAR RETAIN
  parts : DINT := 5;
END_VAR
VAR
  shift : DINT;
  edge : R_TRIG;
END_VAR
edge(CLK := I0.0);
IF edge.Q THEN
  parts := parts + 1;
  shift := shift + 1;
END_IF;
`;
	it('keeps retentive variables over a new download (Stop → Run)', () => {
		const plc = new Plc();
		const a = load(SRC, plc);
		expect(a.r.load?.retain).toBeTruthy();
		a.scan();
		for (let k = 0; k < 3; k++) {
			plc.setInput('I0.0', true);
			a.scan();
			plc.setInput('I0.0', false);
			a.scan();
		}
		expect(a.read('parts')).toBe(8);
		expect(a.read('shift')).toBe(3);
		const b = load(SRC, plc); // Run again: download + restart
		b.scan();
		expect(b.read('parts')).toBe(8);
		expect(b.read('shift')).toBe(0);
	});

	it('starts over when the retentive variables change, or after a memory reset', () => {
		const plc = new Plc();
		const a = load(SRC, plc);
		plc.setInput('I0.0', true);
		a.scan();
		expect(a.read('parts')).toBe(6);
		plc.setInput('I0.0', false);
		const b = load(SRC.replace('parts : DINT', 'parts : INT'), plc);
		b.scan();
		expect(b.read('parts')).toBe(5);
		plc.reset();
		plc.run();
		b.scan();
		expect(b.read('parts')).toBe(5);
	});

	it('is only allowed in the program', () => {
		expect(
			errors(
				'FUNCTION_BLOCK F VAR RETAIN x : INT; END_VAR x := 1; END_FUNCTION_BLOCK VAR f : F; END_VAR f();'
			)[0]
		).toMatch(/RETAIN is only allowed/);
	});
});

describe('CYCLIC_INTERRUPT', () => {
	it('runs at its own interval, independent of the scan', () => {
		const { plc, read, scan, r } = load(`
VAR
  ticks : DINT;
  scans : DINT;
  t : TON;
END_VAR
scans := scans + 1;
CYCLIC_INTERRUPT T#100ms
  ticks := ticks + 1;
  t(IN := TRUE, PT := T#300ms);
  Q0.0 := t.Q;
END_CYCLIC_INTERRUPT
`);
		expect(r.load?.cyclic?.intervalMs).toBe(100);
		for (let k = 0; k < 50; k++) scan();
		expect(read('scans')).toBe(50);
		expect(read('ticks')).toBe(5);
		expect(plc.cyclicCount).toBe(5);
		expect(plc.getOutput('Q0.0')).toBe(true);
	});

	it('checks the interval', () => {
		expect(
			errors('VAR x : INT; END_VAR x := 1; CYCLIC_INTERRUPT T#15ms x := 2; END_CYCLIC_INTERRUPT')[0]
		).toMatch(/multiple of the 10 ms/);
	});
});
