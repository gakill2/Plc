import type { Completion, CompletionContext, CompletionResult } from '@codemirror/autocomplete';
import { StreamLanguage, type StreamParser } from '@codemirror/language';
import { KEYWORDS } from './lexer.js';

export const ST_TYPES = [
	'BOOL',
	'BYTE',
	'INT',
	'DINT',
	'REAL',
	'TIME',
	'TON',
	'TOF',
	'TP',
	'CTU',
	'CTD',
	'R_TRIG',
	'F_TRIG'
];
const TYPE_SET = new Set(ST_TYPES);

/** Syntax highlighting for Structured Text (a simple stream tokenizer). */
const parser: StreamParser<{ comment: boolean; afterDot: boolean }> = {
	name: 'structured-text',
	startState: () => ({ comment: false, afterDot: false }),
	token(stream, state) {
		if (state.comment) {
			if (stream.skipTo('*)')) {
				stream.match('*)');
				state.comment = false;
			} else {
				stream.skipToEnd();
			}
			return 'comment';
		}
		if (stream.eatSpace()) return null;
		if (stream.match('(*')) {
			state.comment = true;
			return 'comment';
		}
		if (stream.match('//')) {
			stream.skipToEnd();
			return 'comment';
		}
		const afterDot = state.afterDot;
		state.afterDot = false;

		if (stream.match(/^(TIME|T)#[\d._a-z]+/i) || stream.match(/^(2|8|16)#[0-9a-f_]+/i))
			return 'number';
		if (stream.match(/^\d[\d_]*(\.(?!\.)\d[\d_]*)?([eE][+-]?\d+)?/)) return 'number';
		if (
			stream.match(/^%[A-Za-z]+\d+(\.\d)?/) ||
			stream.match(/^[IQM][XBWD]?\d+(\.\d)?(?![A-Za-z0-9_])/) ||
			stream.match(/^[TC]\d+(?![A-Za-z0-9_])/)
		) {
			return 'atom';
		}
		const word = stream.match(/^[A-Za-z_][A-Za-z0-9_]*/);
		if (word) {
			const upper = (word as RegExpMatchArray)[0].toUpperCase();
			if (afterDot) return 'propertyName';
			if (upper === 'TRUE' || upper === 'FALSE') return 'bool';
			if (KEYWORDS.has(upper)) return 'keyword';
			if (TYPE_SET.has(upper)) return 'typeName';
			if (upper in FUNCTION_SIGNATURES && stream.match(/^\s*\(/, false))
				return 'variableName.function';
			return 'variableName';
		}
		if (stream.match(/^(:=|<>|<=|>=|\.\.|[-+*/=<>&])/)) return 'operator';
		if (stream.eat('.')) {
			state.afterDot = true;
			return 'punctuation';
		}
		stream.next();
		return null;
	},
	languageData: {
		commentTokens: { line: '//', block: { open: '(*', close: '*)' } }
	}
};

export const stLanguage = StreamLanguage.define(parser);

const FB_MEMBERS: Record<string, string[]> = {
	TON: ['Q', 'ET'],
	TOF: ['Q', 'ET'],
	TP: ['Q', 'ET'],
	CTU: ['Q', 'CV'],
	CTD: ['Q', 'CV'],
	R_TRIG: ['Q'],
	F_TRIG: ['Q']
};

const SNIPPET_KEYWORDS = [...KEYWORDS].map<Completion>((k) => ({ label: k, type: 'keyword' }));
const TYPE_COMPLETIONS = ST_TYPES.map<Completion>((t) => ({ label: t, type: 'type' }));

/** Standard functions: name → signature shown in the autocomplete. */
export const FUNCTION_SIGNATURES: Record<string, string> = {
	ABS: 'ABS(IN) — absolute value',
	MIN: 'MIN(IN1, IN2) — smaller value',
	MAX: 'MAX(IN1, IN2) — larger value',
	LIMIT: 'LIMIT(MN, IN, MX) — IN clamped to MN…MX',
	TRUNC: 'TRUNC(IN) — REAL → integer, drops the fraction',
	SHL: 'SHL(IN, N) — shift bits left',
	SHR: 'SHR(IN, N) — shift bits right',
	INT_TO_REAL: 'INT_TO_REAL(IN)',
	REAL_TO_INT: 'REAL_TO_INT(IN) — rounds',
	DINT_TO_REAL: 'DINT_TO_REAL(IN)',
	REAL_TO_DINT: 'REAL_TO_DINT(IN) — rounds',
	INT_TO_DINT: 'INT_TO_DINT(IN)',
	DINT_TO_INT: 'DINT_TO_INT(IN)',
	BOOL_TO_INT: 'BOOL_TO_INT(IN) — 0 or 1',
	INT_TO_BOOL: 'INT_TO_BOOL(IN) — TRUE if not 0',
	BYTE_TO_INT: 'BYTE_TO_INT(IN)',
	INT_TO_BYTE: 'INT_TO_BYTE(IN) — keeps the low 8 bits',
	TIME_TO_DINT: 'TIME_TO_DINT(IN) — milliseconds',
	DINT_TO_TIME: 'DINT_TO_TIME(IN) — from milliseconds'
};
const FUNCTION_COMPLETIONS = Object.entries(FUNCTION_SIGNATURES).map<Completion>(
	([label, detail]) => ({ label, type: 'function', detail, apply: `${label}(` })
);

export interface CompletionNames {
	symbols: { name: string; address: string }[];
	variables: { name: string; type: string }[];
}

/** Keywords, types, symbols and declared variables; members after `instance.` */
export function stCompletions(names: () => CompletionNames) {
	return (ctx: CompletionContext): CompletionResult | null => {
		const member = ctx.matchBefore(/[A-Za-z_][A-Za-z0-9_]*\.[A-Za-z_]*/);
		if (member) {
			const [object] = member.text.split('.');
			const v = names().variables.find((x) => x.name.toUpperCase() === object.toUpperCase());
			const members = v ? FB_MEMBERS[v.type] : undefined;
			if (!members) return null;
			return {
				from: member.from + object.length + 1,
				options: members.map((m) => ({ label: m, type: 'property', detail: v!.type }))
			};
		}
		const word = ctx.matchBefore(/[A-Za-z_][A-Za-z0-9_]*/);
		if (!word || (word.from === word.to && !ctx.explicit)) return null;
		const { symbols, variables } = names();
		return {
			from: word.from,
			options: [
				...variables.map<Completion>((v) => ({
					label: v.name,
					type: 'variable',
					detail: v.type,
					boost: 2
				})),
				...symbols.map<Completion>((s) => ({
					label: s.name,
					type: 'constant',
					detail: s.address,
					boost: 1
				})),
				...SNIPPET_KEYWORDS,
				...TYPE_COMPLETIONS,
				...FUNCTION_COMPLETIONS
			],
			validFor: /^[A-Za-z_][A-Za-z0-9_]*$/
		};
	};
}
