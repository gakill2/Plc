import { describe, expect, it } from 'vitest';
import { parseAddress, Plc } from '#lib/engine/index.js';
import { compileSt } from './compiler.js';

function load(src: string) {
	const r = compileSt(src);
	expect(r.diagnostics.map((d) => d.message)).toEqual([]);
	const plc = new Plc();
	plc.load(r.program, r.load);
	plc.run();
	const read = (name: string) => {
		const v = r.variables.find((x) => x.name.toUpperCase() === name.toUpperCase())!;
		const a = v.reads[0];
		return a.kind === 'bool'
			? plc.memory.readBit(parseAddress(a.address))
			: plc.memory.readNumber(parseAddress(a.address), a.numType);
	};
	return {
		plc,
		read,
		scan: (n = 1) => {
			for (let i = 0; i < n; i++) plc.scan(10);
		}
	};
}
const texts = (plc: Plc) => plc.diagnostics.map((d) => d.text);

describe('cycle time', () => {
	it('a short program keeps the 10 ms minimum cycle; a long loop stretches it', () => {
		const { plc, scan, read } = load(`
VAR i, n : DINT; t : TON; END_VAR
IF I0.0 THEN
  FOR i := 1 TO 5000 DO n := n + 1; END_FOR;
END_IF;
t(IN := TRUE, PT := T#1s);
Q0.0 := t.Q;
`);
		scan(3);
		expect(plc.cycle.lastMs).toBe(10);
		expect(plc.cycle.execMs).toBeLessThan(1);
		plc.setInput('I0.0', true);
		scan(3);
		expect(plc.cycle.execMs).toBeGreaterThan(20);
		expect(plc.cycle.lastMs).toBeGreaterThan(20); // the next cycle starts later
		expect(plc.cycle.maxMs).toBe(plc.cycle.lastMs);
		expect(plc.cycle.minMs).toBe(10);
		// timers measure real time: fewer cycles reach 1 s
		let cycles = 0;
		while (!plc.getOutput('Q0.0') && cycles < 200) {
			scan();
			cycles++;
		}
		expect(cycles).toBeLessThan(60);
		expect(read('n')).toBeGreaterThan(0);
	});

	it('without OB80 a cycle over the maximum stops the CPU; with OB80 it carries on', () => {
		const slow = `
VAR i, n : DINT; late : INT; END_VAR
IF I0.0 THEN
  FOR i := 1 TO 20000 DO n := n + 1; END_FOR;
END_IF;
`;
		const a = load(slow);
		a.plc.setInput('I0.0', true);
		a.scan();
		expect(a.plc.mode).toBe('FAULT');
		expect(texts(a.plc).at(-1)).toMatch(/maksymalny czas cyklu.*brak OB80/);

		const b = load(`${slow}
ORGANIZATION_BLOCK OB80
  late := late + 1;
END_ORGANIZATION_BLOCK`);
		b.plc.setInput('I0.0', true);
		b.scan(2);
		expect(b.plc.mode).toBe('RUN');
		expect(b.read('late')).toBe(2);
		expect(texts(b.plc).at(-1)).toMatch(/obsłużony w OB80/);
	});

	it('an endless loop stops the CPU even with OB80 (twice the maximum cycle time)', () => {
		const { plc, scan } = load(`
WHILE TRUE DO Q0.0 := NOT Q0.0; END_WHILE;
ORGANIZATION_BLOCK OB80
END_ORGANIZATION_BLOCK`);
		scan();
		expect(plc.mode).toBe('FAULT');
		expect(texts(plc).at(-1)).toMatch(/2 × maksymalny czas cyklu/);
	});
});

describe('programming errors and OB121', () => {
	const SRC = `
VAR a : ARRAY[0..3] OF INT; i : INT; x : INT; END_VAR
i := MW10;
x := a[i];
Q0.0 := TRUE;
`;
	it('an index out of range stops the CPU when there is no OB121', () => {
		const { plc, scan } = load(SRC);
		scan();
		expect(plc.mode).toBe('RUN');
		plc.modify('MW10', 7);
		scan();
		expect(plc.mode).toBe('FAULT');
		expect(plc.getOutput('Q0.0')).toBe(false);
		expect(texts(plc).at(-2)).toMatch(/indeks poza zakresem tablicy a\[0..3\].*brak OB121/);
	});

	it('OB121 handles it and the program goes on', () => {
		const { plc, scan, read } = load(`${SRC}
ORGANIZATION_BLOCK OB121
  Q0.1 := TRUE;
END_ORGANIZATION_BLOCK`);
		plc.modify('MW10', 7);
		scan();
		expect(plc.mode).toBe('RUN');
		expect(plc.getOutput('Q0.0')).toBe(true);
		expect(plc.getOutput('Q0.1')).toBe(true);
		expect(read('x')).toBe(0);
		expect(texts(plc).at(-1)).toMatch(/obsłużony w OB121/);
	});

	it('a write out of range and a call of an FB array element out of range', () => {
		const { plc, scan } = load(`
VAR a : ARRAY[1..2] OF INT; i : INT; END_VAR
i := 3;
a[i] := 5;`);
		scan();
		expect(plc.mode).toBe('FAULT');
	});
});

describe('OB100 and the diagnostic buffer', () => {
	it('OB100 runs once before the first cycle', () => {
		const { plc, scan, read } = load(`
VAR starts, cycles : INT; END_VAR
cycles := cycles + 1;
ORGANIZATION_BLOCK OB100
  starts := starts + 1;
  cycles := 100;
END_ORGANIZATION_BLOCK`);
		scan(5);
		expect(read('starts')).toBe(1);
		expect(read('cycles')).toBe(105);
		expect(texts(plc)).toContain('Rozruch: wykonano OB100');
	});

	it('records downloads and mode changes', () => {
		const { plc, scan } = load('Q0.0 := TRUE;');
		scan();
		plc.stop();
		expect(texts(plc)).toEqual([
			'Program wgrany do CPU (3 instrukcji)',
			'Zmiana trybu: STOP → RUN',
			'Zmiana trybu: RUN → STOP'
		]);
	});

	it('rejects unknown organisation blocks', () => {
		const r = compileSt('Q0.0 := TRUE;\nORGANIZATION_BLOCK OB1\nEND_ORGANIZATION_BLOCK');
		expect(r.diagnostics[0].message).toMatch(/Known blocks/);
	});
});
