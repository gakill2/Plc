/**
 * User program organisation units in Structured Text: FUNCTION_BLOCK, FUNCTION and STRUCT types.
 *
 * They are expanded before code generation, the way a simple PLC compiler with static memory can do
 * it (no recursion is allowed by IEC 61131-3 anyway):
 *
 * - every instance of a function block, and every struct variable, becomes a set of flat variables
 *   named `instance.member` (nested: `line.motor1.Running`), so each instance has its own memory;
 * - a call `m1(Start := a, Running => b);` copies the inputs, inlines the block's body with its
 *   names mapped to the instance, then copies the outputs;
 * - a FUNCTION call inside an expression is computed by statements placed before the statement
 *   that uses it, into a hidden variable that replaces the call;
 * - an ARRAY becomes one variable per element (`a[0]`, `a[1]` …). A constant index picks the
 *   element directly; a computed index is dispatched by a binary search over IF statements, so a
 *   read costs about log2(n) comparisons. An index outside the bounds is a programming error
 *   (ERR): the CPU calls OB121 if there is one — the read gives 0 / FALSE and the write is
 *   skipped — or goes to STOP, like an S7-1500.
 */
import type { Arg, Expr, Pou, Span, Stmt, StProgram, StructType, Target, VarDecl } from './ast.js';

type IndexExpr = Extract<Expr, { kind: 'index' }>;

/** More elements would make the generated code and the marker area too large. */
const MAX_ELEMENTS = 1000;

const BUILTIN_FB = new Set(['TON', 'TOF', 'TP', 'CTU', 'CTD', 'R_TRIG', 'F_TRIG']);

export class ExpandError extends Error {
	readonly span: Span;
	constructor(message: string, span: Span) {
		super(message);
		this.span = span;
	}
}

type Report = (message: string, span: Span) => void;

/** What a name means in one scope (the program, or the body of one POU). */
type Meaning =
	| { kind: 'plain'; flat: string; builtinFb: boolean }
	| { kind: 'struct'; flat: string; type: StructType }
	| { kind: 'fb'; flat: string; pou: Pou }
	| { kind: 'array'; flat: string; low: number; high: number; type: string }
	/** STRING[n]: `flat$len` (INT) and the characters `flat$1` … `flat$n` (BYTE, 0 after the end) */
	| { kind: 'string'; flat: string; n: number };

interface Scope {
	names: Map<string, Meaning>;
	/** the FUNCTION being expanded: its own name is the result variable */
	fn?: { name: string; flat: string };
}

const up = (s: string) => s.toUpperCase();
/** Only the source position — spreading a whole node would also copy its kind and name. */
const sp = (x: Span): Span => ({ from: x.from, to: x.to });

/** Character codes of a text for a STRING[n]: Latin-1 only, at most n characters. */
function stringCodes(text: string, n: number, at: Span): number[] {
	if (text.length > n)
		throw new ExpandError(`'${text}' has ${text.length} characters — the STRING holds ${n}`, at);
	return [...text].map((c) => {
		const code = c.charCodeAt(0);
		if (code > 255)
			throw new ExpandError(`"${c}" cannot be stored in a STRING (Latin-1 characters only)`, at);
		return code;
	});
}

export function expandPous(program: StProgram, report: Report): StProgram {
	const types = new Map((program.types ?? []).map((t) => [up(t.name), t]));
	const pous = new Map((program.pous ?? []).map((p) => [up(p.name), p]));
	const vars: VarDecl[] = [];
	let hidden = 0;

	for (const p of program.pous ?? []) {
		if (types.has(up(p.name)) || BUILTIN_FB.has(up(p.name)))
			report(`"${p.name}" is already a type name`, p);
	}

	/* ---------- declarations: flatten structs and FB instances ---------- */

	function flatten(decl: VarDecl, prefix: string, scope: Scope, chain: string[], retain = false) {
		const flat = prefix + decl.name;
		const key = up(decl.name);
		if (scope.names.has(key)) throw new ExpandError(`"${decl.name}" is declared twice`, decl);
		const keep = retain || !!decl.retain;
		const t = up(decl.type);
		if (decl.dims) {
			const { low, high } = decl.dims;
			if (high - low + 1 > MAX_ELEMENTS)
				throw new ExpandError(`An array can have at most ${MAX_ELEMENTS} elements`, decl);
			const list = decl.initList ?? [];
			if (list.length > high - low + 1)
				throw new ExpandError(
					`${list.length} initial values for ${high - low + 1} elements`,
					list[high - low + 1]
				);
			for (let k = low; k <= high; k++) {
				const el: VarDecl = { ...decl, name: `${decl.name}[${k}]`, init: list[k - low] ?? null };
				delete el.dims;
				delete el.initList;
				flatten(el, prefix, scope, chain, keep);
			}
			scope.names.set(key, { kind: 'array', flat, low, high, type: decl.type });
			return;
		}
		if (t === 'STRING') {
			if (decl.at) throw new ExpandError('A STRING cannot have an AT address', decl);
			const n = decl.strLen ?? 16;
			if (decl.init && decl.init.kind !== 'string')
				throw new ExpandError("Initialise a STRING with text in quotes, e.g. := 'Krem'", decl.init);
			const text = decl.init?.kind === 'string' ? decl.init.value : '';
			const codes = stringCodes(text, n, decl.init ?? decl);
			const num = (value: number): Expr => ({ kind: 'number', value, real: false, ...sp(decl) });
			const part = (name: string, type: string, init: number): VarDecl => {
				const v: VarDecl = { ...decl, name, type, init: num(init) };
				delete v.strLen;
				if (keep) v.retain = true;
				return v;
			};
			// only a STRING with a start value is initialised: an empty one is all zeros anyway
			const inits = !!decl.init;
			const p = (name: string, type: string, init: number) => {
				const v = part(name, type, init);
				if (!inits) v.init = null;
				return v;
			};
			vars.push(p(`${flat}$len`, 'INT', text.length));
			for (let k = 1; k <= n; k++) vars.push(p(`${flat}$${k}`, 'BYTE', codes[k - 1] ?? 0));
			scope.names.set(key, { kind: 'string', flat, n });
			return;
		}
		const struct = types.get(t);
		const fb = pous.get(t);
		if (struct || (fb && fb.kind === 'fb')) {
			if (decl.at)
				throw new ExpandError(
					'A struct or function block instance cannot have an AT address',
					decl
				);
			if (decl.init)
				throw new ExpandError(
					'Initialise the fields one by one, not the whole variable',
					decl.init
				);
			if (chain.includes(t)) throw new ExpandError(`${decl.type} contains itself`, decl.typeSpan);
		}
		if (struct) {
			const inner: Scope = { names: new Map() };
			for (const f of struct.fields) flatten(f, `${flat}.`, inner, [...chain, t], keep);
			scope.names.set(key, { kind: 'struct', flat, type: struct });
			return;
		}
		if (fb && fb.kind === 'fb') {
			const inner: Scope = { names: new Map() };
			for (const v of [...fb.inputs, ...fb.outputs, ...fb.locals])
				flatten(v, `${flat}.`, inner, [...chain, t], keep);
			scope.names.set(key, { kind: 'fb', flat, pou: fb });
			return;
		}
		if (fb)
			throw new ExpandError(
				`${decl.type} is a FUNCTION — call it in an expression, do not declare it`,
				decl.typeSpan
			);
		const plain: VarDecl = { ...decl, name: flat };
		if (keep) plain.retain = true;
		vars.push(plain);
		scope.names.set(key, { kind: 'plain', flat, builtinFb: BUILTIN_FB.has(t) });
	}

	/** The scope of a POU instance: its own variables under `prefix`. */
	const pouScope = (pou: Pou, prefix: string): Scope => {
		const scope: Scope = { names: new Map() };
		const meaning = (type: string, flat: string): Meaning => {
			const t = up(type);
			const struct = types.get(t);
			const fb = pous.get(t);
			return struct
				? { kind: 'struct', flat, type: struct }
				: fb?.kind === 'fb'
					? { kind: 'fb', flat, pou: fb }
					: { kind: 'plain', flat, builtinFb: BUILTIN_FB.has(t) };
		};
		for (const v of [...pou.inputs, ...pou.outputs, ...pou.locals]) {
			const flat = `${prefix}${v.name}`;
			if (v.dims) {
				const { low, high } = v.dims;
				scope.names.set(up(v.name), { kind: 'array', flat, low, high, type: v.type });
				for (let k = low; k <= high; k++)
					scope.names.set(up(`${v.name}[${k}]`), meaning(v.type, `${flat}[${k}]`));
			} else scope.names.set(up(v.name), meaning(v.type, flat));
		}
		return scope;
	};

	/* ---------- functions: one shared set of variables each ---------- */

	const fnScopes = new Map<string, Scope>();
	for (const p of program.pous ?? []) {
		if (p.kind !== 'function') continue;
		const prefix = `${p.name}.`;
		const scope: Scope = { names: new Map(), fn: { name: up(p.name), flat: `${prefix}${p.name}` } };
		try {
			for (const v of [...p.inputs, ...p.locals]) flatten(v, prefix, scope, [up(p.name)]);
			vars.push({
				name: `${prefix}${p.name}`,
				type: p.returnType ?? 'INT',
				typeSpan: p,
				at: null,
				init: null,
				from: p.from,
				to: p.to
			});
		} catch (e) {
			if (!(e instanceof ExpandError)) throw e;
			report(e.message, e.span);
		}
		fnScopes.set(up(p.name), scope);
	}

	/* ---------- the program's own variables ---------- */

	const main: Scope = { names: new Map() };
	for (const v of program.vars) {
		try {
			flatten(v, '', main, []);
		} catch (e) {
			if (!(e instanceof ExpandError)) throw e;
			report(e.message, e.span);
		}
	}

	/* ---------- expressions ---------- */

	function memberName(
		scope: Scope,
		object: string,
		member: string,
		span: Span,
		writing: boolean
	): Expr {
		const m = scope.names.get(up(object));
		if (m?.kind === 'struct') {
			const field = m.type.fields.find((f) => up(f.name) === up(member));
			if (!field) throw new ExpandError(`${m.type.name} has no field ${member}`, span);
			const t = up(field.type);
			if (field.dims)
				throw new ExpandError(
					`${object}.${field.name} is an array — copy it element by element into a variable, or use an array of structures`,
					span
				);
			if (types.has(t) || pous.get(t)?.kind === 'fb')
				throw new ExpandError(
					`${object}.${field.name} is itself a structure — use it one level at a time`,
					span
				);
			if (t === 'STRING')
				throw new ExpandError(
					`${object}.${field.name} is a STRING — assign it, compare it (=, <>) or use LEN()`,
					span
				);
			return { kind: 'name', name: `${m.flat}.${field.name}`, ...sp(span) };
		}
		if (m?.kind === 'fb') {
			const all = [...m.pou.inputs, ...m.pou.outputs];
			const v = all.find((x) => up(x.name) === up(member));
			if (!v) {
				const local = m.pou.locals.some((x) => up(x.name) === up(member));
				throw new ExpandError(
					local
						? `${member} is internal to ${m.pou.name} — only inputs and outputs are visible outside`
						: `${m.pou.name} has no input or output ${member}`,
					span
				);
			}
			if (writing && m.pou.outputs.includes(v))
				throw new ExpandError(
					`${object}.${v.name} is an output of ${m.pou.name} — it is written by the block`,
					span
				);
			return { kind: 'name', name: `${m.flat}.${v.name}`, ...sp(span) };
		}
		if (m?.kind === 'plain') {
			if (writing) throw new ExpandError(`Outputs of ${object} cannot be written`, span);
			return { kind: 'member', object: m.flat, member, ...sp(span) };
		}
		return { kind: 'member', object, member, ...sp(span) };
	}

	function name(scope: Scope, n: string, span: Span): Expr {
		if (scope.fn && up(n) === scope.fn.name)
			return { kind: 'name', name: scope.fn.flat, ...sp(span) };
		const m = scope.names.get(up(n));
		if (!m) return { kind: 'name', name: n, ...sp(span) };
		if (m.kind === 'struct')
			throw new ExpandError(
				`${n} is a ${m.type.name} — use one of its fields, e.g. ${n}.${m.type.fields[0]?.name ?? 'Field'}`,
				span
			);
		if (m.kind === 'fb')
			throw new ExpandError(
				`${n} is a ${m.pou.name} — call it, then read its outputs like ${n}.${m.pou.outputs[0]?.name ?? 'Q'}`,
				span
			);
		if (m.kind === 'array')
			throw new ExpandError(
				`${n} is an ARRAY[${m.low}..${m.high}] — use one element, e.g. ${n}[${m.low}]`,
				span
			);
		if (m.kind === 'string')
			throw new ExpandError(
				`${n} is a STRING — assign it, compare it (=, <>) or use LEN(${n})`,
				span
			);
		return { kind: 'name', name: m.flat, ...sp(span) };
	}

	/* ---------- arrays ---------- */

	const constIndex = (e: Expr): number | null =>
		e.kind === 'number' && !e.real
			? e.value
			: e.kind === 'unary' && e.op === '-' && e.expr.kind === 'number' && !e.expr.real
				? -e.expr.value
				: null;

	function arrayOf(scope: Scope, n: string, span: Span) {
		const m = scope.names.get(up(n));
		if (m?.kind !== 'array')
			throw new ExpandError(
				m ? `${n} is not an ARRAY — it has no elements to index` : `Unknown array ${n}`,
				span
			);
		return m;
	}

	/** The element `a[k]` (or its member) for a known k. */
	const element = (scope: Scope, e: IndexExpr, k: number, writing: boolean): Expr => {
		const el = `${e.array}[${k}]`;
		return e.member ? memberName(scope, el, e.member, e, writing) : name(scope, el, e);
	};

	const hiddenVar = (base: string, type: string, at: Span): string => {
		const n = `${base}#${++hidden}`;
		vars.push({ name: n, type, typeSpan: sp(at), at: null, init: null, ...sp(at) });
		return n;
	};
	const ref = (n: string, at: Span): Extract<Expr, { kind: 'name' }> => ({
		kind: 'name',
		name: n,
		...sp(at)
	});
	const assign = (t: Target, value: Expr, at: Span): Stmt => ({
		kind: 'assign',
		target: t,
		value,
		...sp(at)
	});

	const OUTPUT_TYPES: Record<string, string> = {
		Q: 'BOOL',
		QU: 'BOOL',
		QD: 'BOOL',
		ET: 'TIME',
		CV: 'INT'
	};
	function typeOf(e: Expr): string {
		if (e.kind === 'name') return vars.find((v) => v.name === e.name)?.type ?? 'INT';
		if (e.kind === 'member') return OUTPUT_TYPES[up(e.member)] ?? 'INT';
		return 'INT';
	}
	const zero = (type: string, at: Span): Expr =>
		type === 'BOOL'
			? { kind: 'bool', value: false, ...sp(at) }
			: type === 'TIME'
				? { kind: 'time', value: 0, ...sp(at) }
				: { kind: 'number', value: 0, real: type === 'REAL', ...sp(at) };

	/**
	 * Runs `leaf(k)` for the element the index selects: IF i <= mid … a binary search, after a
	 * bounds check that runs `outside` instead.
	 */
	function dispatch(
		m: { low: number; high: number },
		index: Expr,
		leaf: (k: number) => Stmt[],
		outside: Stmt[],
		at: Span,
		pre: Stmt[]
	): Stmt {
		let i = index;
		if (index.kind !== 'name') {
			const tmp = hiddenVar('index', 'DINT', at);
			pre.push(assign(ref(tmp, at), index, at));
			i = ref(tmp, at);
		}
		const num = (value: number): Expr => ({ kind: 'number', value, real: false, ...sp(at) });
		const cmp = (op: '<=' | '>=', value: number): Expr => ({
			kind: 'binary',
			op,
			left: i,
			right: num(value),
			...sp(at)
		});
		const tree = (lo: number, hi: number): Stmt[] => {
			if (lo === hi) return leaf(lo);
			const mid = Math.floor((lo + hi) / 2);
			return [
				{
					kind: 'if',
					branches: [{ cond: cmp('<=', mid), body: tree(lo, mid) }],
					otherwise: tree(mid + 1, hi),
					...sp(at)
				}
			];
		};
		return {
			kind: 'if',
			branches: [
				{
					cond: {
						kind: 'binary',
						op: 'AND',
						left: cmp('>=', m.low),
						right: cmp('<=', m.high),
						...sp(at)
					},
					body: tree(m.low, m.high)
				}
			],
			otherwise: outside.length ? outside : null,
			...sp(at)
		};
	}

	function readElement(e: IndexExpr, scope: Scope, pre: Stmt[], chain: string[]): Expr {
		const m = arrayOf(scope, e.array, e);
		const index = expr(e.index, scope, pre, chain);
		const k = constIndex(index);
		if (k !== null) {
			if (k < m.low || k > m.high)
				throw new ExpandError(`Index ${k} is outside ${e.array}[${m.low}..${m.high}]`, e.index);
			return element(scope, e, k, false);
		}
		const type = typeOf(element(scope, e, m.low, false));
		const tmp = ref(hiddenVar(e.array, type, e), e);
		pre.push(
			dispatch(
				m,
				index,
				(k) => [assign(tmp, element(scope, e, k, false), e)],
				[assign(tmp, zero(type, e), e), outOfRange(e.array, m, e)],
				e,
				pre
			)
		);
		return tmp;
	}

	const outOfRange = (name: string, m: { low: number; high: number }, at: Span): Stmt => ({
		kind: 'fault',
		message: `${name}[${m.low}..${m.high}]`,
		...sp(at)
	});

	/** `t := value` for any target, including an array element with a computed index. */
	/* ---------- STRING ---------- */

	type Str = { flat: string; n: number } | { text: string };

	/** A STRING operand with a fixed place (constant index), or a literal, or null. */
	function stringOf(scope: Scope, e: Expr, pre: Stmt[], chain: string[]): Str | null {
		if (e.kind === 'string') return { text: e.value };
		if (e.kind === 'name') {
			const m = scope.names.get(up(e.name));
			return m?.kind === 'string' ? { flat: m.flat, n: m.n } : null;
		}
		if (e.kind === 'member') {
			const m = scope.names.get(up(e.object));
			if (m?.kind !== 'struct') return null;
			const f = m.type.fields.find((x) => up(x.name) === up(e.member));
			return f && up(f.type) === 'STRING' && !f.dims
				? { flat: `${m.flat}.${f.name}`, n: f.strLen ?? 16 }
				: null;
		}
		if (e.kind === 'index') {
			if (!isStringIndex(scope, e)) return null;
			const k = constIndex(expr(e.index, scope, pre, chain));
			if (k === null)
				throw new ExpandError(
					'A STRING with a computed index can only be copied — copy the structure first (active := items[i]), then use active',
					e
				);
			const m = arrayOf(scope, e.array, e);
			if (k < m.low || k > m.high)
				throw new ExpandError(`Index ${k} is outside ${e.array}[${m.low}..${m.high}]`, e.index);
			const el: Expr = e.member
				? { kind: 'member', object: `${e.array}[${k}]`, member: e.member, ...sp(e) }
				: { kind: 'name', name: `${e.array}[${k}]`, ...sp(e) };
			return stringOf(scope, el, pre, chain);
		}
		return null;
	}

	/** `a[i]` of an ARRAY OF STRING, or `a[i].Name` of an array of structures with a STRING field */
	function isStringIndex(scope: Scope, e: IndexExpr): boolean {
		const m = scope.names.get(up(e.array));
		if (m?.kind !== 'array') return false;
		if (!e.member) return up(m.type) === 'STRING';
		const f = types.get(up(m.type))?.fields.find((x) => up(x.name) === up(e.member!));
		return !!f && up(f.type) === 'STRING' && !f.dims;
	}

	const num = (value: number, at: Span): Expr => ({
		kind: 'number',
		value,
		real: false,
		...sp(at)
	});
	const lenOf = (s: Str, at: Span): Expr =>
		'text' in s ? num(s.text.length, at) : ref(`${s.flat}$len`, at);
	const charOf = (s: Str, k: number, at: Span): Expr =>
		'text' in s
			? num(k <= s.text.length ? s.text.charCodeAt(k - 1) : 0, at)
			: k <= s.n
				? ref(`${s.flat}$${k}`, at)
				: num(0, at);

	/** `a = b` for strings: same length and the same characters (unused characters are 0). */
	function stringEquals(a: Str, b: Str, at: Span): Expr {
		const size = (s: Str) => ('text' in s ? s.text.length : s.n);
		const tooLong = (s: Str, o: Str) => 'text' in s && !('text' in o) && s.text.length > o.n;
		if (tooLong(a, b) || tooLong(b, a)) return { kind: 'bool', value: false, ...sp(at) };
		const parts: Expr[] = [
			{ kind: 'binary', op: '=', left: lenOf(a, at), right: lenOf(b, at), ...sp(at) }
		];
		for (let k = 1; k <= Math.max(size(a), size(b)); k++)
			parts.push({
				kind: 'binary',
				op: '=',
				left: charOf(a, k, at),
				right: charOf(b, k, at),
				...sp(at)
			});
		return parts.reduce((l, r) => ({ kind: 'binary', op: 'AND', left: l, right: r, ...sp(at) }));
	}

	/** `t := s`: the length (cut to the size of t) and every character, the rest set to 0. */
	function stringCopy(t: { flat: string; n: number }, s: Str, at: Span): Stmt[] {
		if ('text' in s) stringCodes(s.text, t.n, at);
		const len: Expr =
			'text' in s
				? num(s.text.length, at)
				: s.n > t.n
					? { kind: 'fcall', name: 'MIN', args: [lenOf(s, at), num(t.n, at)], ...sp(at) }
					: lenOf(s, at);
		const out = [assign(ref(`${t.flat}$len`, at), len, at)];
		for (let k = 1; k <= t.n; k++)
			out.push(assign(ref(`${t.flat}$${k}`, at), charOf(s, k, at), at));
		return out;
	}

	/** The structure type of a whole-struct operand (`r`, `recipes[i]`), or null. */
	function structOf(scope: Scope, e: Expr): StructType | null {
		if (e.kind === 'name') {
			const m = scope.names.get(up(e.name));
			return m?.kind === 'struct' ? m.type : null;
		}
		if (e.kind === 'index' && !e.member) {
			const m = scope.names.get(up(e.array));
			return m?.kind === 'array' ? (types.get(up(m.type)) ?? null) : null;
		}
		return null;
	}
	const fieldOf = (e: Expr, field: string): Expr =>
		e.kind === 'name'
			? { kind: 'member', object: e.name, member: field, ...sp(e) }
			: e.kind === 'index'
				? { ...e, member: field }
				: e;

	function assignTo(
		t: Target,
		value: Expr,
		scope: Scope,
		pre: Stmt[],
		chain: string[],
		at: Span
	): Stmt[] {
		if (t.kind !== 'index') return [assign(target(t, scope), value, at)];
		const m = arrayOf(scope, t.array, t);
		const index = expr(t.index, scope, pre, chain);
		const k = constIndex(index);
		if (k !== null) {
			if (k < m.low || k > m.high)
				throw new ExpandError(`Index ${k} is outside ${t.array}[${m.low}..${m.high}]`, t.index);
			return [assign(element(scope, t, k, true) as Target, value, at)];
		}
		let v = value;
		if (!['name', 'number', 'bool', 'time', 'address'].includes(value.kind)) {
			const tmp = ref(hiddenVar(t.array, typeOf(element(scope, t, m.low, true)), at), at);
			pre.push(assign(tmp, value, at));
			v = tmp;
		}
		const d = dispatch(
			m,
			index,
			(k) => [assign(element(scope, t, k, true) as Target, v, at)],
			[outOfRange(t.array, m, t)],
			at,
			pre
		);
		return [d];
	}

	/** Rewrites names; user FUNCTION calls are expanded into `pre` and replaced by a hidden variable. */
	function expr(e: Expr, scope: Scope, pre: Stmt[], chain: string[]): Expr {
		switch (e.kind) {
			case 'name':
				return name(scope, e.name, e);
			case 'member':
				return memberName(scope, e.object, e.member, e, false);
			case 'index':
				return readElement(e, scope, pre, chain);
			case 'unary':
				return { ...e, expr: expr(e.expr, scope, pre, chain) };
			case 'binary': {
				const ls = stringOf(scope, e.left, pre, chain);
				const rs = stringOf(scope, e.right, pre, chain);
				if (ls || rs) {
					if (!ls || !rs || (e.op !== '=' && e.op !== '<>'))
						throw new ExpandError(
							'A STRING can only be compared with another STRING, with = or <>',
							e
						);
					const eq = stringEquals(ls, rs, e);
					return e.op === '=' ? eq : { kind: 'unary', op: 'NOT', expr: eq, ...sp(e) };
				}
				return {
					...e,
					left: expr(e.left, scope, pre, chain),
					right: expr(e.right, scope, pre, chain)
				};
			}
			case 'string':
				throw new ExpandError(
					'A text in quotes can only be assigned to a STRING or compared with one',
					e
				);
			case 'fcall': {
				if (up(e.name) === 'LEN') {
					const s = e.args.length === 1 ? stringOf(scope, e.args[0], pre, chain) : null;
					if (!s) throw new ExpandError('LEN takes one STRING, e.g. LEN(name)', e);
					return lenOf(s, e);
				}
				const args = e.args.map((a) => expr(a, scope, pre, chain));
				const fn = pous.get(up(e.name));
				if (!fn) return { ...e, args };
				if (fn.kind === 'fb')
					throw new ExpandError(
						`${fn.name} is a FUNCTION_BLOCK — declare an instance and call it as a statement`,
						e
					);
				if (chain.includes(up(fn.name)))
					throw new ExpandError(`${fn.name} calls itself — recursion is not allowed`, e);
				if (args.length !== fn.inputs.length)
					throw new ExpandError(
						`${fn.name} takes ${fn.inputs.length} argument(s), not ${args.length}`,
						e
					);
				const fs = fnScopes.get(up(fn.name))!;
				fn.inputs.forEach((input, i) =>
					pre.push({
						kind: 'assign',
						target: { kind: 'name', name: `${fn.name}.${input.name}`, ...sp(e) },
						value: args[i],
						...sp(e)
					})
				);
				pre.push(...inlineBody(fn, fs, [...chain, up(fn.name)], e));
				const tmp = `${fn.name}#${++hidden}`;
				vars.push({
					name: tmp,
					type: fn.returnType ?? 'INT',
					typeSpan: e,
					at: null,
					init: null,
					...sp(e)
				});
				pre.push({
					kind: 'assign',
					target: { kind: 'name', name: tmp, ...sp(e) },
					value: { kind: 'name', name: `${fn.name}.${fn.name}`, ...sp(e) },
					...sp(e)
				});
				return { kind: 'name', name: tmp, ...sp(e) };
			}
			default:
				return e;
		}
	}

	function target(t: Target, scope: Scope): Target {
		if (t.kind === 'index')
			throw new ExpandError('An array element cannot be used here — use a plain variable', t);
		if (t.kind === 'member') return memberName(scope, t.object, t.member, t, true) as Target;
		if (t.kind === 'name') return name(scope, t.name, t) as Target;
		return t;
	}

	/* ---------- statements ---------- */

	const hasReturn = (body: Stmt[]): boolean =>
		body.some((s) =>
			s.kind === 'return'
				? true
				: s.kind === 'if'
					? s.branches.some((b) => hasReturn(b.body)) || hasReturn(s.otherwise ?? [])
					: s.kind === 'case'
						? s.cases.some((c) => hasReturn(c.body)) || hasReturn(s.otherwise ?? [])
						: false
		);
	const loopReturn = (body: Stmt[]): Stmt | null => {
		for (const s of body) {
			if ((s.kind === 'for' || s.kind === 'while' || s.kind === 'repeat') && hasReturnDeep(s.body))
				return s;
			if (s.kind === 'if')
				for (const b of [...s.branches.map((x) => x.body), s.otherwise ?? []]) {
					const r = loopReturn(b);
					if (r) return r;
				}
			if (s.kind === 'case')
				for (const b of [...s.cases.map((x) => x.body), s.otherwise ?? []]) {
					const r = loopReturn(b);
					if (r) return r;
				}
		}
		return null;
	};
	const hasReturnDeep = (body: Stmt[]): boolean =>
		body.some(
			(s) =>
				s.kind === 'return' ||
				(s.kind === 'if' &&
					(s.branches.some((b) => hasReturnDeep(b.body)) || hasReturnDeep(s.otherwise ?? []))) ||
				(s.kind === 'case' &&
					(s.cases.some((c) => hasReturnDeep(c.body)) || hasReturnDeep(s.otherwise ?? []))) ||
				((s.kind === 'for' || s.kind === 'while' || s.kind === 'repeat') && hasReturnDeep(s.body))
		);
	const returnToExit = (body: Stmt[]): Stmt[] =>
		body.map((s) =>
			s.kind === 'return'
				? { ...s, kind: 'exit' }
				: s.kind === 'if'
					? {
							...s,
							branches: s.branches.map((b) => ({ ...b, body: returnToExit(b.body) })),
							otherwise: s.otherwise && returnToExit(s.otherwise)
						}
					: s.kind === 'case'
						? {
								...s,
								cases: s.cases.map((c) => ({ ...c, body: returnToExit(c.body) })),
								otherwise: s.otherwise && returnToExit(s.otherwise)
							}
						: s
		);

	/** The body of a POU for one instance (or for the function's shared variables). */
	function inlineBody(pou: Pou, scope: Scope, chain: string[], at: Span): Stmt[] {
		const looped = loopReturn(pou.body);
		if (looped)
			throw new ExpandError(
				`RETURN inside a loop of ${pou.name} is not supported — use EXIT and a flag`,
				looped
			);
		let body = block(pou.body, scope, chain);
		if (hasReturn(body)) {
			// RETURN leaves the block: run the body once in a loop and EXIT it
			body = [
				{
					kind: 'repeat',
					body: returnToExit(body),
					until: { kind: 'bool', value: true, ...sp(at) },
					...sp(at)
				}
			];
		}
		return body;
	}

	function call(s: Extract<Stmt, { kind: 'call' }>, scope: Scope, chain: string[]): Stmt[] {
		const pre: Stmt[] = [];
		if (s.index) {
			// motors[i](…): the call of the selected instance
			const arr = arrayOf(scope, s.name, s.nameSpan);
			const index = expr(s.index, scope, pre, chain);
			const one = (k: number): Stmt[] => {
				const c: Extract<Stmt, { kind: 'call' }> = { ...s, name: `${s.name}[${k}]` };
				delete c.index;
				return call(c, scope, chain);
			};
			const k = constIndex(index);
			if (k !== null) {
				if (k < arr.low || k > arr.high)
					throw new ExpandError(
						`Index ${k} is outside ${s.name}[${arr.low}..${arr.high}]`,
						s.index
					);
				return [...pre, ...one(k)];
			}
			const d = dispatch(arr, index, one, [outOfRange(s.name, arr, s)], s, pre);
			return [...pre, d];
		}
		const m = scope.names.get(up(s.name));
		const inputs = s.args.filter((a) => !a.output);
		const outputs = s.args.filter((a) => a.output);
		const post: Stmt[] = [];
		const copyOut = (a: Arg, from: Expr): Stmt[] =>
			assignTo(a.value as Target, from, scope, post, chain, a);

		if (m?.kind === 'fb') {
			const { pou, flat } = m;
			if (chain.includes(up(pou.name)))
				throw new ExpandError(`${pou.name} calls itself — recursion is not allowed`, s);
			const out: Stmt[] = [];
			for (const a of inputs) {
				const v = pou.inputs.find((x) => up(x.name) === up(a.name));
				if (!v)
					throw new ExpandError(
						pou.outputs.some((x) => up(x.name) === up(a.name))
							? `${a.name} is an output of ${pou.name} — read it with ${a.name} => variable`
							: `${pou.name} has no input ${a.name}`,
						a
					);
				out.push({
					kind: 'assign',
					target: { kind: 'name', name: `${flat}.${v.name}`, ...sp(a) },
					value: expr(a.value, scope, pre, chain),
					...sp(a)
				});
			}
			out.push(...inlineBody(pou, pouScope(pou, `${flat}.`), [...chain, up(pou.name)], s));
			for (const a of outputs) {
				const v = pou.outputs.find((x) => up(x.name) === up(a.name));
				if (!v) throw new ExpandError(`${pou.name} has no output ${a.name}`, a);
				const copy = copyOut(a, { kind: 'name', name: `${flat}.${v.name}`, ...sp(a) });
				out.push(...post.splice(0), ...copy);
			}
			return [...pre, ...out];
		}

		if (m?.kind === 'struct')
			throw new ExpandError(`${s.name} is a structure, not a function block`, s.nameSpan);
		if (m?.kind === 'array')
			throw new ExpandError(
				`${s.name} is an array — call one element, e.g. ${s.name}[i](…)`,
				s.nameSpan
			);
		const flatName = m?.kind === 'plain' ? m.flat : s.name;
		const builtin: Stmt = {
			...s,
			name: flatName,
			args: inputs.map((a) => ({ ...a, value: expr(a.value, scope, pre, chain) }))
		};
		const after = outputs.flatMap((a) => {
			const copy = copyOut(a, { kind: 'member', object: flatName, member: a.name, ...sp(a) });
			return [...post.splice(0), ...copy];
		});
		return [...pre, builtin, ...after];
	}

	function block(body: Stmt[], scope: Scope, chain: string[]): Stmt[] {
		const out: Stmt[] = [];
		for (const s of body) {
			try {
				out.push(...stmt(s, scope, chain));
			} catch (e) {
				if (!(e instanceof ExpandError)) throw e;
				report(e.message, e.span);
			}
		}
		return out;
	}

	function stmt(s: Stmt, scope: Scope, chain: string[]): Stmt[] {
		const pre: Stmt[] = [];
		const x = (e: Expr) => expr(e, scope, pre, chain);
		const noCalls = (e: Expr, where: string) => {
			const before = pre.length;
			const r = x(e);
			if (pre.length !== before)
				throw new ExpandError(
					`A user FUNCTION in a ${where} condition is evaluated only once — assign it to a variable inside the loop`,
					e
				);
			return r;
		};
		switch (s.kind) {
			case 'assign': {
				const ts = stringOf(scope, s.target, pre, chain);
				if (ts) {
					if ('text' in ts) throw new ExpandError('Cannot assign to a text', s.target);
					// copy from an element with a computed index: one copy per element
					if (s.value.kind === 'index' && isStringIndex(scope, s.value)) {
						const v = s.value;
						const index = x(v.index);
						if (constIndex(index) === null) {
							const m = arrayOf(scope, v.array, v);
							return [
								...pre,
								dispatch(
									m,
									index,
									(k) =>
										stringCopy(ts, stringOf(scope, { ...v, index: num(k, v) }, pre, chain)!, s),
									[outOfRange(v.array, m, v)],
									s,
									pre
								)
							];
						}
					}
					const vs = stringOf(scope, s.value, pre, chain);
					if (!vs)
						throw new ExpandError(
							"Assign a text in quotes or another STRING, e.g. := 'Krem'",
							s.value
						);
					return [...pre, ...stringCopy(ts, vs, s)];
				}
				// a whole structure: copied field by field (recipe := recipes[n])
				const tt = structOf(scope, s.target);
				if (tt) {
					const vt = structOf(scope, s.value);
					if (!vt || vt !== tt)
						throw new ExpandError(
							`Only a ${tt.name} can be assigned to a ${tt.name} as a whole`,
							s.value
						);
					return tt.fields.flatMap((f) => {
						if (f.dims || types.has(up(f.type)) || pous.get(up(f.type))?.kind === 'fb')
							throw new ExpandError(
								`${tt.name}.${f.name} is an array or a structure — copy it on its own`,
								s
							);
						return stmt(
							{
								kind: 'assign',
								target: fieldOf(s.target, f.name) as Target,
								value: fieldOf(s.value, f.name),
								...sp(s)
							},
							scope,
							chain
						);
					});
				}
				const value = x(s.value);
				const out = assignTo(s.target, value, scope, pre, chain, s);
				return [...pre, ...out];
			}
			case 'call':
				return call(s, scope, chain);
			case 'if': {
				const branches = s.branches.map((b) => ({
					cond: x(b.cond),
					body: block(b.body, scope, chain)
				}));
				return [
					...pre,
					{ ...s, branches, otherwise: s.otherwise && block(s.otherwise, scope, chain) }
				];
			}
			case 'case': {
				const selector = x(s.selector);
				return [
					...pre,
					{
						...s,
						selector,
						cases: s.cases.map((c) => ({ ...c, body: block(c.body, scope, chain) })),
						otherwise: s.otherwise && block(s.otherwise, scope, chain)
					}
				];
			}
			case 'for': {
				const start = x(s.start);
				const end = x(s.end);
				const step = s.step && x(s.step);
				return [
					...pre,
					{
						...s,
						variable: target(s.variable, scope),
						start,
						end,
						step,
						body: block(s.body, scope, chain)
					}
				];
			}
			case 'while':
				return [{ ...s, cond: noCalls(s.cond, 'WHILE'), body: block(s.body, scope, chain) }];
			case 'repeat':
				return [{ ...s, body: block(s.body, scope, chain), until: noCalls(s.until, 'REPEAT') }];
			default:
				return [s];
		}
	}

	const body = block(program.body, main, []);
	const out: StProgram = { vars, body };
	if (program.cyclic)
		out.cyclic = { ...program.cyclic, body: block(program.cyclic.body, main, []) };
	if (program.obs) out.obs = program.obs.map((o) => ({ ...o, body: block(o.body, main, []) }));
	return out;
}
