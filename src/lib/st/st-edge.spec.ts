import { describe, expect, it } from 'vitest';
import { parseAddress, Plc } from '#lib/engine/index.js';
import { compileSt } from './compiler.js';
import { parse } from './parser.js';

const syntaxErrors = (src: string) => parse(src).errors.map((e) => e.message);
const compileErrors = (src: string) => compileSt(src).diagnostics.map((d) => d.message);

describe('parser — error paths and recovery', () => {
	it.each([
		['(* never closed', /Comment is not closed/],
		['Q0.0 := T#5x;', /Invalid time literal/],
		['Q0.0 := TRUE $', /Unexpected character "\$"/],
		['Q0.0 := %Z1;', /Invalid direct address/],
		['VAR a : ; END_VAR', /Expected a type/],
		['VAR a AT b : BOOL; END_VAR', /AT must be followed by an address/],
		['VAR a : BOOL;', /Expected END_VAR/],
		['Q0.0 := TRUE; VAR a : BOOL; END_VAR', /VAR blocks must come before/],
		['FOR MW0 := 1 5 DO END_FOR;', /Expected TO/],
		['WHILE TRUE Q0.0 := TRUE; END_WHILE;', /Expected DO/],
		['REPEAT Q0.0 := TRUE; END_REPEAT;', /Expected UNTIL/],
		['IF TRUE THEN Q0.0 := TRUE;', /Expected END_IF/],
		['CASE MW0 OF x: Q0.0 := TRUE; END_CASE;', /CASE labels must be integer constants/],
		['t(IN TRUE);', /Expected ":="/],
		['t(:= TRUE);', /Expected a parameter name/],
		['Q0.0 TRUE;', /Expected ":=" after Q0.0/],
		['5 := Q0.0;', /Expected a variable/],
		['Q0.0 := t.;', /Expected a member name/],
		['PROGRAM P Q0.0 := TRUE;', /Expected END_PROGRAM/],
		['THEN', /Unexpected "THEN"/],
		['Q0.0 := TRUE; END_IF Q0.1 := TRUE;', /Unexpected "END_IF"/]
	])('%s', (src, message) => {
		expect(syntaxErrors(src)).toEqual(expect.arrayContaining([expect.stringMatching(message)]));
	});

	it('recovers inside VAR blocks and CASE branches', () => {
		const { errors, program } = parse(`
			VAR a : ; b : INT; END_VAR
			CASE b OF
				1: Q0.0 := ;
				2: Q0.1 := TRUE;
			END_CASE;
		`);
		expect(errors).toHaveLength(2);
		expect(program.vars.map((v) => v.name)).toEqual(['b']);
		const c = program.body[0];
		expect(c.kind === 'case' && c.cases.map((x) => x.body.length)).toEqual([0, 1]);
	});

	it('parses unary plus, empty statements, RETURN and empty calls', () => {
		const { errors, program } = parse('MW0 := +5;; RETURN; x();');
		expect(errors).toEqual([]);
		expect(program.body.map((s) => s.kind)).toEqual(['assign', 'return', 'call']);
	});
});

describe('compiler — less common paths', () => {
	function run(src: string) {
		const r = compileSt(src);
		expect(r.diagnostics).toEqual([]);
		const plc = new Plc();
		plc.load(r.program);
		plc.run();
		return { plc, r };
	}

	it('TOF, TP, CTD and F_TRIG', () => {
		const { plc } = run(`
			VAR off : TOF; pulse : TP; down : CTD; fall : F_TRIG; END_VAR
			off(IN := I0.0, PT := 50);
			Q0.0 := off.Q;
			pulse(IN := I0.0, PT := T#30ms);
			Q0.1 := pulse.Q;
			fall(CLK := I0.0);
			down(CD := fall.Q, LD := I0.1, PV := 1);
			Q0.2 := down.Q;
		`);
		plc.setInput('I0.1', true);
		plc.scan(10);
		plc.setInput('I0.1', false);
		plc.setInput('I0.0', true);
		plc.scan(10);
		expect([plc.getOutput('Q0.0'), plc.getOutput('Q0.1'), plc.getOutput('Q0.2')]).toEqual([
			true,
			true,
			false
		]);
		plc.setInput('I0.0', false);
		plc.scan(10); // falling edge → CTD counts to 0
		expect(plc.getOutput('Q0.2')).toBe(true);
		for (let i = 0; i < 6; i++) plc.scan(10);
		expect([plc.getOutput('Q0.0'), plc.getOutput('Q0.1')]).toEqual([false, false]);
	});

	it('BOOL equality, unary minus on REAL, AT with BYTE / DINT / REAL, RETURN', () => {
		const { plc } = run(`
			VAR b AT %MB10 : BYTE; d AT %MD12 : DINT; r AT %MD16 : REAL; x : REAL; END_VAR
			Q0.0 := I0.0 = I0.1;
			Q0.1 := I0.0 <> I0.1;
			x := 2.5;
			r := -x * 2.0;
			d := 100000;
			b := 300;
			RETURN;
			Q0.2 := TRUE;
		`);
		plc.scan(10);
		const n = (a: string, t?: 'REAL') => plc.memory.readNumber(parseAddress(a), t);
		expect([plc.getOutput('Q0.0'), plc.getOutput('Q0.1'), plc.getOutput('Q0.2')]).toEqual([
			true,
			false,
			false
		]);
		expect([n('MD16', 'REAL'), n('MD12'), n('MB10')]).toEqual([-5, 100000, 44]);
	});

	it.each([
		['Q0.0 := 5;', /a BOOL expression is needed/],
		['Q0.0 := NOT 5;', /A BOOL is needed here, not a number/],
		['Q0.0 := -I0.0;', /A BOOL is needed here, not a number/],
		['MW0 := NOT I0.0;', /a number is needed, not a BOOL/],
		['MW0 := I0.0 + 1;', /is a BOOL — a number is needed/],
		['MW0 := TRUE + 1;', /not TRUE \/ FALSE/],
		['Q0.0 := MW0 AND MW2;', /bitwise/],
		['Q0.0 := I0.0 = 1;', /Cannot compare a BOOL with a number/],
		['Q0.0 := I0.0 < I0.1;', /Cannot compare a BOOL with a BOOL using </],
		['Q0.0 := MW0 + 1;', /a BOOL expression is needed/],
		['VAR n : INT; END_VAR Q0.0 := n.Q;', /is not a function block/],
		['VAR e : R_TRIG; END_VAR Q0.0 := e.ET;', /R_TRIG has no output ET/],
		['VAR c : CTU; END_VAR MW0 := c.ET;', /CTU has no output ET/],
		['n(IN := TRUE);', /Unknown function block "n"/],
		['VAR n : INT; END_VAR n(IN := TRUE);', /is not a function block/],
		['VAR t : TON; END_VAR t(IN := 5, PT := 1);', /IN needs a BOOL/],
		['VAR t : TON := 1; END_VAR', /cannot be initialised/],
		['VAR t AT %M0.0 : TON; END_VAR', /cannot have an AT address/],
		['T0 := TRUE;', /is a timer or counter and cannot be assigned/],
		['VAR x : REAL; END_VAR FOR x := 1 TO 2 DO END_FOR;', /FOR needs an integer variable/],
		['VAR i : INT; END_VAR FOR i := 1 TO 2 BY 0 DO END_FOR;', /BY 0/],
		['WHILE MW0 DO END_WHILE;', /WHILE needs a BOOL condition/],
		['REPEAT UNTIL MW0 END_REPEAT;', /UNTIL needs a BOOL condition/],
		['CASE I0.0 OF 1: ; END_CASE;', /CASE needs an integer selector/],
		['MW0 := 7 MOD 0;', /Division by zero/]
	])('%s', (src, message) => {
		expect(compileErrors(src)).toEqual(expect.arrayContaining([expect.stringMatching(message)]));
	});

	it('runs out of variable space gracefully', () => {
		const decls = Array.from({ length: 30 }, (_, i) => `v${i} : DINT;`).join(' ');
		expect(compileErrors(`VAR ${decls} END_VAR`)).toEqual(
			expect.arrayContaining([expect.stringMatching(/marker area .* is full/)])
		);
	});

	it('reports overly complex expressions', () => {
		const deep = Array.from({ length: 10 }, (_, i) => `(MW${i * 2} + 1)`).join(' * ');
		const r = compileSt(`MW100 := ${deep};`);
		expect(r.diagnostics.map((d) => d.message)).toEqual([expect.stringMatching(/too complex/)]);
	});
});
