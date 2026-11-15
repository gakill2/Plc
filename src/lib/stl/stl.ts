/*
 * Statement List (STL / AWL, Siemens S7-300/400) — a teaching subset, translated to Structured
 * Text and compiled by the ST compiler, like SFC and FBD. Legacy S7 programs are full of it, so
 * a technician has to read it even if nobody writes new code in it.
 *
 * Supported (international mnemonics):
 *   bit logic   A AN O ON X XN, A( AN( O( ON( X( XN( ), O (alone: OR of AND groups)
 *               NOT SET CLR, = S R, FP FN (edge memory bit)
 *   timers      L S5T#5S + SD / SE / SP / SF Tn (on-delay, extended pulse, pulse, off-delay);
 *               A Tn reads the timer bit
 *   load        L operand, T address — accumulators 1 and 2
 *   math        +I -I *I /I  +D -D *D /D  +R -R *R /R
 *   compare     ==I <>I >I <I >=I <=I (also D and R) — the result is ANDed into the RLO
 *   jumps       JU JC JCN to a label further down (labels: `M001:`), BE, BEC
 *   structure   NETWORK lines, // comments, "Symbols" in quotes, `I 0.0` with a space
 *
 * Semantics as in S7: AND binds before OR (`A a; A b; O c; A d` = a·b + c·d), the first check
 * after an assignment starts a new logic string, L and T run regardless of the RLO.
 * Not supported (reported as an error): backward jumps (loops), counters, BLD,
 * accumulator tricks (TAK, PUSH, POP), indirect addressing.
 */

export interface StlIssue {
	/** 1-based line of the STL source */
	line: number;
	message: string;
}

export interface GeneratedStl {
	source: string;
	/** 1-based line of the ST source → 1-based line of the STL source */
	origin: Record<number, number>;
	issues: StlIssue[];
	/** what the online status columns show per STL line: tags to read live */
	status: Record<number, LineStatus>;
}

/** Like the STL monitor in TIA / STEP 7: status bit, result of logic, accumulator 1. */
export interface LineStatus {
	sta?: string;
	rlo?: string;
	accu?: string;
}

type TimerKind = 'SD' | 'SE' | 'SP' | 'SF';
const TIMER_FB: Record<TimerKind, string> = { SD: 'TON', SE: 'TP', SP: 'TP', SF: 'TOF' };

type Logic = 'A' | 'AN' | 'O' | 'ON' | 'X' | 'XN';
const LOGIC = new Set<string>(['A', 'AN', 'O', 'ON', 'X', 'XN']);

const CMP: Record<string, string> = {
	'==': '=',
	'<>': '<>',
	'>': '>',
	'<': '<',
	'>=': '>=',
	'<=': '<='
};

class StlError extends Error {}

/** The logic string being built: OR of AND groups. */
interface Chain {
	ors: string[];
	and: string | null;
}

const paren = (e: string) => (/^[\w.]+$/.test(e) ? e : `(${e})`);

/** Joins `I 0.0`, `MW 10` and strips quotes from `"Symbol"`. */
function operandOf(raw: string): string {
	let s = raw.trim();
	if (!s) return '';
	const q = /^"([^"]+)"$/.exec(s);
	if (q) {
		if (!/^[A-Za-z_]\w*$/.test(q[1]))
			throw new StlError(`Symbol "${q[1]}" — use a name without spaces`);
		return q[1];
	}
	s = s.replace(/^#/, '');
	const spaced = /^(P?[IQM][BWD]?|T|C)\s+(\d+(?:\.\d)?)$/i.exec(s);
	if (spaced) s = spaced[1] + spaced[2];
	return s
		.replace(/^P([IQ][BWD]\d+)$/i, '$1')
		.replace(/^([A-Za-z]+)(?=\d)/, (m) => m.toUpperCase());
}

const BIT_RE = /^[IQM]\d+\.[0-7]$/;
const TIMER_RE = /^T(\d+)$/;
const WORD_RE = /^[IQM][BWD]\d+$/;
const NAME_RE = /^[A-Za-z_]\w*$/;

/** A number for the accumulator: constant or address, as ST text. */
function loadValue(op: string): string {
	if (!op) throw new StlError('L needs an operand');
	if (/^[+-]?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(op)) return op;
	const dint = /^L#([+-]?\d+)$/i.exec(op);
	if (dint) return dint[1];
	const hex = /^(?:B|W|DW)#16#([0-9A-F]+)$/i.exec(op);
	if (hex) return `16#${hex[1].toUpperCase()}`;
	const bin = /^2#([01_]+)$/.exec(op);
	if (bin) return op;
	const time = /^(?:S5T|S5TIME|T|TIME)#(.+)$/i.exec(op);
	if (time) return `T#${time[1].replace(/_/g, '').toLowerCase()}`;
	if (WORD_RE.test(op)) return op;
	if (TIMER_RE.test(op) || /^C\d+$/.test(op))
		throw new StlError(`L ${op} (timer/counter value) is not supported here`);
	if (NAME_RE.test(op)) return op;
	throw new StlError(`Cannot load "${op}"`);
}

export function stlToSt(src: string): GeneratedStl {
	const out: { text: string; line: number; guard: string }[] = [];
	const issues: StlIssue[] = [];
	const temps: string[] = [];
	const timers = new Map<number, TimerKind | null>();
	const edges: string[] = [];

	let line = 0;
	const status: Record<number, LineStatus> = {};
	const note = (k: keyof LineStatus, v: string) => ((status[line] ??= {})[k] = v);
	// forward jumps waiting for their label: label → skip flag. While a flag is set, the code
	// up to its label is skipped, so every statement is guarded by the flags still pending.
	const pending = new Map<string, { flag: string; line: number }>();
	const flags: string[] = [];
	const guardNow = () => [...pending.values()].map((p) => p.flag).join(' OR ');
	const emit = (text: string, guard = guardNow()) => out.push({ text, line, guard });
	const jumpFlag = (label: string) => {
		let p = pending.get(label);
		if (!p) {
			p = { flag: `_j${flags.length + 1}`, line };
			flags.push(p.flag);
			pending.set(label, p);
		}
		return p.flag;
	};

	// logic state
	let chain: Chain = { ors: [], and: null };
	/** an RLO exists but the next check starts a new string (/FC = 0) */
	let held: string | null = null;
	const nest: { chain: Chain; op: Logic }[] = [];
	// accumulators
	let accu1: string | null = null;
	let accu2: string | null = null;
	const seen = new Set<string>();
	let ended = false;

	const inChain = () => chain.and !== null || chain.ors.length > 0;
	const rloExpr = (c: Chain): string => {
		const parts = [...c.ors, ...(c.and !== null ? [c.and] : [])];
		if (!parts.length) throw new StlError('No logic operation before this instruction');
		return parts.length === 1 ? parts[0] : parts.map(paren).join(' OR ');
	};
	/** Stores the current RLO in a fresh temporary and returns its name. */
	const materialize = (): string => {
		if (!inChain()) {
			if (held) return held;
			throw new StlError('No logic operation (RLO) before this instruction');
		}
		const name = `_r${temps.length + 1}`;
		temps.push(name);
		emit(`${name} := ${rloExpr(chain)};`);
		note('rlo', name);
		chain = { ors: [], and: null };
		held = name;
		return name;
	};
	const combine = (op: Logic, value: string) => {
		const v = op.endsWith('N') ? `NOT ${paren(value)}` : value;
		const first = !inChain();
		if (first) {
			held = null;
			chain = { ors: [], and: v };
			return;
		}
		if (op === 'A' || op === 'AN') {
			chain.and = chain.and === null ? v : `${paren(chain.and)} AND ${paren(v)}`;
		} else if (op === 'O' || op === 'ON') {
			if (chain.and !== null) chain.ors.push(chain.and);
			chain.and = v;
		} else {
			chain = { ors: [], and: `${paren(rloExpr(chain))} XOR ${paren(v)}` };
		}
	};
	const bit = (op: string): string => {
		if (BIT_RE.test(op)) return op;
		const t = TIMER_RE.exec(op);
		if (t) {
			const n = Number(t[1]);
			if (!timers.has(n)) timers.set(n, null);
			return `_T${n}Q`;
		}
		if (/^C\d+$/.test(op)) throw new StlError(`Counters (${op}) are not supported here`);
		if (NAME_RE.test(op)) return op;
		throw new StlError(op ? `"${op}" is not a bit operand` : 'Missing operand');
	};
	const target = (op: string): string => {
		if (BIT_RE.test(op) || NAME_RE.test(op)) return op;
		throw new StlError(op ? `Cannot assign to "${op}"` : 'Missing operand');
	};
	const binary = (fn: (a: string, b: string) => string) => {
		if (accu1 === null || accu2 === null) throw new StlError('Needs two values loaded with L');
		accu1 = fn(accu2, accu1);
	};

	const lines = src.split('\n');
	for (let i = 0; i < lines.length && !ended; i++) {
		line = i + 1;
		let text = lines[i].replace(/\/\/.*$/, '').trim();
		if (!text) continue;
		try {
			if (/^(NETWORK|NW)\b/i.test(text) || /^TITLE\s*=/i.test(text)) {
				if (inChain()) materialize();
				chain = { ors: [], and: null };
				held = null;
				continue;
			}
			const label = /^([A-Za-z_]\w{0,7})\s*:(?!=)\s*(.*)$/.exec(text);
			if (label) {
				const name = label[1].toUpperCase();
				if (seen.has(name)) throw new StlError(`Label ${label[1]} is defined twice`);
				seen.add(name);
				pending.delete(name);
				// a label starts a new logic string
				chain = { ors: [], and: null };
				held = null;
				text = label[2].trim();
				if (!text) continue;
			}

			const m = /^(\S+?)(\(?)(?:\s+(.*))?$/.exec(text);
			if (!m) throw new StlError(`Cannot read "${text}"`);
			let mn = m[1].toUpperCase();
			let rest = (m[3] ?? '').trim();
			let opening = m[2] === '(';
			if (!opening && rest === '(') {
				opening = true;
				rest = '';
			}
			if (mn.endsWith('(')) {
				mn = mn.slice(0, -1);
				opening = true;
			}
			const op = operandOf(rest);

			if (opening) {
				if (!LOGIC.has(mn)) throw new StlError(`${mn}( is not an instruction`);
				nest.push({ chain, op: mn as Logic });
				chain = { ors: [], and: null };
				held = null;
				continue;
			}
			if (mn === ')') {
				const top = nest.pop();
				if (!top) throw new StlError(') without an opening bracket');
				const inner = rloExpr(chain);
				chain = top.chain;
				combine(top.op, `(${inner})`);
				continue;
			}
			if (LOGIC.has(mn)) {
				if (!op) {
					if (mn !== 'O') throw new StlError(`${mn} needs an operand`);
					if (chain.and !== null) chain.ors.push(chain.and);
					chain.and = null;
					continue;
				}
				const b = bit(op);
				note('sta', b);
				combine(mn as Logic, b);
				continue;
			}
			const cmp = /^(==|<>|>=|<=|>|<)([IDR])$/.exec(mn);
			if (cmp) {
				if (accu1 === null || accu2 === null)
					throw new StlError('Compare needs two values loaded with L');
				combine('A', `(${accu2} ${CMP[cmp[1]]} ${accu1})`);
				continue;
			}
			const math = /^([+\-*/])([IDR])$/.exec(mn);
			if (math) {
				binary((a, b) => `(${a} ${math[1]} ${b})`);
				continue;
			}
			switch (mn) {
				case 'NOT': {
					const r = inChain() ? rloExpr(chain) : held;
					if (!r) throw new StlError('NOT needs an RLO');
					chain = { ors: [], and: `NOT ${paren(r)}` };
					break;
				}
				case 'SET':
				case 'CLR':
					chain = { ors: [], and: mn === 'SET' ? 'TRUE' : 'FALSE' };
					break;
				case '=': {
					const r = materialize();
					emit(`${target(op)} := ${r};`);
					break;
				}
				case 'S':
				case 'R': {
					if (TIMER_RE.test(op) || /^C\d+$/.test(op))
						throw new StlError(`${mn} ${op} is not supported here`);
					const r = materialize();
					emit(`IF ${r} THEN ${target(op)} := ${mn === 'S' ? 'TRUE' : 'FALSE'}; END_IF;`);
					break;
				}
				case 'FP':
				case 'FN': {
					if (!BIT_RE.test(op) && !NAME_RE.test(op))
						throw new StlError(`${mn} needs an edge memory bit (e.g. M10.0)`);
					const r = materialize();
					const e = `_e${edges.length + 1}`;
					edges.push(e);
					emit(
						mn === 'FP'
							? `${e} := ${r} AND NOT ${op}; ${op} := ${r};`
							: `${e} := NOT ${r} AND ${op}; ${op} := ${r};`
					);
					chain = { ors: [], and: e };
					held = null;
					note('sta', e);
					break;
				}
				case 'SD':
				case 'SE':
				case 'SP':
				case 'SF': {
					const t = TIMER_RE.exec(op);
					if (!t) throw new StlError(`${mn} needs a timer (T1 … )`);
					if (!accu1?.startsWith('T#'))
						throw new StlError(`Load the time first: L S5T#5S, then ${mn} ${op}`);
					const n = Number(t[1]);
					const kind = timers.get(n);
					if (kind && kind !== mn) throw new StlError(`T${n} is already used as ${kind}`);
					timers.set(n, mn);
					const r = materialize();
					emit(`_T${n}(IN := ${r}, PT := ${accu1});`);
					emit(mn === 'SP' ? `_T${n}Q := _T${n}.Q AND ${r};` : `_T${n}Q := _T${n}.Q;`);
					break;
				}
				case 'L':
					accu2 = accu1;
					accu1 = loadValue(op);
					break;
				case 'T':
					if (accu1 === null) throw new StlError('T needs a value loaded with L');
					if (!WORD_RE.test(op) && !NAME_RE.test(op))
						throw new StlError(`Cannot transfer to "${op}"`);
					emit(`${op} := ${accu1};`);
					note('accu', op);
					accu1 = op;
					break;
				case 'JU':
				case 'JC':
				case 'JCN': {
					if (!NAME_RE.test(rest)) throw new StlError(`${mn} needs a label`);
					const name = rest.toUpperCase();
					if (seen.has(name))
						throw new StlError(`Backward jump to ${rest} (a loop) is not supported here`);
					const r = mn === 'JU' ? '' : materialize();
					const g = guardNow();
					const f = jumpFlag(name);
					emit(
						r ? `IF ${mn === 'JC' ? r : `NOT ${r}`} THEN ${f} := TRUE; END_IF;` : `${f} := TRUE;`,
						g
					);
					// a jump that is not taken leaves RLO = 1 and starts a new string
					chain = { ors: [], and: null };
					held = 'TRUE';
					break;
				}
				case 'BEC': {
					const r = materialize();
					const g = guardNow();
					emit(`IF ${r} THEN ${jumpFlag(' END')} := TRUE; END_IF;`, g);
					chain = { ors: [], and: null };
					held = 'TRUE';
					break;
				}
				case 'BE':
				case 'BEU':
					ended = true;
					break;
				case 'NOP':
					break;
				default:
					throw new StlError(`Unknown instruction ${m[1]}`);
			}
		} catch (e) {
			if (!(e instanceof StlError)) throw e;
			issues.push({ line, message: e.message });
			chain = { ors: [], and: null };
			held = null;
		}
	}

	line = lines.length;
	if (nest.length) issues.push({ line, message: 'A bracket is not closed with )' });
	for (const [label, p] of pending)
		if (label !== ' END') issues.push({ line: p.line, message: `Label ${label} not found` });

	const decls = [
		...temps.map((t) => `  ${t} : BOOL;`),
		...edges.map((e) => `  ${e} : BOOL;`),
		...flags.map((f) => `  ${f} : BOOL;`),
		...[...timers].flatMap(([n, kind]) => [
			`  _T${n} : ${TIMER_FB[kind ?? 'SD']};`,
			`  _T${n}Q : BOOL;`
		])
	];
	const head = decls.length ? ['VAR', ...decls, 'END_VAR'] : [];
	head.push(...flags.map((f) => `${f} := FALSE;`));
	const body: string[] = [];
	const origin: Record<number, number> = {};
	let guard = '';
	for (const o of out) {
		if (o.guard !== guard) {
			if (guard) body.push('END_IF;');
			if (o.guard) body.push(`IF NOT (${o.guard}) THEN`);
			guard = o.guard;
		}
		body.push(guard ? `  ${o.text}` : o.text);
		origin[head.length + body.length] = o.line;
	}
	if (guard) body.push('END_IF;');
	return { source: [...head, ...body].join('\n') + '\n', origin, issues, status };
}
