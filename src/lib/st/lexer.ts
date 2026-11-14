import { parseTime } from '#lib/engine/index.js';

export type TokenKind = 'ident' | 'address' | 'int' | 'real' | 'time' | 'keyword' | 'op' | 'eof';

export interface Token {
	kind: TokenKind;
	/** Upper-cased for keywords; original text otherwise. */
	text: string;
	/** Numeric value of int / real / time (ms) literals. */
	value?: number;
	from: number;
	to: number;
}

export class StSyntaxError extends Error {
	override name = 'StSyntaxError';
	readonly from: number;
	readonly to: number;

	constructor(message: string, from: number, to: number) {
		super(message);
		this.from = from;
		this.to = to;
	}
}

export const KEYWORDS = new Set([
	'PROGRAM',
	'END_PROGRAM',
	'FUNCTION_BLOCK',
	'END_FUNCTION_BLOCK',
	'FUNCTION',
	'END_FUNCTION',
	'TYPE',
	'END_TYPE',
	'STRUCT',
	'END_STRUCT',
	'VAR',
	'VAR_INPUT',
	'VAR_OUTPUT',
	'RETAIN',
	'ARRAY',
	'CYCLIC_INTERRUPT',
	'END_CYCLIC_INTERRUPT',
	'ORGANIZATION_BLOCK',
	'END_ORGANIZATION_BLOCK',
	'END_VAR',
	'AT',
	'IF',
	'THEN',
	'ELSIF',
	'ELSE',
	'END_IF',
	'CASE',
	'OF',
	'END_CASE',
	'FOR',
	'TO',
	'BY',
	'DO',
	'END_FOR',
	'WHILE',
	'END_WHILE',
	'REPEAT',
	'UNTIL',
	'END_REPEAT',
	'EXIT',
	'RETURN',
	'AND',
	'OR',
	'XOR',
	'NOT',
	'MOD',
	'TRUE',
	'FALSE'
]);

const OPERATORS = [
	':=',
	'=>',
	'<>',
	'<=',
	'>=',
	'..',
	'(',
	')',
	'[',
	']',
	',',
	';',
	':',
	'.',
	'=',
	'<',
	'>',
	'+',
	'-',
	'*',
	'/',
	'&'
];

/*
 * Addresses are written in upper case (I0.0, MW10, T3) or with the IEC % prefix in any case
 * (%q0.0). That keeps lower-case names such as i1 or t1 free for variables.
 */
const ADDRESS_RE = /^([IQM][XBWD]?\d+|[TC]\d+)$/;
const BIT_ADDRESS_HEAD_RE = /^[IQM]X?\d+$/;
const norm = (w: string) => (w.startsWith('%') ? w.slice(1).toUpperCase() : w);

/** Splits Structured Text into tokens. Throws StSyntaxError on unknown characters or bad literals. */
export function tokenize(src: string): Token[] {
	const tokens: Token[] = [];
	let i = 0;

	while (i < src.length) {
		const c = src[i];

		if (/\s/.test(c)) {
			i++;
			continue;
		}
		if (src.startsWith('(*', i)) {
			const end = src.indexOf('*)', i + 2);
			if (end < 0) throw new StSyntaxError('Comment is not closed with *)', i, src.length);
			i = end + 2;
			continue;
		}
		if (src.startsWith('//', i)) {
			while (i < src.length && src[i] !== '\n') i++;
			continue;
		}

		const start = i;

		// time literal: T#1s, TIME#1m30s, t#1s_500ms
		const time = /^(?:TIME|T)#[\d._a-z]+/i.exec(src.slice(i));
		if (time) {
			i += time[0].length;
			const text = time[0];
			const normalized = 'T#' + text.slice(text.indexOf('#') + 1).replace(/_/g, '');
			try {
				tokens.push({ kind: 'time', text, value: parseTime(normalized), from: start, to: i });
			} catch {
				throw new StSyntaxError(`Invalid time literal ${text} — e.g. T#2s or T#1m30s`, start, i);
			}
			continue;
		}

		// based integers: 16#FF, 2#1010_0101, 8#17
		const based = /^(2|8|16)#([0-9a-f_]+)/i.exec(src.slice(i));
		if (based) {
			i += based[0].length;
			const value = parseInt(based[2].replace(/_/g, ''), Number(based[1]));
			if (Number.isNaN(value)) throw new StSyntaxError(`Invalid number ${based[0]}`, start, i);
			tokens.push({ kind: 'int', text: based[0], value, from: start, to: i });
			continue;
		}

		// decimal numbers (a ".." range operator must not be read as a decimal point)
		const num = /^\d[\d_]*(\.(?!\.)\d[\d_]*)?([eE][+-]?\d+)?/.exec(src.slice(i));
		if (num) {
			i += num[0].length;
			const real = num[1] !== undefined || num[2] !== undefined;
			tokens.push({
				kind: real ? 'real' : 'int',
				text: num[0],
				value: Number(num[0].replace(/_/g, '')),
				from: start,
				to: i
			});
			continue;
		}

		// identifiers, keywords and addresses (I0.0, %Q1.2, MW10, T3)
		if (/[A-Za-z_%]/.test(c)) {
			if (c === '%') i++;
			while (i < src.length && /[A-Za-z0-9_]/.test(src[i])) i++;
			let word = src.slice(start, i);
			if (BIT_ADDRESS_HEAD_RE.test(norm(word)) && src[i] === '.' && /\d/.test(src[i + 1] ?? '')) {
				i += 2;
				word = src.slice(start, i);
				const text = norm(word)
					.toUpperCase()
					.replace(/^([IQM])X/, '$1');
				tokens.push({ kind: 'address', text, from: start, to: i });
				continue;
			}
			if (ADDRESS_RE.test(norm(word))) {
				tokens.push({ kind: 'address', text: norm(word), from: start, to: i });
				continue;
			}
			if (word.startsWith('%')) throw new StSyntaxError(`Invalid direct address ${word}`, start, i);
			const upper = word.toUpperCase();
			tokens.push({
				kind: KEYWORDS.has(upper) ? 'keyword' : 'ident',
				text: KEYWORDS.has(upper) ? upper : word,
				from: start,
				to: i
			});
			continue;
		}

		const op = OPERATORS.find((o) => src.startsWith(o, i));
		if (op) {
			i += op.length;
			tokens.push({ kind: 'op', text: op, from: start, to: i });
			continue;
		}

		throw new StSyntaxError(`Unexpected character "${c}"`, i, i + 1);
	}

	tokens.push({ kind: 'eof', text: '', from: src.length, to: src.length });
	return tokens;
}
