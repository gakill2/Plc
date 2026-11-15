import { describe, expect, it } from 'vitest';
import { Plc, parseAddress } from '#lib/engine/index.js';
import { compileSt } from './compiler.js';

const LIB = `TYPE Recipe :
STRUCT
  Temp : INT;
  Time : TIME;
  Stir : BOOL;
END_STRUCT
END_TYPE

DATA_BLOCK Recipes
VAR
  Items : ARRAY[1..3] OF Recipe;
  Active : Recipe;
END_VAR
VAR RETAIN
  Batches : INT;
END_VAR
END_DATA_BLOCK
`;

function run(src: string, prelude = LIB) {
	const r = compileSt(src, { prelude });
	expect(r.diagnostics).toEqual([]);
	const plc = new Plc();
	plc.load(r.program, r.load);
	plc.run();
	plc.scan(10);
	return { plc, r };
}
const word = (plc: Plc, a: string) => plc.memory.readNumber(parseAddress(a));

describe('data blocks and structure copies', () => {
	it('reads and writes DB fields like global variables', () => {
		const { plc } = run(`Recipes.Items[2].Temp := 650;
Recipes.Items[2].Stir := TRUE;
MW10 := Recipes.Items[2].Temp;
IF Recipes.Items[2].Stir THEN Q0.0 := TRUE; END_IF;`);
		expect(word(plc, 'MW10')).toBe(650);
		expect(plc.getOutput('Q0.0')).toBe(true);
	});

	it('copies a whole structure, also with a computed index', () => {
		const { plc } = run(`VAR n : INT := 3; END_VAR
Recipes.Items[3].Temp := 420;
Recipes.Items[3].Stir := TRUE;
Recipes.Active := Recipes.Items[n];
MW10 := Recipes.Active.Temp;
Q0.1 := Recipes.Active.Stir;`);
		expect(word(plc, 'MW10')).toBe(420);
		expect(plc.getOutput('Q0.1')).toBe(true);
	});

	it('keeps RETAIN fields of a DB over a restart', () => {
		const src =
			'IF I0.0 THEN Recipes.Batches := Recipes.Batches + 1; END_IF;\nMW12 := Recipes.Batches;';
		const r = compileSt(src, { prelude: LIB });
		const plc = new Plc();
		plc.load(r.program, r.load);
		plc.run();
		plc.setInput('I0.0', true);
		plc.scan(10);
		plc.scan(10);
		plc.setInput('I0.0', false);
		plc.load(r.program, r.load);
		plc.run();
		plc.scan(10);
		expect(word(plc, 'MW12')).toBe(2);
	});

	it('explains a wrong structure copy and an unknown field', () => {
		const bad = compileSt('VAR x : INT; END_VAR\nRecipes.Active := x;', { prelude: LIB });
		expect(bad.diagnostics[0].message).toMatch(/Only a Recipe can be assigned/);
		const field = compileSt('MW0 := Recipes.Active.Speed;', { prelude: LIB });
		expect(field.diagnostics[0].message).toMatch(/no field speed/i);
	});
});

describe('STRING', () => {
	const STR_LIB = `TYPE Product :
STRUCT
  Code : STRING[8];
  Qty : INT;
END_STRUCT
END_TYPE
DATA_BLOCK Orders
VAR
  Items : ARRAY[1..3] OF Product;
  Current : Product;
END_VAR
END_DATA_BLOCK
`;

	it('assigns, compares and measures strings', () => {
		const { plc } = run(
			`VAR a : STRING[10] := 'AB-17'; b : STRING; c : STRING[3]; END_VAR
b := a;
c := a;
Q0.0 := b = 'AB-17';
Q0.1 := b <> a;
Q0.2 := c = 'AB-';
MW10 := LEN(a);
MW12 := LEN(c);
IF a = 'XYZ' THEN Q0.3 := TRUE; END_IF;`,
			''
		);
		expect(plc.getOutput('Q0.0')).toBe(true);
		expect(plc.getOutput('Q0.1')).toBe(false);
		expect(plc.getOutput('Q0.2')).toBe(true); // cut to its size
		expect(plc.getOutput('Q0.3')).toBe(false);
		expect(word(plc, 'MW10')).toBe(5);
		expect(word(plc, 'MW12')).toBe(3);
	});

	it('copies a structure with a STRING out of a DB with a computed index', () => {
		const { plc } = run(
			`VAR n : INT := 2; END_VAR
Orders.Items[1].Code := 'BOLT-M8';
Orders.Items[2].Code := 'NUT-M8';
Orders.Items[2].Qty := 500;
Orders.Current := Orders.Items[n];
Q0.0 := Orders.Current.Code = 'NUT-M8';
MW10 := Orders.Current.Qty;
MW12 := LEN(Orders.Current.Code);`,
			STR_LIB
		);
		expect(plc.getOutput('Q0.0')).toBe(true);
		expect(word(plc, 'MW10')).toBe(500);
		expect(word(plc, 'MW12')).toBe(6);
	});

	it('explains what a STRING cannot do', () => {
		const msgs = (src: string) =>
			compileSt(src, { prelude: STR_LIB }).diagnostics.map((d) => d.message);
		expect(msgs("VAR s : STRING[3]; END_VAR\ns := 'TOO LONG';")[0]).toMatch(/holds 3/);
		expect(msgs('VAR s : STRING; END_VAR\nMW0 := s;')[0]).toMatch(/is a STRING/);
		expect(msgs("VAR s : STRING; END_VAR\nQ0.0 := s > 'A';")[0]).toMatch(/with = or <>/);
		expect(msgs("VAR i : INT; END_VAR\nQ0.0 := Orders.Items[i].Code = 'X';")[0]).toMatch(
			/copy the structure first/
		);
		expect(msgs("VAR s : STRING; END_VAR\ns := 'Żółw';")[0]).toMatch(/Latin-1/);
	});
});
