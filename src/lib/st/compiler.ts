import {
	DEFAULT_MEMORY_CONFIG,
	formatAddress,
	parseAddress,
	validateProgram,
	type Address,
	type AddrOperand,
	type CmpOp,
	type Instr,
	type MathFn,
	type MemoryConfig,
	type NumType,
	type Operand,
	mathOp
} from '#lib/engine/index.js';
import type { SymbolMap } from '#lib/symbols/symbols.js';
import type { BinaryOp, Expr, Span, Stmt, Target, VarDecl } from './ast.js';
import { parse } from './parser.js';
import { expandPous } from './pou.js';

/*
 * Structured Text → IR.
 *
 * Booleans are evaluated on the VM's logic stack (LD / AND / OR …). Numeric expressions are
 * evaluated memory-to-memory with MATH, using scratch double words as temporaries. Control flow
 * becomes conditional jumps. Declared variables are placed in the marker area automatically:
 *
 *   M256 … M991   VAR variables (BOOL bits first, then words / double words)
 *   MD992 … MD1020 expression temporaries
 *   T32 …, C32 …  timer / counter instances
 */

export interface StDiagnostic extends Span {
	message: string;
	/** the problem is in the library (prelude), not in this source */
	library?: boolean;
}

/** A value of a declared variable, for the live variable view. */
export interface StVariable {
	name: string;
	type: string;
	reads: { label: string; address: string; kind: 'bool' | 'num'; numType?: NumType }[];
}

export interface StCompileResult {
	program: Instr[];
	diagnostics: StDiagnostic[];
	variables: StVariable[];
	/** Instruction index → 1-based source line. */
	lines: (number | null)[];
	/** How the CPU runs the program: retentive memory and the cyclic interrupt. */
	load?: LoadOptions;
}

type ValType = 'BOOL' | 'BYTE' | 'INT' | 'DINT' | 'REAL' | 'TIME';
type FbType = 'TON' | 'TOF' | 'TP' | 'CTU' | 'CTD' | 'R_TRIG' | 'F_TRIG';

const VALUE_TYPES: ValType[] = ['BOOL', 'BYTE', 'INT', 'DINT', 'REAL', 'TIME'];
const FB_TYPES: FbType[] = ['TON', 'TOF', 'TP', 'CTU', 'CTD', 'R_TRIG', 'F_TRIG'];
const FB_PARAMS: Record<FbType, { name: string; bool: boolean; required: boolean }[]> = {
	TON: [
		{ name: 'IN', bool: true, required: true },
		{ name: 'PT', bool: false, required: true }
	],
	TOF: [
		{ name: 'IN', bool: true, required: true },
		{ name: 'PT', bool: false, required: true }
	],
	TP: [
		{ name: 'IN', bool: true, required: true },
		{ name: 'PT', bool: false, required: true }
	],
	CTU: [
		{ name: 'CU', bool: true, required: true },
		{ name: 'R', bool: true, required: false },
		{ name: 'PV', bool: false, required: true }
	],
	CTD: [
		{ name: 'CD', bool: true, required: true },
		{ name: 'LD', bool: true, required: false },
		{ name: 'PV', bool: false, required: true }
	],
	R_TRIG: [{ name: 'CLK', bool: true, required: true }],
	F_TRIG: [{ name: 'CLK', bool: true, required: true }]
};

export const VAR_AREA = { start: 256, end: 992 };
const TEMP_START = 992;
const TEMP_COUNT = 8;
const FIRST_INSTANCE = 32;

interface Value {
	type: ValType;
	addr: Address;
	numType?: NumType;
}

type Sym =
	{ kind: 'value'; value: Value } | { kind: 'fb'; type: FbType; index: number; q?: Address };

class Label {
	pc: number | null = null;
	readonly refs: number[] = [];
}

class CompileError extends Error {
	readonly span: Span;
	constructor(message: string, span: Span) {
		super(message);
		this.span = span;
	}
}

const memAddress = (area: 'M', size: 'X' | 'B' | 'W' | 'D', byte: number, bit = 0): Address => ({
	area,
	size,
	byte,
	bit
});

function typeOfAddress(a: Address): Value {
	if (a.area === 'T' || a.area === 'C' || a.size === 'X') return { type: 'BOOL', addr: a };
	if (a.size === 'B') return { type: 'BYTE', addr: a };
	if (a.size === 'W') return { type: 'INT', addr: a };
	return { type: 'DINT', addr: a };
}

const isNumeric = (t: ValType) => t !== 'BOOL';

/** Standard functions with a fixed number of positional arguments. */
const FUNCTIONS: Record<string, number> = {
	ABS: 1,
	MIN: 2,
	MAX: 2,
	LIMIT: 3,
	TRUNC: 1,
	SHL: 2,
	SHR: 2
};
const CONVERSION_RE = /^(BOOL|BYTE|INT|DINT|REAL|TIME)_TO_(BOOL|BYTE|INT|DINT|REAL|TIME)$/;
const describeExpr = (e: Expr) =>
	e.kind === 'name'
		? e.name
		: e.kind === 'address'
			? e.text
			: e.kind === 'member'
				? `${e.object}.${e.member}`
				: 'this value';

export function compileSt(
	src: string,
	options: {
		symbols?: SymbolMap;
		config?: MemoryConfig;
		/** Library source compiled before the program (function blocks, types); errors in it are reported apart. */
		prelude?: string;
	} = {}
): StCompileResult {
	const pre = options.prelude ? `${options.prelude}\n` : '';
	const preLines = pre ? pre.split('\n').length - 1 : 0;
	const fullSrc = pre + src;
	const config = options.config ?? DEFAULT_MEMORY_CONFIG;
	const symbols = options.symbols ?? new Map<string, string>();
	const { program: parsed, errors } = parse(fullSrc);

	const diagnostics: StDiagnostic[] = [];
	/** Positions are made relative to the user's source; problems in the library are marked. */
	const report = (message: string, span: Span) =>
		diagnostics.push(
			span.from >= pre.length || !pre
				? { message, from: span.from - pre.length, to: span.to - pre.length }
				: { message: `Library: ${message}`, from: 0, to: 0, library: true }
		);
	for (const e of errors) report(e.message, e);
	// user FUNCTION_BLOCKs, FUNCTIONs and STRUCTs become flat variables and inlined code
	const ast = expandPous(parsed, report);

	const lineStarts = [0];
	for (let i = 0; i < fullSrc.length; i++) if (fullSrc[i] === '\n') lineStarts.push(i + 1);
	const lineOf = (offset: number) => {
		let lo = 0;
		let hi = lineStarts.length - 1;
		while (lo < hi) {
			const mid = (lo + hi + 1) >> 1;
			if (lineStarts[mid] <= offset) lo = mid;
			else hi = mid - 1;
		}
		return lo + 1;
	};

	const program: Instr[] = [];
	const lines: (number | null)[] = [];
	let line: number | null = null;
	const emit = (ins: Instr) => {
		program.push(ins);
		lines.push(line);
	};
	const jump = (op: 'JMP' | 'JMPC' | 'JMPCN', label: Label) => {
		label.refs.push(program.length);
		emit({ op, target: -1 });
	};
	const place = (label: Label) => (label.pc = program.length);
	const labels: Label[] = [];
	const newLabel = () => {
		const l = new Label();
		labels.push(l);
		return l;
	};

	/* ---------- variable allocation ---------- */

	const vars = new Map<string, Sym>();
	const variables: StVariable[] = [];
	let bitCursor = VAR_AREA.start * 8;
	let byteCursor = VAR_AREA.start;
	let timers = FIRST_INSTANCE;
	let counters = FIRST_INSTANCE;

	const isBit = (v: VarDecl) =>
		!v.at && (v.type === 'BOOL' || v.type === 'R_TRIG' || v.type === 'F_TRIG');
	// VAR RETAIN first, in a block of its own that a restart keeps
	const retained = ast.vars.filter((v) => v.retain && !v.at);
	const fresh = ast.vars.filter((v) => !retained.includes(v));
	const startBlock = (bits: number) => {
		byteCursor = Math.ceil(byteCursor / 4) * 4;
		bitCursor = byteCursor * 8;
		byteCursor += Math.ceil((bits + 1) / 8); // +1: the hidden "initialised" flag
	};

	const allocBit = (span: Span): Address => {
		const byte = Math.floor(bitCursor / 8);
		if (byte >= VAR_AREA.end)
			throw new CompileError('Too many variables (marker area M256–M991 is full)', span);
		return memAddress('M', 'X', byte, bitCursor++ % 8);
	};
	const allocBytes = (size: 'B' | 'W' | 'D', span: Span): Address => {
		const width = size === 'D' ? 4 : size === 'W' ? 2 : 1;
		byteCursor = Math.ceil(byteCursor / width) * width;
		if (byteCursor + width > VAR_AREA.end) {
			throw new CompileError('Too many variables (marker area M256–M991 is full)', span);
		}
		const a = memAddress('M', size, byteCursor);
		byteCursor += width;
		return a;
	};
	const allocValue = (type: ValType, span: Span): Value => {
		switch (type) {
			case 'BOOL':
				return { type, addr: allocBit(span) };
			case 'BYTE':
				return { type, addr: allocBytes('B', span) };
			case 'INT':
				return { type, addr: allocBytes('W', span) };
			case 'REAL':
				return { type, addr: allocBytes('D', span), numType: 'REAL' };
			default:
				return { type, addr: allocBytes('D', span) };
		}
	};

	let retainInitFlag: Address | null = null;
	let retainEnd = VAR_AREA.start;
	if (retained.length) {
		startBlock(retained.filter(isBit).length);
		retainInitFlag = allocBit({ from: 0, to: 0 });
		declareAll(retained);
		retainEnd = Math.ceil(byteCursor / 4) * 4;
		byteCursor = retainEnd;
	}
	startBlock(fresh.filter(isBit).length);
	const initFlag = allocBit({ from: 0, to: 0 });

	function declare(v: VarDecl) {
		if (vars.has(v.name.toUpperCase())) throw new CompileError(`"${v.name}" is declared twice`, v);
		const type = v.type as ValType & FbType;

		if (FB_TYPES.includes(type)) {
			if (v.at) throw new CompileError('Function block instances cannot have an AT address', v);
			if (type === 'R_TRIG' || type === 'F_TRIG') {
				const q = allocBit(v);
				vars.set(v.name.toUpperCase(), { kind: 'fb', type, index: 0, q });
				variables.push({
					name: v.name,
					type,
					reads: [{ label: 'Q', address: formatAddress(q), kind: 'bool' }]
				});
			} else if (type === 'CTU' || type === 'CTD') {
				if (counters >= config.counters)
					throw new CompileError('No counters left for this instance', v);
				const index = counters++;
				vars.set(v.name.toUpperCase(), { kind: 'fb', type, index });
				variables.push({
					name: v.name,
					type,
					reads: [
						{ label: 'Q', address: `C${index}`, kind: 'bool' },
						{ label: 'CV', address: `C${index}`, kind: 'num' }
					]
				});
			} else {
				if (timers >= config.timers) throw new CompileError('No timers left for this instance', v);
				const index = timers++;
				vars.set(v.name.toUpperCase(), { kind: 'fb', type, index });
				variables.push({
					name: v.name,
					type,
					reads: [
						{ label: 'Q', address: `T${index}`, kind: 'bool' },
						{ label: 'ET', address: `T${index}`, kind: 'num' }
					]
				});
			}
			if (v.init) report('Function block instances cannot be initialised', v.init);
			return;
		}

		if (!VALUE_TYPES.includes(type)) {
			throw new CompileError(
				`Unknown type ${v.type} — use BOOL, INT, DINT, REAL, TIME, TON, CTU, R_TRIG …`,
				v.typeSpan
			);
		}

		let value: Value;
		if (v.at) {
			const a = parseAddress(v.at);
			const natural = typeOfAddress(a);
			const fits =
				(type === 'BOOL' && natural.type === 'BOOL' && a.area !== 'T' && a.area !== 'C') ||
				(type === 'BYTE' && natural.type === 'BYTE') ||
				(type === 'INT' && natural.type === 'INT') ||
				((type === 'DINT' || type === 'REAL' || type === 'TIME') && natural.type === 'DINT');
			if (!fits) throw new CompileError(`${v.at} cannot hold a ${type}`, v);
			value = { type, addr: a, numType: type === 'REAL' ? 'REAL' : undefined };
		} else {
			value = allocValue(type, v);
		}
		vars.set(v.name.toUpperCase(), { kind: 'value', value });
		variables.push({
			name: v.name,
			type,
			reads: [
				{
					label: '',
					address: formatAddress(value.addr),
					kind: type === 'BOOL' ? 'bool' : 'num',
					numType: value.numType
				}
			]
		});
	}

	declareAll(fresh);
	// the variable view lists them in declaration order
	const order = new Map(ast.vars.map((v, i) => [v.name.toUpperCase(), i]));
	variables.sort(
		(a, b) => (order.get(a.name.toUpperCase()) ?? 0) - (order.get(b.name.toUpperCase()) ?? 0)
	);

	function declareAll(list: VarDecl[]) {
		for (const v of list) {
			try {
				declare(v);
			} catch (e) {
				if (!(e instanceof CompileError)) throw e;
				report(e.message, e.span);
			}
		}
	}

	/* ---------- name resolution ---------- */

	function resolve(e: Expr): Value {
		if (e.kind === 'address') return typeOfAddress(parseAddress(e.text));
		if (e.kind === 'member') {
			const sym = vars.get(e.object.toUpperCase());
			if (!sym) throw new CompileError(`Unknown variable "${e.object}"`, e);
			if (sym.kind !== 'fb') throw new CompileError(`"${e.object}" is not a function block`, e);
			const timer = sym.type === 'TON' || sym.type === 'TOF' || sym.type === 'TP';
			const counter = sym.type === 'CTU' || sym.type === 'CTD';
			if (e.member === 'Q') {
				if (sym.q) return { type: 'BOOL', addr: sym.q };
				return {
					type: 'BOOL',
					addr: timer ? { area: 'T', index: sym.index } : { area: 'C', index: sym.index }
				};
			}
			if (timer && e.member === 'ET')
				return { type: 'TIME', addr: { area: 'T', index: sym.index } };
			if (counter && e.member === 'CV')
				return { type: 'INT', addr: { area: 'C', index: sym.index } };
			throw new CompileError(
				`${sym.type} has no output ${e.member} (use ${timer ? 'Q or ET' : counter ? 'Q or CV' : 'Q'})`,
				e
			);
		}
		if (e.kind === 'name') {
			const sym = vars.get(e.name.toUpperCase());
			if (sym?.kind === 'value') return sym.value;
			if (sym?.kind === 'fb') {
				throw new CompileError(`"${e.name}" is a ${sym.type} — call it, then read ${e.name}.Q`, e);
			}
			const address = symbols.get(e.name.toUpperCase());
			if (address) return typeOfAddress(parseAddress(address));
			throw new CompileError(
				`Unknown variable "${e.name}" — declare it in VAR or add it to the symbol table`,
				e
			);
		}
		throw new CompileError('Expected a variable', e);
	}

	function typeOf(e: Expr): ValType {
		switch (e.kind) {
			case 'number':
				return e.real ? 'REAL' : 'DINT';
			case 'time':
				return 'TIME';
			case 'bool':
				return 'BOOL';
			case 'name':
			case 'address':
			case 'member':
				return resolve(e).type; // unknown names are reported right here
			case 'unary':
				if (e.op === 'NOT') return typeOf(e.expr) === 'BOOL' ? 'BOOL' : 'DINT';
				return typeOf(e.expr);
			case 'binary':
				if (e.op === 'AND' || e.op === 'OR' || e.op === 'XOR')
					return typeOf(e.left) === 'BOOL' || typeOf(e.right) === 'BOOL' ? 'BOOL' : 'DINT';
				if (['=', '<>', '<', '>', '<=', '>='].includes(e.op)) return 'BOOL';
				return typeOf(e.left) === 'REAL' || typeOf(e.right) === 'REAL' ? 'REAL' : 'DINT';
			case 'fcall':
				return callType(e);
		}
		throw new CompileError('Unsupported expression', e);
	}

	function callType(e: Extract<Expr, { kind: 'fcall' }>): ValType {
		const conv = CONVERSION_RE.exec(e.name);
		const arity = conv ? 1 : FUNCTIONS[e.name];
		if (arity === undefined) {
			const hint =
				vars.get(e.name)?.kind === 'fb'
					? ` — call ${e.name} as a statement: ${e.name}(IN := …);`
					: '';
			throw new CompileError(`Unknown function "${e.name}"${hint}`, e);
		}
		if (e.args.length !== arity)
			throw new CompileError(
				`${e.name} takes ${arity} argument${arity > 1 ? 's' : ''}, not ${e.args.length}`,
				e
			);
		if (conv) return conv[2] as ValType;
		switch (e.name) {
			case 'ABS':
				return typeOf(e.args[0]) === 'REAL' ? 'REAL' : 'DINT';
			case 'MIN':
			case 'MAX':
			case 'LIMIT':
				return e.args.some((a) => typeOf(a) === 'REAL') ? 'REAL' : 'DINT';
			default:
				return 'DINT'; // TRUNC, SHL, SHR
		}
	}

	/* ---------- expressions ---------- */

	let tempsUsed = 0;
	const temps = new Set<number>(); // byte offsets of temporaries
	const allocTemp = (real: boolean, span: Span): AddrOperand => {
		if (tempsUsed >= TEMP_COUNT)
			throw new CompileError('Expression is too complex — split it into several statements', span);
		const byte = TEMP_START + 4 * tempsUsed++;
		temps.add(byte);
		return { kind: 'addr', addr: memAddress('M', 'D', byte), type: real ? 'REAL' : undefined };
	};
	const isTemp = (o: Operand, real: boolean): o is AddrOperand =>
		o.kind === 'addr' &&
		o.addr.area === 'M' &&
		temps.has(o.addr.byte) &&
		(o.type === 'REAL') === real;

	const CMP: Partial<Record<BinaryOp, CmpOp>> = {
		'=': '==',
		'<>': '<>',
		'<': '<',
		'>': '>',
		'<=': '<=',
		'>=': '>='
	};
	const MATH: Partial<Record<BinaryOp, MathFn>> = {
		'+': 'ADD',
		'-': 'SUB',
		'*': 'MUL',
		'/': 'DIV',
		MOD: 'MOD',
		AND: 'WAND',
		OR: 'WOR',
		XOR: 'WXOR'
	};

	function math(fn: MathFn, a: Operand, b: Operand, dst: AddrOperand) {
		emit({ op: 'LDC', value: true });
		emit({ op: 'MATH', fn, a, b, dst });
		emit({ op: 'POP' });
	}

	function fold(fn: MathFn, a: number, b: number, real: boolean): number | null {
		const r = mathOp(fn, a, b);
		return r === null || real ? r : Math.trunc(r);
	}

	const ZERO: Operand = { kind: 'const', value: 0 };

	/** a fn b into `target` (or a temporary); constant operands are folded at compile time. */
	function op(
		fn: MathFn,
		a: Operand,
		b: Operand,
		real: boolean,
		span: Span,
		target?: AddrOperand
	): Operand {
		if (a.kind === 'const' && b.kind === 'const') {
			const v = fold(fn, a.value, b.value, real);
			if (v === null) throw new CompileError('Division by zero', span);
			return { kind: 'const', value: v };
		}
		const dst = target ?? (isTemp(a, real) ? a : isTemp(b, real) ? b : allocTemp(real, span));
		math(fn, a, b, dst);
		return dst;
	}

	/** Standard function calls and type conversions. */
	function evalCall(e: Extract<Expr, { kind: 'fcall' }>, target?: AddrOperand): Operand {
		const type = callType(e);
		const real = type === 'REAL';
		const num = (x: Expr) => evalNum(x);
		const conv = CONVERSION_RE.exec(e.name);
		if (conv) {
			const [, from, to] = conv;
			const arg = e.args[0];
			if ((typeOf(arg) === 'BOOL') !== (from === 'BOOL'))
				throw new CompileError(`${e.name} expects a ${from} argument`, arg);
			if (to === 'BOOL')
				throw new CompileError(`${e.name} gives a BOOL — a number is needed here`, e);
			if (from === 'BOOL') {
				// 0, then 1 if the condition is true
				const dst = target ?? allocTemp(false, e);
				emit({ op: 'LDC', value: true });
				emit({ op: 'MOVE', src: ZERO, dst });
				emit({ op: 'POP' });
				pushBool(arg);
				emit({ op: 'MOVE', src: { kind: 'const', value: 1 }, dst });
				emit({ op: 'POP' });
				return dst;
			}
			const x = num(arg);
			const fromReal = typeOf(arg) === 'REAL';
			if (real) {
				if (x.kind === 'const' || isTemp(x, true)) return x;
				const dst = target && target.type === 'REAL' ? target : allocTemp(true, e);
				emit({ op: 'LDC', value: true });
				emit({ op: 'MOVE', src: x, dst });
				emit({ op: 'POP' });
				return dst;
			}
			let result = fromReal ? op('ROUND', x, ZERO, false, e, target) : x;
			if (to === 'BYTE')
				result = op('WAND', result, { kind: 'const', value: 255 }, false, e, target);
			return result;
		}
		for (const a of e.args)
			if (typeOf(a) === 'BOOL') throw new CompileError(`${e.name} needs numbers, not a BOOL`, a);
		switch (e.name) {
			case 'ABS':
				return op('ABS', num(e.args[0]), ZERO, real, e, target);
			case 'TRUNC':
				return op('TRUNC', num(e.args[0]), ZERO, false, e, target);
			case 'MIN':
			case 'MAX':
			case 'SHL':
			case 'SHR':
				return op(e.name, num(e.args[0]), num(e.args[1]), real, e, target);
			default: {
				// LIMIT(MN, IN, MX) = MIN(MAX(IN, MN), MX)
				const [mn, input, mx] = e.args.map(num);
				const low = op('MAX', input, mn, real, e);
				return op('MIN', low, mx, real, e, target);
			}
		}
	}

	/** Evaluates a numeric expression; returns where its value is. `target` may receive the result directly. */
	function evalNum(e: Expr, target?: AddrOperand): Operand {
		switch (e.kind) {
			case 'number':
			case 'time':
				return { kind: 'const', value: e.value };
			case 'bool':
				throw new CompileError('A number is needed here, not TRUE / FALSE', e);
			case 'name':
			case 'address':
			case 'member': {
				const v = resolve(e);
				if (!isNumeric(v.type))
					throw new CompileError(`${describeExpr(e)} is a BOOL — a number is needed here`, e);
				return { kind: 'addr', addr: v.addr, type: v.numType };
			}
			case 'fcall':
				return evalCall(e, target);
			case 'unary': {
				if (e.op === 'NOT') {
					if (typeOf(e.expr) === 'REAL')
						throw new CompileError('NOT works on BOOL or integer values, not REAL', e);
					return op('WNOT', evalNum(e.expr), ZERO, false, e, target);
				}
				const x = evalNum(e.expr);
				if (x.kind === 'const') return { kind: 'const', value: -x.value };
				const real = typeOf(e) === 'REAL';
				const dst = target ?? (isTemp(x, real) ? x : allocTemp(real, e));
				math('SUB', { kind: 'const', value: 0 }, x, dst);
				return dst;
			}
			case 'binary': {
				const fn = MATH[e.op];
				if (!fn) throw new CompileError(`${e.op} gives a BOOL — a number is needed here`, e);
				const real = typeOf(e) === 'REAL';
				if (
					(fn === 'WAND' || fn === 'WOR' || fn === 'WXOR') &&
					(typeOf(e.left) === 'REAL' || typeOf(e.right) === 'REAL')
				)
					throw new CompileError(`${e.op} works on BOOL or integer values, not REAL`, e);
				const a = evalNum(e.left);
				const b = evalNum(e.right);
				return op(fn, a, b, real, e, target);
			}
		}
		throw new CompileError('Unsupported expression', e);
	}

	/** Evaluates a BOOL expression onto the logic stack. */
	function pushBool(e: Expr): void {
		switch (e.kind) {
			case 'bool':
				emit({ op: 'LDC', value: e.value });
				return;
			case 'number':
			case 'time':
				throw new CompileError('A BOOL is needed here, not a number', e);
			case 'name':
			case 'address':
			case 'member': {
				const v = resolve(e);
				if (v.type !== 'BOOL')
					throw new CompileError(
						`${describeExpr(e)} is ${v.type} — a BOOL is needed here (compare it, e.g. > 0)`,
						e
					);
				emit({ op: 'LD', addr: v.addr });
				return;
			}
			case 'fcall': {
				if (callType(e) !== 'BOOL')
					throw new CompileError('A BOOL is needed here, not a number', e);
				// *_TO_BOOL: TRUE when not zero
				if (typeOf(e.args[0]) === 'BOOL') return pushBool(e.args[0]);
				emit({ op: 'CMP', cmp: '<>', a: evalNum(e.args[0]), b: ZERO });
				return;
			}
			case 'unary':
				if (e.op === '-' || typeOf(e.expr) !== 'BOOL')
					throw new CompileError('A BOOL is needed here, not a number', e);
				pushBool(e.expr);
				emit({ op: 'NOT' });
				return;
			case 'binary': {
				if (e.op === 'AND' || e.op === 'OR' || e.op === 'XOR') {
					if (typeOf(e.left) !== 'BOOL' || typeOf(e.right) !== 'BOOL') {
						throw new CompileError(
							`${e.op} needs two BOOLs (or two integers for a bitwise ${e.op}) — compare the number, e.g. (x ${e.op} 16#01) <> 0`,
							e
						);
					}
					pushBool(e.left);
					pushBool(e.right);
					emit({ op: e.op });
					return;
				}
				const cmp = CMP[e.op];
				if (!cmp) throw new CompileError('A BOOL is needed here, not a number', e);
				const lb = typeOf(e.left) === 'BOOL';
				const rb = typeOf(e.right) === 'BOOL';
				if (lb || rb) {
					if (!(lb && rb) || (e.op !== '=' && e.op !== '<>')) {
						throw new CompileError(
							`Cannot compare ${lb ? 'a BOOL' : 'a number'} with ${rb ? 'a BOOL' : 'a number'} using ${e.op}`,
							e
						);
					}
					pushBool(e.left);
					pushBool(e.right);
					emit({ op: 'XOR' });
					if (e.op === '=') emit({ op: 'NOT' });
					return;
				}
				const a = evalNum(e.left);
				const b = evalNum(e.right);
				emit({ op: 'CMP', cmp, a, b });
				return;
			}
		}
	}

	/* ---------- statements ---------- */

	function writable(t: Target): Value {
		const v = resolve(t);
		if (v.addr.area !== 'Q' && v.addr.area !== 'M') {
			const what = v.addr.area === 'I' ? 'an input' : 'a timer or counter';
			throw new CompileError(`${describeExpr(t)} is ${what} and cannot be assigned`, t);
		}
		return v;
	}

	function assign(t: Target, value: Expr) {
		const v = writable(t);
		if (v.type === 'BOOL') {
			if (typeOf(value) !== 'BOOL')
				throw new CompileError(`${describeExpr(t)} is a BOOL — a BOOL expression is needed`, value);
			pushBool(value);
			emit({ op: 'ST', addr: v.addr });
			emit({ op: 'POP' });
			return;
		}
		if (typeOf(value) === 'BOOL')
			throw new CompileError(
				`${describeExpr(t)} is ${v.type} — a number is needed, not a BOOL`,
				value
			);
		const dst: AddrOperand = { kind: 'addr', addr: v.addr, type: v.numType };
		const direct =
			(value.kind === 'binary' || value.kind === 'unary' || value.kind === 'fcall') &&
			(typeOf(value) === 'REAL') === (v.type === 'REAL');
		const result = evalNum(value, direct ? dst : undefined);
		if (result !== dst) {
			emit({ op: 'LDC', value: true });
			emit({ op: 'MOVE', src: result, dst });
			emit({ op: 'POP' });
		}
	}

	function call(s: Extract<Stmt, { kind: 'call' }>) {
		const sym = vars.get(s.name.toUpperCase());
		if (!sym)
			throw new CompileError(
				`Unknown function block "${s.name}" — declare it, e.g. ${s.name} : TON;`,
				s.nameSpan
			);
		if (sym.kind !== 'fb')
			throw new CompileError(`"${s.name}" is not a function block`, s.nameSpan);
		const params = FB_PARAMS[sym.type];
		const given = new Map(s.args.map((a) => [a.name, a]));
		for (const a of s.args) {
			const p = params.find((x) => x.name === a.name);
			if (!p)
				throw new CompileError(
					`${sym.type} has no input ${a.name} (inputs: ${params.map((x) => x.name).join(', ')})`,
					a
				);
			if (p.bool !== (typeOf(a.value) === 'BOOL')) {
				throw new CompileError(
					`${a.name} needs ${p.bool ? 'a BOOL' : 'a number or time'}`,
					a.value
				);
			}
		}
		for (const p of params) {
			if (p.required && !given.has(p.name))
				throw new CompileError(`${s.name}: input ${p.name} is missing`, s.nameSpan);
		}
		const pushOptional = (name: string) => {
			const a = given.get(name);
			if (a) pushBool(a.value);
			else emit({ op: 'LDC', value: false });
		};

		switch (sym.type) {
			case 'TON':
			case 'TOF':
			case 'TP': {
				pushBool(given.get('IN')!.value);
				const pt = evalNum(given.get('PT')!.value);
				emit({ op: sym.type, timer: sym.index, pt });
				break;
			}
			case 'CTU':
			case 'CTD': {
				pushBool(given.get(sym.type === 'CTU' ? 'CU' : 'CD')!.value);
				pushOptional(sym.type === 'CTU' ? 'R' : 'LD');
				const pv = evalNum(given.get('PV')!.value);
				emit({ op: sym.type, counter: sym.index, pv });
				break;
			}
			case 'R_TRIG':
			case 'F_TRIG':
				pushBool(given.get('CLK')!.value);
				emit({ op: sym.type === 'R_TRIG' ? 'EDGE_P' : 'EDGE_N' });
				emit({ op: 'ST', addr: sym.q! });
				break;
		}
		emit({ op: 'POP' });
	}

	const loops: Label[] = [];
	let returnLabel = newLabel();

	function block(list: Stmt[]) {
		for (const s of list) {
			try {
				statement(s);
			} catch (e) {
				if (!(e instanceof CompileError)) throw e;
				report(e.message, e.span);
			}
		}
	}

	function constStep(e: Expr | null): number {
		if (!e) return 1;
		if (e.kind === 'number' && !e.real) return e.value;
		if (e.kind === 'unary' && e.op === '-' && e.expr.kind === 'number' && !e.expr.real)
			return -e.expr.value;
		throw new CompileError('BY must be an integer constant, e.g. BY 2 or BY -1', e);
	}

	function statement(s: Stmt) {
		line = lineOf(s.from);
		tempsUsed = 0;
		temps.clear();

		switch (s.kind) {
			case 'assign':
				assign(s.target, s.value);
				return;
			case 'call':
				call(s);
				return;
			case 'if': {
				const end = newLabel();
				for (const branch of s.branches) {
					const nextBranch = newLabel();
					line = lineOf(branch.cond.from);
					tempsUsed = 0;
					temps.clear();
					if (typeOf(branch.cond) !== 'BOOL')
						throw new CompileError('IF needs a BOOL condition', branch.cond);
					pushBool(branch.cond);
					jump('JMPCN', nextBranch);
					block(branch.body);
					jump('JMP', end);
					place(nextBranch);
				}
				if (s.otherwise) block(s.otherwise);
				place(end);
				return;
			}
			case 'case': {
				if (typeOf(s.selector) === 'BOOL' || typeOf(s.selector) === 'REAL') {
					throw new CompileError('CASE needs an integer selector', s.selector);
				}
				let sel = evalNum(s.selector);
				if (isTemp(sel, false)) {
					// keep the selector safe from the temporaries used inside the branches
					const keep: AddrOperand = { kind: 'addr', addr: allocValue('DINT', s.selector).addr };
					emit({ op: 'LDC', value: true });
					emit({ op: 'MOVE', src: sel, dst: keep });
					emit({ op: 'POP' });
					sel = keep;
				}
				const end = newLabel();
				for (const c of s.cases) {
					const nextCase = newLabel();
					c.labels.forEach((l, i) => {
						if (l.kind === 'value') {
							emit({ op: 'CMP', cmp: '==', a: sel, b: { kind: 'const', value: l.value } });
						} else {
							emit({ op: 'CMP', cmp: '>=', a: sel, b: { kind: 'const', value: l.low } });
							emit({ op: 'CMP', cmp: '<=', a: sel, b: { kind: 'const', value: l.high } });
							emit({ op: 'AND' });
						}
						if (i > 0) emit({ op: 'OR' });
					});
					jump('JMPCN', nextCase);
					block(c.body);
					jump('JMP', end);
					place(nextCase);
				}
				if (s.otherwise) block(s.otherwise);
				place(end);
				return;
			}
			case 'for': {
				const v = writable(s.variable);
				if (v.type === 'BOOL' || v.type === 'REAL')
					throw new CompileError('FOR needs an integer variable', s.variable);
				const step = constStep(s.step);
				if (step === 0) throw new CompileError('BY 0 would loop forever', s.step ?? s);
				assign(s.variable, s.start);
				const top = newLabel();
				const exit = newLabel();
				place(top);
				tempsUsed = 0;
				temps.clear();
				const counter: AddrOperand = { kind: 'addr', addr: v.addr };
				emit({ op: 'CMP', cmp: step > 0 ? '>' : '<', a: counter, b: evalNum(s.end) });
				jump('JMPC', exit);
				loops.push(exit);
				block(s.body);
				loops.pop();
				line = lineOf(s.from);
				math('ADD', counter, { kind: 'const', value: step }, counter);
				jump('JMP', top);
				place(exit);
				return;
			}
			case 'while': {
				const top = newLabel();
				const exit = newLabel();
				place(top);
				if (typeOf(s.cond) !== 'BOOL')
					throw new CompileError('WHILE needs a BOOL condition', s.cond);
				pushBool(s.cond);
				jump('JMPCN', exit);
				loops.push(exit);
				block(s.body);
				loops.pop();
				jump('JMP', top);
				place(exit);
				return;
			}
			case 'repeat': {
				const top = newLabel();
				const exit = newLabel();
				place(top);
				loops.push(exit);
				block(s.body);
				loops.pop();
				line = lineOf(s.until.from);
				tempsUsed = 0;
				temps.clear();
				if (typeOf(s.until) !== 'BOOL')
					throw new CompileError('UNTIL needs a BOOL condition', s.until);
				pushBool(s.until);
				jump('JMPCN', top);
				place(exit);
				return;
			}
			case 'exit': {
				const loop = loops.at(-1);
				if (!loop) throw new CompileError('EXIT is only allowed inside FOR, WHILE or REPEAT', s);
				jump('JMP', loop);
				return;
			}
			case 'return':
				jump('JMP', returnLabel);
				return;
		}
	}

	/* ---------- program ---------- */

	// initial values, once after every download / cold restart (retentive ones: only the first time)
	const withInit = ast.vars.filter(
		(v) => v.init && vars.get(v.name.toUpperCase())?.kind === 'value'
	);
	initialise(
		withInit.filter((v) => !retained.includes(v)),
		initFlag
	);
	if (retainInitFlag)
		initialise(
			withInit.filter((v) => retained.includes(v)),
			retainInitFlag
		);

	function initialise(inits: VarDecl[], flag: Address) {
		if (inits.length === 0) return;
		const skip = newLabel();
		line = lineOf(inits[0].from);
		emit({ op: 'LD', addr: flag });
		jump('JMPC', skip);
		for (const v of inits) {
			line = lineOf(v.from);
			tempsUsed = 0;
			temps.clear();
			try {
				assign({ kind: 'name', name: v.name, from: v.from, to: v.to }, v.init!);
			} catch (e) {
				if (!(e instanceof CompileError)) throw e;
				report(e.message, e.span);
			}
		}
		emit({ op: 'LDC', value: true });
		emit({ op: 'ST', addr: flag });
		emit({ op: 'POP' });
		place(skip);
	}

	block(ast.body);
	place(returnLabel);

	// the cyclic interrupt: its own entry point after the main program, which jumps over it
	let cyclic: LoadOptions['cyclic'];
	if (ast.cyclic) {
		const end = newLabel();
		line = lineOf(ast.cyclic.from);
		jump('JMP', end);
		cyclic = { entry: program.length, intervalMs: ast.cyclic.intervalMs };
		returnLabel = end;
		block(ast.cyclic.body);
		place(end);
	}
	const load: LoadOptions = {};
	if (cyclic) load.cyclic = cyclic;
	if (retained.length)
		load.retain = {
			from: VAR_AREA.start,
			to: retainEnd,
			signature: retained.map((v) => `${v.name.toUpperCase()}:${v.type}`).join(';')
		};

	// resolve jump targets
	for (const label of labels) {
		for (const ref of label.refs) {
			const ins = program[ref];
			if (ins.op === 'JMP' || ins.op === 'JMPC' || ins.op === 'JMPCN')
				ins.target = label.pc ?? program.length;
		}
	}

	if (diagnostics.length === 0) {
		for (const issue of validateProgram(program, config)) {
			const ln = lines[issue.pc];
			const start = ln ? lineStarts[ln - 1] : 0;
			report(issue.message, { from: start, to: start + 1 });
		}
	}

	return {
		program,
		diagnostics: dedupe(diagnostics),
		// hidden helpers (function results) are not shown
		variables: variables.filter((v) => !v.name.includes('#')),
		// lines in the library are not lines of this source
		lines: lines.map((l) => (l === null || l - preLines <= 0 ? null : l - preLines)),
		...(load.cyclic || load.retain ? { load } : {})
	};
}

function dedupe(list: StDiagnostic[]): StDiagnostic[] {
	const seen = new Set<string>();
	return list
		.filter((d) => {
			const key = `${d.from}:${d.to}:${d.message}`;
			if (seen.has(key)) return false;
			seen.add(key);
			return true;
		})
		.sort((a, b) => a.from - b.from);
}
