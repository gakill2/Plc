/**
 * Export of a project to real engineering tools:
 *
 * - SCL external source for TIA Portal (Siemens): types, function blocks, functions, the program
 *   as FB "Main" with its instance DB and OB1, plus a CSV of PLC tags;
 * - PLCopen XML (TC6) for CODESYS and other IEC 61131-3 tools: POUs with Structured Text bodies,
 *   global variables at their I/O addresses and a cyclic task.
 *
 * Every language ends up as Structured Text first: ladder is translated rung by rung, SFC is
 * already compiled to ST. Then one printer writes the dialect.
 */
import { formatAddress, parseAddress } from '#lib/engine/index.js';
import { boxTypes, fbdToSt, type Fbd } from '#lib/fbd/fbd.js';
import { stlToSt } from '#lib/stl/stl.js';
import { EVENT_OBS, type ErrorOb } from '#lib/st/ast.js';
import type { BlockBox, Element, LadderProgram, Series } from '#lib/ladder/model.js';
import type { Expr, Pou, Stmt, StructType, VarDecl } from '#lib/st/ast.js';
import { parse } from '#lib/st/parser.js';
import { blockCatalog, STDLIB } from '#lib/st/stdlib.js';
import { sfcToSt, type Sfc } from '#lib/sfc/sfc.js';

/* ================================================================ ladder → ST */

const CMP_ST: Record<string, string> = {
	'==': '=',
	'<>': '<>',
	'<': '<',
	'>': '>',
	'<=': '<=',
	'>=': '>='
};

/** Translates a ladder program into equivalent Structured Text (timers and edges become instances). */
export function ladderToSt(
	ladder: LadderProgram,
	symbols: ReadonlyMap<string, string> = new Map()
): string {
	const decls = new Map<string, string>();
	const body: string[] = [];
	let temp = 0;
	let edge = 0;

	const instance = (operand: string, type: string) => {
		const i = instanceOf(operand);
		const address = i?.text ?? operand.replace(/[^A-Za-z0-9]/g, '');
		const name = type === 'CTU' || type === 'CTD' ? counterName(address) : timerName(address);
		decls.set(name, type);
		return name;
	};
	const and = (a: string | null, b: string) =>
		a ? `${/ OR | XOR /.test(a) ? `(${a})` : a} AND ${b}` : b;
	/** Timer / counter behind an operand (directly or through a symbol), e.g. T0. */
	const instanceOf = (operand: string): { area: 'T' | 'C'; text: string } | null => {
		const text = (symbols.get(up(operand.trim())) ?? operand).trim();
		try {
			const a = parseAddress(text);
			return a.area === 'T' || a.area === 'C' ? { area: a.area, text: formatAddress(a) } : null;
		} catch {
			return null;
		}
	};
	const timerName = (address: string) => `Timer_${address}`;
	const counterName = (address: string) => `Counter_${address}`;
	/** A contact on a timer / counter reads its Q output. */
	const bit = (operand: string) => {
		const i = instanceOf(operand);
		return i ? `${i.area === 'T' ? timerName(i.text) : counterName(i.text)}.Q` : operand.trim();
	};
	/** In a comparison a timer means its elapsed time, a counter its count. */
	const num = (operand: string, other: string) => {
		const i = instanceOf(operand);
		if (i) return i.area === 'T' ? `${timerName(i.text)}.ET` : `${counterName(i.text)}.CV`;
		const o = instanceOf(other);
		if (o?.area === 'T' && /^\d+$/.test(operand.trim())) return `T#${operand.trim()}ms`;
		return operand.trim();
	};
	const rlo = (r: string | null) => r ?? 'TRUE';

	function series(s: Series, input: string | null, out: string[]): string | null {
		let r = input;
		for (const el of s.items) r = element(el, r, out);
		return r;
	}

	function element(el: Element, r: string | null, out: string[]): string | null {
		switch (el.kind) {
			case 'contact': {
				if (el.type === 'NO') return and(r, bit(el.operand));
				if (el.type === 'NC') return and(r, `NOT ${bit(el.operand)}`);
				const name = `Edge${++edge}`;
				decls.set(name, el.type === 'P' ? 'R_TRIG' : 'F_TRIG');
				out.push(`${name}(CLK := ${bit(el.operand)});`);
				return and(r, `${name}.Q`);
			}
			case 'compare':
				return and(r, `(${num(el.a, el.b)} ${CMP_ST[el.cmp]} ${num(el.b, el.a)})`);
			case 'timer': {
				const name = instance(el.timer.trim(), el.type);
				out.push(`${name}(IN := ${rlo(r)}, PT := ${el.pt.trim()});`);
				return `${name}.Q`;
			}
			case 'counter': {
				const name = instance(el.counter.trim(), el.type);
				const reset = el.reset.trim()
					? `, ${el.type === 'CTU' ? 'R' : 'LD'} := ${el.reset.trim()}`
					: '';
				out.push(
					`${name}(${el.type === 'CTU' ? 'CU' : 'CD'} := ${rlo(r)}${reset}, PV := ${el.pv.trim()});`
				);
				return `${name}.Q`;
			}
			case 'move':
				out.push(`IF ${rlo(r)} THEN\n  ${el.dst.trim()} := ${el.src.trim()};\nEND_IF;`);
				return r;
			case 'math': {
				const a = el.a.trim();
				const b = el.b.trim();
				const ops: Record<string, string> = {
					ADD: '+',
					SUB: '-',
					MUL: '*',
					DIV: '/',
					MOD: 'MOD',
					WAND: 'AND',
					WOR: 'OR',
					WXOR: 'XOR'
				};
				const unary: Record<string, string> = {
					ABS: `ABS(${a})`,
					NEG: `-${a}`,
					WNOT: `NOT ${a}`,
					TRUNC: `TRUNC(${a})`,
					ROUND: `ROUND(${a})`
				};
				const value = ops[el.fn]
					? `${a} ${ops[el.fn]} ${b}`
					: (unary[el.fn] ?? `${el.fn}(${a}, ${b})`);
				out.push(`IF ${rlo(r)} THEN\n  ${el.dst.trim()} := ${value};\nEND_IF;`);
				return r;
			}
			case 'block': {
				const b = el as BlockBox;
				decls.set(b.instance, b.type);
				const args = Object.entries(b.pins)
					.filter(([, v]) => v.trim())
					.map(([pin, v]) =>
						pin.startsWith('>') ? `${pin.slice(1)} => ${v.trim()}` : `${pin} := ${v.trim()}`
					);
				out.push(`IF ${rlo(r)} THEN\n  ${b.instance}(${args.join(', ')});\nEND_IF;`);
				return r;
			}
			case 'parallel': {
				let input = r;
				if (r && /\s/.test(r)) {
					const name = `Power${++temp}`;
					decls.set(name, 'BOOL');
					out.push(`${name} := ${r};`);
					input = name;
				}
				const branches = el.branches.map((b) => series(b, input, out) ?? 'TRUE');
				return branches.map((b) => (/\s/.test(b) ? `(${b})` : b)).join(' OR ');
			}
		}
	}

	ladder.rungs.forEach((rung, i) => {
		const out: string[] = [];
		const r = rlo(series(rung.logic, null, out));
		body.push(`// Network ${i + 1}${rung.comment.trim() ? `: ${rung.comment.trim()}` : ''}`);
		body.push(...out);
		for (const c of rung.coils) {
			const op = c.operand.trim();
			if (c.type === 'COIL') body.push(`${op} := ${r};`);
			else if (c.type === 'NCOIL') body.push(`${op} := NOT (${r});`);
			else body.push(`IF ${r} THEN\n  ${op} := ${c.type === 'SET' ? 'TRUE' : 'FALSE'};\nEND_IF;`);
		}
	});

	const vars = [...decls.entries()].map(([n, t]) => `  ${n} : ${t};`).join('\n');
	return `${vars ? `VAR\n${vars}\nEND_VAR\n\n` : ''}${body.join('\n')}\n`;
}

/* ================================================================ common */

export interface ExportInput {
	name: string;
	language: 'ladder' | 'st' | 'sfc' | 'fbd' | 'stl';
	ladder: LadderProgram;
	st: string;
	sfc: Sfc;
	fbd?: Fbd;
	/** Statement List source (STL programs) */
	stl?: string;
	library: string;
	/** symbol table (user + wired devices) */
	symbols: { name: string; address: string; comment: string }[];
}

interface Unit {
	types: StructType[];
	pous: Pou[];
	main: {
		vars: VarDecl[];
		body: Stmt[];
		cyclic?: { intervalMs: number; body: Stmt[] };
		obs?: { ob: ErrorOb; body: Stmt[] }[];
	};
	errors: string[];
	/** The parser upper-cases parameter, member and type names; this restores how they were declared. */
	caseOf: (name: string) => string;
}

const symbolMap = (p: ExportInput) =>
	new Map(p.symbols.map((s) => [up(s.name), s.address] as const));

export function programSource(p: ExportInput, symbols = symbolMap(p)): string {
	return p.language === 'ladder'
		? ladderToSt(p.ladder, symbols)
		: p.language === 'sfc'
			? sfcToSt(p.sfc).source
			: p.language === 'fbd' && p.fbd
				? fbdToSt(p.fbd, boxTypes(blockCatalog(p.library))).source
				: p.language === 'stl'
					? stlToSt(p.stl ?? '').source
					: p.st;
}

/** Library, the standard blocks the program actually uses, and the program — parsed. */
function unit(p: ExportInput): Unit {
	const program = programSource(p, symbolMap(p));
	const std = parse(STDLIB).program.pous ?? [];
	const text = `${p.library}\n${program}`;
	const used = std.filter((b) => new RegExp(`(?::|\\bOF)\\s*${b.name}\\s*[;:]`, 'i').test(text));
	const usedSrc = used
		.map((b) =>
			STDLIB.slice(
				b.from,
				STDLIB.indexOf('END_FUNCTION_BLOCK', b.from) + 'END_FUNCTION_BLOCK'.length
			)
		)
		.join('\n\n');
	const { program: ast, errors } = parse(`${usedSrc}\n${p.library}\n${program}`);
	const names = new Map<string, string>();
	const remember = (n: string) => {
		if (!names.has(up(n))) names.set(up(n), n);
	};
	for (const t of ast.types ?? []) {
		remember(t.name);
		t.fields.forEach((f) => remember(f.name));
	}
	for (const pou of ast.pous ?? []) {
		remember(pou.name);
		[...pou.inputs, ...pou.outputs, ...pou.locals].forEach((v) => remember(v.name));
	}
	return {
		types: ast.types ?? [],
		pous: ast.pous ?? [],
		main: { vars: ast.vars, body: ast.body, cyclic: ast.cyclic, obs: ast.obs },
		errors: errors.map((e) => e.message),
		caseOf: (n) => names.get(up(n)) ?? n
	};
}

const PREC: Record<string, number> = {
	OR: 1,
	XOR: 2,
	AND: 3,
	'=': 4,
	'<>': 4,
	'<': 5,
	'>': 5,
	'<=': 5,
	'>=': 5,
	'+': 6,
	'-': 6,
	'*': 7,
	'/': 7,
	MOD: 7
};

interface Dialect {
	/** declared spelling of a parameter, member or type name */
	caseOf(n: string): string;
	name(n: string): string;
	member(object: string, member: string): string;
	address(text: string): string;
	fcall(name: string, args: string[]): string;
	call(name: string): string;
}

function expr(e: Expr, d: Dialect, parent = 0): string {
	switch (e.kind) {
		case 'number':
			return e.real && Number.isInteger(e.value) ? e.value.toFixed(1) : String(e.value);
		case 'bool':
			return e.value ? 'TRUE' : 'FALSE';
		case 'time':
			return `T#${e.value}ms`;
		case 'name':
			return d.name(e.name);
		case 'address':
			return d.address(e.text);
		case 'member':
			return d.member(e.object, d.caseOf(e.member));
		case 'index':
			return `${d.name(e.array)}[${expr(e.index, d)}]${e.member ? `.${d.caseOf(e.member)}` : ''}`;
		case 'unary':
			return e.op === 'NOT' ? `NOT ${expr(e.expr, d, 8)}` : `-${expr(e.expr, d, 8)}`;
		case 'binary': {
			const p = PREC[e.op];
			const s = `${expr(e.left, d, p)} ${e.op} ${expr(e.right, d, p + 1)}`;
			return p < parent ? `(${s})` : s;
		}
		case 'fcall':
			return d.fcall(
				e.name,
				e.args.map((a) => expr(a, d))
			);
	}
	return '';
}

function stmts(list: Stmt[], d: Dialect, indent: string): string[] {
	const out: string[] = [];
	const target = (t: Expr) => expr(t, d);
	for (const s of list) {
		switch (s.kind) {
			case 'assign':
				out.push(`${indent}${target(s.target)} := ${expr(s.value, d)};`);
				break;
			case 'call': {
				const args = s.args.map((a) =>
					a.output
						? `${d.caseOf(a.name)} => ${target(a.value)}`
						: `${d.caseOf(a.name)} := ${expr(a.value, d)}`
				);
				const index = s.index ? `[${expr(s.index, d)}]` : '';
				out.push(`${indent}${d.call(s.name)}${index}(${args.join(', ')});`);
				break;
			}
			case 'if':
				s.branches.forEach((b, i) => {
					out.push(`${indent}${i ? 'ELSIF' : 'IF'} ${expr(b.cond, d)} THEN`);
					out.push(...stmts(b.body, d, `${indent}  `));
				});
				if (s.otherwise) {
					out.push(`${indent}ELSE`);
					out.push(...stmts(s.otherwise, d, `${indent}  `));
				}
				out.push(`${indent}END_IF;`);
				break;
			case 'case':
				out.push(`${indent}CASE ${expr(s.selector, d)} OF`);
				for (const c of s.cases) {
					const labels = c.labels
						.map((l) => (l.kind === 'value' ? String(l.value) : `${l.low}..${l.high}`))
						.join(', ');
					out.push(`${indent}  ${labels}:`);
					out.push(...stmts(c.body, d, `${indent}    `));
				}
				if (s.otherwise) {
					out.push(`${indent}  ELSE`);
					out.push(...stmts(s.otherwise, d, `${indent}    `));
				}
				out.push(`${indent}END_CASE;`);
				break;
			case 'for':
				out.push(
					`${indent}FOR ${target(s.variable)} := ${expr(s.start, d)} TO ${expr(s.end, d)}${s.step ? ` BY ${expr(s.step, d)}` : ''} DO`
				);
				out.push(...stmts(s.body, d, `${indent}  `));
				out.push(`${indent}END_FOR;`);
				break;
			case 'while':
				out.push(`${indent}WHILE ${expr(s.cond, d)} DO`);
				out.push(...stmts(s.body, d, `${indent}  `));
				out.push(`${indent}END_WHILE;`);
				break;
			case 'repeat':
				out.push(`${indent}REPEAT`);
				out.push(...stmts(s.body, d, `${indent}  `));
				out.push(`${indent}UNTIL ${expr(s.until, d)}`);
				out.push(`${indent}END_REPEAT;`);
				break;
			case 'exit':
				out.push(`${indent}EXIT;`);
				break;
			case 'return':
				out.push(`${indent}RETURN;`);
				break;
		}
	}
	return out;
}

const up = (s: string) => s.toUpperCase();

/** Bit / word / double word of an address, for tag types. */
function addressType(text: string): string {
	try {
		const a = parseAddress(text);
		if (a.area === 'T' || a.area === 'C') return 'BOOL';
		return a.size === 'X' ? 'BOOL' : a.size === 'B' ? 'BYTE' : a.size === 'W' ? 'INT' : 'DINT';
	} catch {
		return 'BOOL';
	}
}

/* ================================================================ TIA Portal SCL */

const SCL_TYPES: Record<string, string> = {
	BOOL: 'Bool',
	BYTE: 'Byte',
	INT: 'Int',
	DINT: 'DInt',
	REAL: 'Real',
	TIME: 'Time',
	TON: 'TON_TIME',
	TOF: 'TOF_TIME',
	TP: 'TP_TIME',
	CTU: 'CTU_INT',
	CTD: 'CTD_INT',
	R_TRIG: 'R_TRIG',
	F_TRIG: 'F_TRIG'
};

export function exportScl(p: ExportInput): { scl: string; tags: string; errors: string[] } {
	const u = unit(p);
	const userTypes = new Set([
		...u.types.map((t) => up(t.name)),
		...u.pous.filter((x) => x.kind === 'fb').map((x) => up(x.name))
	]);
	const functions = new Set(u.pous.filter((x) => x.kind === 'function').map((x) => up(x.name)));
	const symbols = new Set(p.symbols.map((s) => up(s.name)));
	const type = (t: string) => (userTypes.has(up(t)) ? `"${u.caseOf(t)}"` : (SCL_TYPES[up(t)] ?? t));

	const dialect = (locals: Set<string>, fnName?: string): Dialect => ({
		caseOf: u.caseOf,
		name: (n) =>
			locals.has(up(n)) || (fnName && up(n) === up(fnName))
				? `#${n}`
				: symbols.has(up(n))
					? `"${n}"`
					: n,
		member: (o, m) => `${locals.has(up(o)) ? `#${o}` : `"${o}"`}.${m}`,
		address: (text) => `%${formatAddress(parseAddress(text))}`,
		fcall: (name, args) =>
			functions.has(up(name))
				? `"${name}"(${args.join(', ')})`
				: name === 'SHL' || name === 'SHR'
					? `${name}(IN := ${args[0]}, N := ${args[1]})`
					: `${name}(${args.join(', ')})`,
		call: (name) => (locals.has(up(name)) ? `#${name}` : `"${name}"`)
	});
	const declType = (v: VarDecl) =>
		v.dims ? `Array[${v.dims.low}..${v.dims.high}] of ${type(v.type)}` : type(v.type);
	const declInit = (v: VarDecl, d: Dialect) =>
		v.initList
			? ` := [${v.initList.map((x) => expr(x, d)).join(', ')}]`
			: v.init
				? ` := ${expr(v.init, d)}`
				: '';
	const varSection = (head: string, list: VarDecl[], d: Dialect) =>
		list.length
			? [
					`   ${head}`,
					...list.map(
						(v) =>
							`      ${v.name} : ${declType(v)}${declInit(v, d)};${v.at ? ` // było AT ${v.at} — użyj tagu PLC` : ''}`
					),
					'   END_VAR'
				]
			: [];
	const out: string[] = [
		`// Wyeksportowane z PLC Sim: ${p.name || 'projekt'}`,
		'// TIA Portal: Zewnętrzne źródła → Dodaj nowy plik zewnętrzny → Generuj bloki ze źródła.',
		''
	];

	for (const t of u.types) {
		const d = dialect(new Set());
		out.push(`TYPE "${t.name}"`, 'VERSION : 0.1', '   STRUCT');
		for (const f of t.fields) out.push(`      ${f.name} : ${declType(f)}${declInit(f, d)};`);
		out.push('   END_STRUCT;', 'END_TYPE', '');
	}
	for (const pou of u.pous) {
		const locals = new Set([...pou.inputs, ...pou.outputs, ...pou.locals].map((v) => up(v.name)));
		const d = dialect(locals, pou.kind === 'function' ? pou.name : undefined);
		if (pou.kind === 'fb') out.push(`FUNCTION_BLOCK "${pou.name}"`);
		else out.push(`FUNCTION "${pou.name}" : ${type(pou.returnType ?? 'INT')}`);
		out.push("{ S7_Optimized_Access := 'TRUE' }", 'VERSION : 0.1');
		out.push(
			...varSection('VAR_INPUT', pou.inputs, d),
			...varSection('VAR_OUTPUT', pou.outputs, d)
		);
		out.push(...varSection(pou.kind === 'fb' ? 'VAR' : 'VAR_TEMP', pou.locals, d));
		out.push(
			'',
			'BEGIN',
			...stmts(pou.body, d, '\t'),
			pou.kind === 'fb' ? 'END_FUNCTION_BLOCK' : 'END_FUNCTION',
			''
		);
	}

	const mainLocals = new Set(u.main.vars.map((v) => up(v.name)));
	const md = dialect(mainLocals);
	out.push('FUNCTION_BLOCK "Main"', "{ S7_Optimized_Access := 'TRUE' }", 'VERSION : 0.1');
	out.push(
		...varSection(
			'VAR RETAIN',
			u.main.vars.filter((v) => v.retain),
			md
		),
		...varSection(
			'VAR',
			u.main.vars.filter((v) => !v.retain),
			md
		)
	);
	out.push('', 'BEGIN', ...stmts(u.main.body, md, '\t'), 'END_FUNCTION_BLOCK', '');
	out.push(
		'DATA_BLOCK "Main_DB"',
		"{ S7_Optimized_Access := 'TRUE' }",
		'VERSION : 0.1',
		'"Main"',
		'BEGIN',
		'END_DATA_BLOCK',
		''
	);
	out.push(
		'ORGANIZATION_BLOCK "Main_OB1"',
		"TITLE = 'Program cykliczny'",
		"{ S7_Optimized_Access := 'TRUE' }",
		'VERSION : 0.1',
		'',
		'BEGIN',
		'\t"Main_DB"();',
		'END_ORGANIZATION_BLOCK',
		''
	);
	// the interrupt and event OBs read the program's variables through its instance DB
	const obDialect: Dialect = {
		...md,
		name: (n) => (mainLocals.has(up(n)) ? `"Main_DB".${n}` : md.name(n)),
		member: (o, m) => (mainLocals.has(up(o)) ? `"Main_DB".${o}.${m}` : md.member(o, m)),
		call: (n) => (mainLocals.has(up(n)) ? `"Main_DB".${n}` : md.call(n))
	};
	const OB_NAMES: Record<ErrorOb, string> = {
		OB100: 'Startup',
		OB121: 'Programming_error',
		OB80: 'Time_error'
	};
	for (const o of u.main.obs ?? [])
		out.push(
			`ORGANIZATION_BLOCK "${OB_NAMES[o.ob]}"`,
			`TITLE = '${EVENT_OBS[o.ob]}'`,
			`// Typ OB w TIA Portal: ${o.ob} (${EVENT_OBS[o.ob]}).`,
			"{ S7_Optimized_Access := 'TRUE' }",
			'VERSION : 0.1',
			'',
			'BEGIN',
			...stmts(o.body, obDialect, '\t'),
			'END_ORGANIZATION_BLOCK',
			''
		);
	if (u.main.cyclic) {
		const cd: Dialect = {
			...md,
			name: (n) => (mainLocals.has(up(n)) ? `"Main_DB".${n}` : md.name(n)),
			member: (o, m) => (mainLocals.has(up(o)) ? `"Main_DB".${o}.${m}` : md.member(o, m)),
			call: (n) => (mainLocals.has(up(n)) ? `"Main_DB".${n}` : md.call(n))
		};
		out.push(
			'ORGANIZATION_BLOCK "Cyclic_interrupt"',
			"TITLE = 'Przerwanie cykliczne'",
			`// We właściwościach OB ustaw: Cyclic interrupt (OB30), czas cyklu ${u.main.cyclic.intervalMs} ms.`,
			"{ S7_Optimized_Access := 'TRUE' }",
			'VERSION : 0.1',
			'',
			'BEGIN',
			...stmts(u.main.cyclic.body, cd, '\t'),
			'END_ORGANIZATION_BLOCK',
			''
		);
	}

	const tags = [
		'Name;Path;Data Type;Logical Address;Comment',
		...p.symbols.map(
			(s) =>
				`${s.name};Default tag table;${type(addressType(s.address))};%${formatAddressSafe(s.address)};${s.comment.replace(/;/g, ',')}`
		)
	].join('\n');
	return { scl: out.join('\n'), tags, errors: u.errors };
}

function formatAddressSafe(text: string): string {
	try {
		return formatAddress(parseAddress(text));
	} catch {
		return text;
	}
}

/* ================================================================ PLCopen XML */

const esc = (s: string) =>
	s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** IEC direct address: I0.0 → %IX0.0, IW4 → %IW4, MD100 → %MD100. */
export function iecAddress(text: string): string {
	try {
		const a = parseAddress(text);
		if (a.area === 'T' || a.area === 'C') return '';
		return a.size === 'X' ? `%${a.area}X${a.byte}.${a.bit}` : `%${a.area}${a.size}${a.byte}`;
	} catch {
		return '';
	}
}

export function exportPlcOpen(p: ExportInput, now = new Date()): { xml: string; errors: string[] } {
	const u = unit(p);
	const elementary = new Set(['BOOL', 'BYTE', 'INT', 'DINT', 'REAL', 'TIME']);
	const typeXml = (t: string, dims?: { low: number; high: number }) => {
		const base = elementary.has(up(t)) ? `<${up(t)}/>` : `<derived name="${esc(u.caseOf(t))}"/>`;
		return dims
			? `<array><dimension lower="${dims.low}" upper="${dims.high}"/><baseType>${base}</baseType></array>`
			: base;
	};
	const d: Dialect = {
		caseOf: u.caseOf,
		name: (n) => n,
		member: (o, m) => `${o}.${m}`,
		address: (text) => iecAddress(text) || text,
		fcall: (name, args) => `${name}(${args.join(', ')})`,
		call: (name) => name
	};
	const initXml = (v: VarDecl) =>
		v.initList
			? `<initialValue><arrayValue>${v.initList.map((x) => `<value><simpleValue value="${esc(expr(x, d))}"/></value>`).join('')}</arrayValue></initialValue>`
			: v.init
				? `<initialValue><simpleValue value="${esc(expr(v.init, d))}"/></initialValue>`
				: '';
	const vars = (tag: string, list: VarDecl[], attrs = '') =>
		list.length
			? [
					`          <${tag}${attrs}>`,
					...list.map(
						(v) =>
							`            <variable name="${esc(v.name)}"${v.at ? ` address="${iecAddress(v.at)}"` : ''}><type>${typeXml(v.type, v.dims)}</type>${initXml(v)}</variable>`
					),
					`          </${tag}>`
				]
			: [];
	const body = (list: Stmt[], dialect = d) => [
		'        <body>',
		'          <ST>',
		`            <xhtml xmlns="http://www.w3.org/1999/xhtml">${esc(stmts(list, dialect, '').join('\n'))}</xhtml>`,
		'          </ST>',
		'        </body>'
	];
	const out: string[] = [
		'<?xml version="1.0" encoding="utf-8"?>',
		'<project xmlns="http://www.plcopen.org/xml/tc6_0200">',
		`  <fileHeader companyName="PLC Sim" productName="PLC Sim" productVersion="1.0" creationDateTime="${now.toISOString().slice(0, 19)}"/>`,
		`  <contentHeader name="${esc(p.name || 'PLC Sim project')}">`,
		'    <coordinateInfo><fbd><scaling x="1" y="1"/></fbd><ld><scaling x="1" y="1"/></ld><sfc><scaling x="1" y="1"/></sfc></coordinateInfo>',
		'  </contentHeader>',
		'  <types>',
		'    <dataTypes>'
	];
	for (const t of u.types) {
		out.push(`      <dataType name="${esc(t.name)}"><baseType><struct>`);
		for (const f of t.fields)
			out.push(
				`        <variable name="${esc(f.name)}"><type>${typeXml(f.type, f.dims)}</type>${initXml(f)}</variable>`
			);
		out.push('      </struct></baseType></dataType>');
	}
	out.push('    </dataTypes>', '    <pous>');
	for (const pou of u.pous) {
		const kind = pou.kind === 'fb' ? 'functionBlock' : 'function';
		out.push(`      <pou name="${esc(pou.name)}" pouType="${kind}">`, '        <interface>');
		if (pou.kind === 'function')
			out.push(`          <returnType>${typeXml(pou.returnType ?? 'INT')}</returnType>`);
		out.push(
			...vars('inputVars', pou.inputs),
			...vars('outputVars', pou.outputs),
			...vars(pou.kind === 'fb' ? 'localVars' : 'tempVars', pou.locals)
		);
		out.push('        </interface>', ...body(pou.body), '      </pou>');
	}
	out.push(
		'      <pou name="PLC_PRG" pouType="program">',
		'        <interface>',
		...vars(
			'localVars',
			u.main.vars.filter((v) => v.retain),
			' retain="true"'
		),
		...vars(
			'localVars',
			u.main.vars.filter((v) => !v.retain)
		),
		'        </interface>',
		...body(u.main.body),
		'      </pou>'
	);
	const mainNames = new Set(u.main.vars.map((v) => up(v.name)));
	// other programs reach the main program's variables as PLC_PRG.x
	const cd: Dialect = {
		...d,
		name: (n) => (mainNames.has(up(n)) ? `PLC_PRG.${n}` : n),
		member: (o, m) => (mainNames.has(up(o)) ? `PLC_PRG.${o}.${m}` : `${o}.${m}`),
		call: (n) => (mainNames.has(up(n)) ? `PLC_PRG.${n}` : n)
	};
	// CODESYS calls these from system events (Task configuration → System events)
	for (const o of u.main.obs ?? [])
		out.push(
			`      <pou name="${o.ob}_PRG" pouType="program">`,
			`        <documentation><xhtml xmlns="http://www.w3.org/1999/xhtml">${esc(EVENT_OBS[o.ob])} — w CODESYS przypisz do zdarzenia systemowego</xhtml></documentation>`,
			'        <interface/>',
			...body(o.body, cd),
			'      </pou>'
		);
	if (u.main.cyclic) {
		out.push(
			'      <pou name="CYCLIC_PRG" pouType="program">',
			'        <interface/>',
			...body(u.main.cyclic.body, cd),
			'      </pou>'
		);
	}
	out.push(
		'    </pous>',
		'  </types>',
		'  <instances>',
		'    <configurations>',
		'      <configuration name="Config">',
		'        <resource name="Resource">'
	);
	out.push(
		'          <task name="MainTask" interval="T#10ms" priority="1"><pouInstance name="PLC_PRG_inst" typeName="PLC_PRG"/></task>'
	);
	if (u.main.cyclic)
		out.push(
			`          <task name="CyclicTask" interval="T#${u.main.cyclic.intervalMs}ms" priority="0"><pouInstance name="CYCLIC_PRG_inst" typeName="CYCLIC_PRG"/></task>`
		);
	out.push('          <globalVars>');
	for (const s of p.symbols) {
		const addr = iecAddress(s.address);
		if (!addr) continue;
		out.push(
			`            <variable name="${esc(s.name)}" address="${addr}"><type>${typeXml(addressType(s.address))}</type>${s.comment ? `<documentation><xhtml xmlns="http://www.w3.org/1999/xhtml">${esc(s.comment)}</xhtml></documentation>` : ''}</variable>`
		);
	}
	out.push(
		'          </globalVars>',
		'        </resource>',
		'      </configuration>',
		'    </configurations>',
		'  </instances>',
		'</project>',
		''
	);
	return { xml: out.join('\n'), errors: u.errors };
}
