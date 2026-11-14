import { describe, expect, it } from 'vitest';
import { parseAddress, Plc } from '#lib/engine/index.js';
import { LESSONS } from '#lib/lessons/lessons.js';
import { runLessonTests } from '#lib/lessons/runner.js';
import { compileSt } from './compiler.js';
import { DEMO_ST } from './examples.js';
import { tokenize } from './lexer.js';
import { parse } from './parser.js';

function run(src: string, symbols: Record<string, string> = {}) {
	const result = compileSt(src, {
		symbols: new Map(Object.entries(symbols).map(([k, v]) => [k.toUpperCase(), v]))
	});
	expect(result.diagnostics).toEqual([]);
	const plc = new Plc();
	plc.load(result.program);
	plc.run();
	const variable = (name: string) => {
		const v = result.variables.find((x) => x.name === name)!;
		const read = v.reads[0];
		const a = parseAddress(read.address);
		return read.kind === 'bool' ? plc.memory.readBit(a) : plc.memory.readNumber(a, read.numType);
	};
	const scans = (n: number, dt = 10) => {
		for (let i = 0; i < n; i++) plc.scan(dt);
	};
	return { plc, result, variable, scans };
}

const errorsOf = (src: string) => compileSt(src).diagnostics.map((d) => d.message);

describe('lexer', () => {
	it('recognises addresses, literals and comments', () => {
		const tokens = tokenize(
			'%ix0.1 Q0.0 MW10 T3 t1 16#FF 2#1010_0101 1_000 2.5e1 T#1s_500ms (* c *) // c\n:= ..'
		);
		expect(tokens.map((t) => [t.kind, t.value ?? t.text])).toEqual([
			['address', 'I0.1'],
			['address', 'Q0.0'],
			['address', 'MW10'],
			['address', 'T3'],
			['ident', 't1'],
			['int', 255],
			['int', 165],
			['int', 1000],
			['real', 25],
			['time', 1500],
			['op', ':='],
			['op', '..'],
			['eof', '']
		]);
	});

	it('reads a range without mistaking it for a decimal point', () => {
		expect(tokenize('1..5').map((t) => t.text)).toEqual(['1', '..', '5', '']);
	});
});

describe('parser', () => {
	it('reports several syntax errors with positions and keeps going', () => {
		const src = 'Q0.0 := TRUE\nQ0.1 := FALSE;\nQ0.2 := ;\nQ0.3 := TRUE;';
		const { errors, program } = parse(src);
		expect(errors.map((e) => e.message)).toEqual([
			'Expected ";", found "Q0.1"',
			'Expected a value, found ";"'
		]);
		expect(src.slice(errors[0].from, errors[0].to)).toBe('Q0.1');
		expect(program.body.at(-1)).toMatchObject({ kind: 'assign', target: { text: 'Q0.3' } });
	});

	it('accepts the PROGRAM wrapper', () => {
		expect(parse('PROGRAM Main\nQ0.0 := TRUE;\nEND_PROGRAM').errors).toEqual([]);
	});
});

describe('compileSt — behaviour', () => {
	it('boolean logic: self-holding', () => {
		const { plc, scans } = run('Q0.0 := (I0.0 OR Q0.0) AND NOT I0.1;');
		plc.setInput('I0.0', true);
		scans(1);
		plc.setInput('I0.0', false);
		scans(1);
		expect(plc.getOutput('Q0.0')).toBe(true);
		plc.setInput('I0.1', true);
		scans(1);
		expect(plc.getOutput('Q0.0')).toBe(false);
	});

	it('arithmetic with precedence, INT division and REAL', () => {
		const { variable, scans } = run(`
			VAR x : REAL; n : INT; m : DINT; neg : INT; END_VAR
			x := 7 / 2.0;
			n := 7 / 2;
			m := (3 + 4) * 2 - -1;
			neg := -n * 10 MOD 4;
			MW0 := m + n * 2;
		`);
		scans(1);
		expect([variable('x'), variable('n'), variable('m'), variable('neg')]).toEqual([
			3.5, 3, 15, -2
		]);
	});

	it('IF / ELSIF / ELSE with comparisons', () => {
		const { plc, scans } = run(`
			IF MW0 > 10 THEN Q0.0 := TRUE; Q0.1 := FALSE; Q0.2 := FALSE;
			ELSIF MW0 >= 5 AND MW0 <> 7 THEN Q0.0 := FALSE; Q0.1 := TRUE; Q0.2 := FALSE;
			ELSE Q0.0 := FALSE; Q0.1 := FALSE; Q0.2 := TRUE;
			END_IF;
		`);
		const at = (v: number) => {
			plc.modify('MW0', v);
			scans(1);
			return ['Q0.0', 'Q0.1', 'Q0.2'].map((q) => plc.getOutput(q));
		};
		expect(at(11)).toEqual([true, false, false]);
		expect(at(5)).toEqual([false, true, false]);
		expect(at(7)).toEqual([false, false, true]);
		expect(at(0)).toEqual([false, false, true]);
	});

	it('CASE with values, lists, ranges and ELSE', () => {
		const { plc, variable, scans } = run(`
			VAR r : INT; END_VAR
			CASE MW0 + 1 OF
				1: r := 10;
				2, 3: r := 20;
				4..6: r := 30;
				-1: r := -1;
			ELSE r := 99;
			END_CASE;
		`);
		const at = (v: number) => {
			plc.modify('MW0', v);
			scans(1);
			return variable('r');
		};
		expect([at(0), at(1), at(2), at(4), at(-2), at(10)]).toEqual([10, 20, 20, 30, -1, 99]);
	});

	it('FOR (also BY -2), WHILE, REPEAT and EXIT', () => {
		const { variable, scans } = run(`
			VAR i : INT; sum : DINT; down : DINT; w : INT; r : INT; found : INT; END_VAR
			sum := 0;
			FOR i := 1 TO 10 DO sum := sum + i; END_FOR;
			down := 0;
			FOR i := 10 TO 1 BY -2 DO down := down * 10 + i MOD 10; END_FOR;
			w := 0;
			WHILE w < 7 DO w := w + 1; END_WHILE;
			r := 0;
			REPEAT r := r + 3; UNTIL r > 10 END_REPEAT;
			found := 0;
			FOR i := 1 TO 100 DO
				IF i * i > 50 THEN found := i; EXIT; END_IF;
			END_FOR;
		`);
		scans(1);
		expect([
			variable('sum'),
			variable('down'),
			variable('w'),
			variable('r'),
			variable('found')
		]).toEqual([55, 8642, 7, 12, 8]);
	});

	it('TON, CTU and R_TRIG function blocks', () => {
		const { plc, variable, scans } = run(`
			VAR t : TON; c : CTU; edge : R_TRIG; END_VAR
			t(IN := I0.0, PT := T#100ms);
			Q0.0 := t.Q;
			edge(CLK := I0.1);
			c(CU := edge.Q, R := I0.2, PV := 2);
			Q0.1 := c.Q;
			MW0 := c.CV;
		`);
		plc.setInput('I0.0', true);
		scans(10);
		expect(plc.getOutput('Q0.0')).toBe(false);
		scans(1);
		expect(plc.getOutput('Q0.0')).toBe(true);
		expect(variable('t')).toBe(true);

		for (let k = 0; k < 2; k++) {
			plc.setInput('I0.1', true);
			scans(1);
			plc.setInput('I0.1', false);
			scans(1);
		}
		expect(plc.getOutput('Q0.1')).toBe(true);
		expect(plc.memory.readNumber(parseAddress('MW0'))).toBe(2);
	});

	it('initial values are applied once after download', () => {
		const { variable, scans } = run('VAR c : INT := 5; on : BOOL := TRUE; END_VAR c := c + 1;');
		scans(3);
		expect([variable('c'), variable('on')]).toEqual([8, true]);
	});

	it('AT binds a variable to an address; symbols work as names', () => {
		const { plc, scans } = run('VAR lamp AT %Q0.3 : BOOL; END_VAR lamp := Start AND NOT Stop;', {
			Start: 'I0.0',
			Stop: 'I0.1'
		});
		plc.setInput('I0.0', true);
		scans(1);
		expect(plc.getOutput('Q0.3')).toBe(true);
	});

	it('an endless loop trips the watchdog', () => {
		const { plc } = run('WHILE TRUE DO END_WHILE;');
		plc.maxStepsPerScan = 10_000;
		plc.scan(10);
		expect(plc.mode).toBe('FAULT');
	});

	it('compiles the demo program against the demo symbols', () => {
		const symbols = {
			Start: 'I0.0',
			Stop: 'I0.1',
			ResetCount: 'I0.2',
			Motor: 'Q0.0',
			Running: 'Q0.1',
			Service: 'Q0.2'
		};
		const { plc, scans } = run(DEMO_ST, symbols);
		plc.setInput('I0.0', true);
		scans(1);
		plc.setInput('I0.0', false);
		scans(300);
		expect([plc.getOutput('Q0.0'), plc.getOutput('Q0.1')]).toEqual([true, true]);
	});
});

describe('compileSt — diagnostics', () => {
	it.each([
		['Q0.0 := Foo;', /Unknown variable "Foo"/],
		['VAR n : INT; END_VAR Q0.0 := n;', /a BOOL expression is needed/],
		['VAR n : INT; END_VAR n := TRUE;', /a number is needed, not a BOOL/],
		['I0.0 := TRUE;', /is an input and cannot be assigned/],
		['VAR t : TON; END_VAR t(IN := TRUE);', /input PT is missing/],
		['VAR t : TON; END_VAR t(IN := TRUE, PT := T#1s, Q := TRUE);', /TON has no input Q/],
		['VAR t : TON; END_VAR Q0.0 := t;', /call it, then read t.Q/],
		['VAR t : TON; END_VAR MW0 := t.CV;', /TON has no output CV/],
		['EXIT;', /EXIT is only allowed inside/],
		['VAR x : WORD; END_VAR', /Unknown type WORD/],
		['VAR a : INT; a : BOOL; END_VAR', /declared twice/],
		['IF MW0 THEN Q0.0 := TRUE; END_IF;', /IF needs a BOOL condition/],
		['VAR i : INT; END_VAR FOR i := 1 TO 5 BY MW0 DO END_FOR;', /BY must be an integer constant/],
		['MW0 := 1 / 0;', /Division by zero/],
		['VAR q AT %Q0.0 : INT; END_VAR', /cannot hold a INT/]
	])('%s', (src, message) => {
		expect(errorsOf(src)).toEqual(expect.arrayContaining([expect.stringMatching(message)]));
	});

	it('points at the offending text', () => {
		const src = 'Q0.0 := TRUE;\nQ0.1 := Missing;';
		const [d] = compileSt(src).diagnostics;
		expect(src.slice(d.from, d.to)).toBe('Missing');
	});
});

describe('lessons can be solved in ST', () => {
	const solutions: Record<string, string> = {
		'self-holding': 'Motor := (Start OR Motor) AND NOT Stop;',
		toggle: `
			VAR edge : R_TRIG; END_VAR
			edge(CLK := Button);
			IF edge.Q THEN Lamp := NOT Lamp; END_IF;`,
		'traffic-light': `
			VAR cycle : TON; END_VAR
			cycle(IN := NOT cycle.Q, PT := T#8s);
			Red := cycle.ET < 4000;
			Yellow := (cycle.ET >= 3000 AND cycle.ET < 4000) OR cycle.ET >= 7000;
			Green := cycle.ET >= 4000 AND cycle.ET < 7000;`,
		'tank-level': `
			IF NOT Low THEN Pump := TRUE; END_IF;
			IF High THEN Pump := FALSE; END_IF;`
	};

	it.each(Object.entries(solutions))('%s', (slug, src) => {
		const lesson = LESSONS.find((l) => l.slug === slug)!;
		const project = lesson.starter();
		const symbols = new Map<string, string>();
		for (const w of project.circuit.wires) {
			const d = project.circuit.devices.find((x) => x.id === w.device)!;
			symbols.set(d.label.toUpperCase(), w.terminal);
		}
		for (const s of project.symbols) symbols.set(s.name.toUpperCase(), s.address);
		const { program, diagnostics } = compileSt(src, { symbols });
		expect(diagnostics).toEqual([]);
		expect(runLessonTests(lesson, program).filter((r) => !r.passed)).toEqual([]);
	});
});
