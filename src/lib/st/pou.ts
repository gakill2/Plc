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
	| { kind: 'array'; flat: string; low: number; high: number; type: string };

interface Scope {
	names: Map<string, Meaning>;
	/** the FUNCTION being expanded: its own name is the result variable */
	fn?: { name: string; flat: string };
}

const up = (s: string) => s.toUpperCase();
/** Only the source position — spreading a whole node would also copy its kind and name. */
const sp = (x: Span): Span => ({ from: x.from, to: x.to });

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
		message: `indeks poza zakresem tablicy ${name}[${m.low}..${m.high}]`,
		...sp(at)
	});

	/** `t := value` for any target, including an array element with a computed index. */
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
			case 'binary':
				return {
					...e,
					left: expr(e.left, scope, pre, chain),
					right: expr(e.right, scope, pre, chain)
				};
			case 'fcall': {
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
