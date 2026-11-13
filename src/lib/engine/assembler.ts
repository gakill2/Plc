import { formatAddress, parseAddress } from './address.js';
import type { Instr, Program } from './ir.js';
import type { AddrOperand, CmpOp, MathFn, NumType, Operand } from './types.js';

/*
 * A tiny text assembler for the IR, using IL-like mnemonics. Handy for tests, for debugging the
 * compilers, and as a "show me what my Ladder compiles to" view.
 *
 *   start:            // labels end with a colon
 *   LD   I0.0         // one instruction per line, operands separated by spaces or commas
 *   OR   Q0.0
 *   AND  I0.1
 *   ST   Q0.0
 *   POP
 *   TON  T1, T#2s     // time literals: T#500ms, T#1m30s …
 *   ADD  MD0:REAL, 1.5, MD0:REAL
 *   JMPC start
 */

export class AssemblyError extends Error {
	override name = 'AssemblyError';
	readonly line: number;

	constructor(message: string, line: number) {
		super(`Line ${line}: ${message}`);
		this.line = line;
	}
}

const NUM_RE = /^[+-]?\d+(\.\d+)?$/;
const TIME_RE = /^T#(?:\d+(?:\.\d+)?(?:ms|d|h|m|s))+$/i;
const TIME_PART_RE = /(\d+(?:\.\d+)?)(ms|d|h|m|s)/gi;
const LABEL_RE = /^([A-Za-z_]\w*):(?:\s+(.*))?$/;

const UNIT_MS: Record<string, number> = { ms: 1, s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
const NUM_TYPES: readonly NumType[] = ['BYTE', 'INT', 'DINT', 'REAL'];
const CMP_OPS: Record<string, CmpOp> = {
	EQ: '==',
	NE: '<>',
	LT: '<',
	GT: '>',
	LE: '<=',
	GE: '>='
};

/** Parses an IEC time literal (`T#1m30s`) into milliseconds. */
export function parseTime(text: string): number {
	if (!TIME_RE.test(text)) throw new Error(`Invalid time literal "${text}"`);
	let ms = 0;
	for (const [, amount, unit] of text.slice(2).matchAll(TIME_PART_RE)) {
		ms += Number(amount) * UNIT_MS[unit.toLowerCase()];
	}
	return ms;
}

/** Number, time literal, TRUE/FALSE, or address with optional type: `MD4:REAL`. */
export function parseOperand(token: string): Operand {
	if (NUM_RE.test(token)) return { kind: 'const', value: Number(token) };
	if (TIME_RE.test(token)) return { kind: 'const', value: parseTime(token) };
	const upper = token.toUpperCase();
	if (upper === 'TRUE') return { kind: 'const', value: 1 };
	if (upper === 'FALSE') return { kind: 'const', value: 0 };

	const [addrText, typeText, ...rest] = token.split(':');
	if (rest.length > 0) throw new Error(`Invalid operand "${token}"`);
	const addr = parseAddress(addrText);
	if (typeText === undefined) return { kind: 'addr', addr };
	const type = typeText.toUpperCase() as NumType;
	if (!NUM_TYPES.includes(type)) throw new Error(`Unknown type "${typeText}"`);
	return { kind: 'addr', addr, type };
}

type Line = { line: number; mnemonic: string; args: string[] };

export function assemble(source: string): Instr[] {
	const lines: Line[] = [];
	const labels = new Map<string, number>();

	source.split(/\r?\n/).forEach((raw, i) => {
		const line = i + 1;
		let text = raw.replace(/(\/\/|;).*$/, '').trim();
		if (!text) return;

		const label = LABEL_RE.exec(text);
		if (label) {
			const name = label[1].toUpperCase();
			if (labels.has(name)) throw new AssemblyError(`Duplicate label "${label[1]}"`, line);
			labels.set(name, lines.length);
			text = (label[2] ?? '').trim();
			if (!text) return;
		}

		const [mnemonic, ...args] = text.split(/[\s,]+/);
		lines.push({ line, mnemonic: mnemonic.toUpperCase(), args });
	});

	return lines.map((l) => {
		try {
			return build(l, labels);
		} catch (e) {
			throw new AssemblyError(e instanceof Error ? e.message : String(e), l.line);
		}
	});
}

function build({ mnemonic: m, args }: Line, labels: Map<string, number>): Instr {
	const arity = (n: number) => {
		if (args.length !== n) {
			throw new Error(`${m} expects ${n} operand${n === 1 ? '' : 's'}, got ${args.length}`);
		}
	};
	const destination = (token: string): AddrOperand => {
		const o = parseOperand(token);
		if (o.kind !== 'addr') throw new Error(`${m}: destination must be an address, got "${token}"`);
		return o;
	};
	const instance = (token: string, area: 'T' | 'C'): number => {
		const a = parseAddress(token);
		if (a.area !== area) {
			throw new Error(
				`${m} expects a ${area === 'T' ? 'timer' : 'counter'} like ${area}1, got "${token}"`
			);
		}
		return a.index;
	};
	const target = (token: string): number => {
		if (/^\d+$/.test(token)) return Number(token);
		const pc = labels.get(token.toUpperCase());
		if (pc === undefined) throw new Error(`Unknown label "${token}"`);
		return pc;
	};

	switch (m) {
		case 'LD':
		case 'LDN':
			arity(1);
			return { op: m, addr: parseAddress(args[0]) };
		case 'LDC': {
			arity(1);
			const v = args[0].toUpperCase();
			if (!['0', '1', 'TRUE', 'FALSE'].includes(v)) throw new Error(`LDC expects 0 or 1`);
			return { op: 'LDC', value: v === '1' || v === 'TRUE' };
		}
		case 'AND':
		case 'OR':
		case 'XOR':
		case 'ANDN':
		case 'ORN':
			if (args.length === 0) return { op: m };
			arity(1);
			return { op: m, addr: parseAddress(args[0]) };
		case 'NOT':
		case 'POP':
		case 'EDGE_P':
		case 'EDGE_N':
			arity(0);
			return { op: m };
		case 'FP':
			arity(0);
			return { op: 'EDGE_P' };
		case 'FN':
			arity(0);
			return { op: 'EDGE_N' };
		case 'ST':
		case '=':
			arity(1);
			return { op: 'ST', addr: parseAddress(args[0]) };
		case 'STN':
		case 'S':
		case 'R':
			arity(1);
			return { op: m, addr: parseAddress(args[0]) };
		case 'EQ':
		case 'NE':
		case 'LT':
		case 'GT':
		case 'LE':
		case 'GE':
			arity(2);
			return { op: 'CMP', cmp: CMP_OPS[m], a: parseOperand(args[0]), b: parseOperand(args[1]) };
		case 'TON':
		case 'TOF':
		case 'TP':
			arity(2);
			return { op: m, timer: instance(args[0], 'T'), pt: parseOperand(args[1]) };
		case 'CTU':
		case 'CTD':
		case 'CTUD':
			arity(2);
			return { op: m, counter: instance(args[0], 'C'), pv: parseOperand(args[1]) };
		case 'MOVE':
			arity(2);
			return { op: 'MOVE', src: parseOperand(args[0]), dst: destination(args[1]) };
		case 'ADD':
		case 'SUB':
		case 'MUL':
		case 'DIV':
		case 'MOD':
			arity(3);
			return {
				op: 'MATH',
				fn: m as MathFn,
				a: parseOperand(args[0]),
				b: parseOperand(args[1]),
				dst: destination(args[2])
			};
		case 'JMP':
		case 'JMPC':
		case 'JMPCN':
			arity(1);
			return { op: m, target: target(args[0]) };
		case 'TAP':
		case 'LDT':
			arity(1);
			if (!/^\d+$/.test(args[0])) throw new Error(`${m} expects a probe number`);
			return { op: m, slot: Number(args[0]) };
		default:
			throw new Error(`Unknown instruction "${m}"`);
	}
}

const CMP_MNEMONICS: Record<CmpOp, string> = Object.fromEntries(
	Object.entries(CMP_OPS).map(([mnemonic, op]) => [op, mnemonic])
) as Record<CmpOp, string>;

export function formatOperand(o: Operand): string {
	if (o.kind === 'const') return String(o.value);
	return formatAddress(o.addr) + (o.type ? `:${o.type}` : '');
}

/** Turns IR back into assembler text. `assemble(disassemble(p))` gives `p` again. */
export function disassemble(program: Program): string[] {
	return program.map((ins) => {
		switch (ins.op) {
			case 'LD':
			case 'LDN':
			case 'ST':
			case 'STN':
			case 'S':
			case 'R':
				return `${ins.op} ${formatAddress(ins.addr)}`;
			case 'AND':
			case 'OR':
			case 'XOR':
			case 'ANDN':
			case 'ORN':
				return ins.addr ? `${ins.op} ${formatAddress(ins.addr)}` : ins.op;
			case 'LDC':
				return `LDC ${ins.value ? 1 : 0}`;
			case 'NOT':
			case 'POP':
			case 'EDGE_P':
			case 'EDGE_N':
				return ins.op;
			case 'CMP':
				return `${CMP_MNEMONICS[ins.cmp]} ${formatOperand(ins.a)}, ${formatOperand(ins.b)}`;
			case 'TON':
			case 'TOF':
			case 'TP':
				return `${ins.op} T${ins.timer}, ${formatOperand(ins.pt)}`;
			case 'CTU':
			case 'CTD':
			case 'CTUD':
				return `${ins.op} C${ins.counter}, ${formatOperand(ins.pv)}`;
			case 'MOVE':
				return `MOVE ${formatOperand(ins.src)}, ${formatOperand(ins.dst)}`;
			case 'MATH':
				return `${ins.fn} ${formatOperand(ins.a)}, ${formatOperand(ins.b)}, ${formatOperand(ins.dst)}`;
			case 'JMP':
			case 'JMPC':
			case 'JMPCN':
				return `${ins.op} ${ins.target}`;
			case 'TAP':
			case 'LDT':
				return `${ins.op} ${ins.slot}`;
		}
	});
}
