import type {
	Arg,
	BinaryOp,
	CaseLabel,
	Expr,
	Span,
	Stmt,
	StProgram,
	Target,
	VarDecl
} from './ast.js';
import { StSyntaxError, tokenize, type Token } from './lexer.js';

export interface ParseResult {
	program: StProgram;
	errors: StSyntaxError[];
}

/** Keywords that end a statement list. */
const BLOCK_END = new Set([
	'END_IF',
	'ELSIF',
	'ELSE',
	'END_CASE',
	'END_FOR',
	'END_WHILE',
	'UNTIL',
	'END_REPEAT',
	'END_PROGRAM'
]);

/**
 * Recursive-descent parser for a practical subset of IEC 61131-3 Structured Text.
 * After a syntax error it skips to the next `;` and carries on, so several errors can be
 * reported at once.
 */
export function parse(src: string): ParseResult {
	let tokens: Token[];
	try {
		tokens = tokenize(src);
	} catch (e) {
		if (e instanceof StSyntaxError) return { program: { vars: [], body: [] }, errors: [e] };
		throw e;
	}

	let pos = 0;
	const errors: StSyntaxError[] = [];

	const peek = (offset = 0) => tokens[Math.min(pos + offset, tokens.length - 1)];
	const next = () => {
		const t = tokens[pos];
		if (pos < tokens.length - 1) pos++;
		return t;
	};
	const isKw = (kw: string, t = peek()) => t.kind === 'keyword' && t.text === kw;
	const isOp = (op: string, t = peek()) => t.kind === 'op' && t.text === op;
	const fail = (message: string, t: Token = peek()): never => {
		throw new StSyntaxError(message, t.from, Math.max(t.to, t.from + 1));
	};
	const describe = (t: Token) => (t.kind === 'eof' ? 'end of program' : `"${t.text}"`);
	const expectKw = (kw: string) =>
		isKw(kw) ? next() : fail(`Expected ${kw}, found ${describe(peek())}`);
	const expectOp = (op: string) =>
		isOp(op) ? next() : fail(`Expected "${op}", found ${describe(peek())}`);
	const expectIdent = (what: string) =>
		peek().kind === 'ident' ? next() : fail(`Expected ${what}, found ${describe(peek())}`);
	const span = (from: number): Span => ({ from, to: tokens[Math.max(0, pos - 1)].to });

	/* ---------- expressions (lowest to highest precedence) ---------- */

	const binaryLevel = (ops: Record<string, BinaryOp>, nextLevel: () => Expr) => (): Expr => {
		let left = nextLevel();
		for (;;) {
			const t = peek();
			const op = (t.kind === 'op' || t.kind === 'keyword') && ops[t.text];
			if (!op) return left;
			next();
			const right = nextLevel();
			left = { kind: 'binary', op, left, right, from: left.from, to: right.to };
		}
	};

	function unary(): Expr {
		const t = peek();
		if (isKw('NOT') || isOp('-')) {
			next();
			const expr = unary();
			const op = t.text === 'NOT' ? 'NOT' : '-';
			return { kind: 'unary', op, expr, from: t.from, to: expr.to };
		}
		if (isOp('+')) {
			next();
			return unary();
		}
		return primary();
	}

	function primary(): Expr {
		const t = next();
		switch (t.kind) {
			case 'int':
			case 'real':
				return { kind: 'number', value: t.value!, real: t.kind === 'real', from: t.from, to: t.to };
			case 'time':
				return { kind: 'time', value: t.value!, from: t.from, to: t.to };
			case 'address':
				return { kind: 'address', text: t.text, from: t.from, to: t.to };
			case 'ident': {
				if (isOp('.')) {
					next();
					const member = expectIdent('a member name like Q or ET');
					return {
						kind: 'member',
						object: t.text,
						member: member.text.toUpperCase(),
						from: t.from,
						to: member.to
					};
				}
				return { kind: 'name', name: t.text, from: t.from, to: t.to };
			}
			case 'keyword':
				if (t.text === 'TRUE' || t.text === 'FALSE') {
					return { kind: 'bool', value: t.text === 'TRUE', from: t.from, to: t.to };
				}
				break;
			case 'op':
				if (t.text === '(') {
					const inner = expression();
					const close = expectOp(')');
					return { ...inner, from: t.from, to: close.to };
				}
				break;
		}
		if (t.kind !== 'eof') pos--; // leave the token for error recovery (e.g. a ";")
		return fail(`Expected a value, found ${describe(t)}`, t);
	}

	const multiplicative = binaryLevel({ '*': '*', '/': '/', MOD: 'MOD' }, unary);
	const additive = binaryLevel({ '+': '+', '-': '-' }, multiplicative);
	const relational = binaryLevel({ '<': '<', '>': '>', '<=': '<=', '>=': '>=' }, additive);
	const equality = binaryLevel({ '=': '=', '<>': '<>' }, relational);
	const conjunction = binaryLevel({ AND: 'AND', '&': 'AND' }, equality);
	const exclusive = binaryLevel({ XOR: 'XOR' }, conjunction);
	const expression = binaryLevel({ OR: 'OR' }, exclusive);

	/* ---------- statements ---------- */

	function statements(): Stmt[] {
		const list: Stmt[] = [];
		while (peek().kind !== 'eof' && !(peek().kind === 'keyword' && BLOCK_END.has(peek().text))) {
			const start = pos;
			try {
				const s = statement();
				if (s) list.push(s);
			} catch (e) {
				if (!(e instanceof StSyntaxError)) throw e;
				errors.push(e);
				// recover: skip to the end of the statement
				if (pos === start) next();
				while (
					peek().kind !== 'eof' &&
					!isOp(';') &&
					!(peek().kind === 'keyword' && BLOCK_END.has(peek().text))
				)
					next();
				if (isOp(';')) next();
			}
		}
		return list;
	}

	function target(): Target {
		const t = next();
		if (t.kind === 'ident') return { kind: 'name', name: t.text, from: t.from, to: t.to };
		if (t.kind === 'address') return { kind: 'address', text: t.text, from: t.from, to: t.to };
		return fail(`Expected a variable, found ${describe(t)}`, t);
	}

	function statement(): Stmt | null {
		const t = peek();
		const from = t.from;
		if (isOp(';')) {
			next();
			return null;
		}
		if (t.kind === 'keyword') {
			switch (t.text) {
				case 'IF':
					return ifStatement();
				case 'CASE':
					return caseStatement();
				case 'FOR': {
					next();
					const variable = target();
					expectOp(':=');
					const start = expression();
					expectKw('TO');
					const end = expression();
					const step = isKw('BY') ? (next(), expression()) : null;
					expectKw('DO');
					const body = statements();
					expectKw('END_FOR');
					optionalSemicolon();
					return { kind: 'for', variable, start, end, step, body, ...span(from) };
				}
				case 'WHILE': {
					next();
					const cond = expression();
					expectKw('DO');
					const body = statements();
					expectKw('END_WHILE');
					optionalSemicolon();
					return { kind: 'while', cond, body, ...span(from) };
				}
				case 'REPEAT': {
					next();
					const body = statements();
					expectKw('UNTIL');
					const until = expression();
					expectKw('END_REPEAT');
					optionalSemicolon();
					return { kind: 'repeat', body, until, ...span(from) };
				}
				case 'EXIT':
				case 'RETURN':
					next();
					expectOp(';');
					return { kind: t.text === 'EXIT' ? 'exit' : 'return', ...span(from) };
				case 'VAR':
					return fail('VAR blocks must come before the first statement');
			}
			return fail(`Unexpected ${describe(t)}`);
		}

		// function block call: name(arg := value, …);
		if (t.kind === 'ident' && isOp('(', peek(1))) {
			next();
			next();
			const args: Arg[] = [];
			if (!isOp(')')) {
				do {
					const name = expectIdent('a parameter name like IN or PT');
					expectOp(':=');
					const value = expression();
					args.push({ name: name.text.toUpperCase(), value, from: name.from, to: value.to });
				} while (isOp(',') && next());
			}
			expectOp(')');
			expectOp(';');
			return {
				kind: 'call',
				name: t.text,
				nameSpan: { from: t.from, to: t.to },
				args,
				...span(from)
			};
		}

		// assignment
		const variable = target();
		if (!isOp(':='))
			fail(`Expected ":=" after ${variable.kind === 'name' ? variable.name : variable.text}`);
		next();
		const value = expression();
		expectOp(';');
		return { kind: 'assign', target: variable, value, ...span(from) };
	}

	function optionalSemicolon() {
		if (isOp(';')) next();
	}

	function ifStatement(): Stmt {
		const from = next().from;
		const branches: { cond: Expr; body: Stmt[] }[] = [];
		let otherwise: Stmt[] | null = null;
		const cond = expression();
		expectKw('THEN');
		branches.push({ cond, body: statements() });
		while (isKw('ELSIF')) {
			next();
			const c = expression();
			expectKw('THEN');
			branches.push({ cond: c, body: statements() });
		}
		if (isKw('ELSE')) {
			next();
			otherwise = statements();
		}
		expectKw('END_IF');
		optionalSemicolon();
		return { kind: 'if', branches, otherwise, ...span(from) };
	}

	function caseLabelValue(): number {
		const negative = isOp('-') ? (next(), true) : false;
		const t = next();
		if (t.kind !== 'int') {
			return fail('CASE labels must be integer constants');
		}
		return negative ? -t.value! : t.value!;
	}

	function caseStatement(): Stmt {
		const from = next().from;
		const selector = expression();
		expectKw('OF');
		const cases: { labels: CaseLabel[]; body: Stmt[] }[] = [];
		let otherwise: Stmt[] | null = null;
		while (!isKw('END_CASE') && !isKw('ELSE') && peek().kind !== 'eof') {
			const labels: CaseLabel[] = [];
			do {
				const start = peek().from;
				const low = caseLabelValue();
				if (isOp('..')) {
					next();
					const high = caseLabelValue();
					labels.push({ kind: 'range', low, high, ...span(start) });
				} else {
					labels.push({ kind: 'value', value: low, ...span(start) });
				}
			} while (isOp(',') && next());
			expectOp(':');
			cases.push({ labels, body: caseBody() });
		}
		if (isKw('ELSE')) {
			next();
			otherwise = statements();
		}
		expectKw('END_CASE');
		optionalSemicolon();
		return { kind: 'case', selector, cases, otherwise, ...span(from) };
	}

	/** Statements of one CASE branch: stop at the next label (`3:`, `4..6:`, `-1:`) as well. */
	function caseBody(): Stmt[] {
		const list: Stmt[] = [];
		const atLabel = () => {
			let k = 0;
			if (isOp('-', peek(k))) k++;
			if (peek(k).kind !== 'int') return false;
			const after = peek(k + 1);
			return isOp(':', after) || isOp('..', after) || isOp(',', after);
		};
		while (!isKw('END_CASE') && !isKw('ELSE') && peek().kind !== 'eof' && !atLabel()) {
			const start = pos;
			try {
				const s = statement();
				if (s) list.push(s);
			} catch (e) {
				if (!(e instanceof StSyntaxError)) throw e;
				errors.push(e);
				if (pos === start) next();
				while (peek().kind !== 'eof' && !isOp(';')) next();
				if (isOp(';')) next();
			}
		}
		return list;
	}

	/* ---------- declarations ---------- */

	function varBlocks(): VarDecl[] {
		const vars: VarDecl[] = [];
		while (isKw('VAR')) {
			next();
			while (!isKw('END_VAR') && peek().kind !== 'eof') {
				const start = pos;
				try {
					const name = expectIdent('a variable name');
					let at: string | null = null;
					if (isKw('AT')) {
						next();
						const a = next();
						if (a.kind !== 'address') {
							fail('AT must be followed by an address, e.g. AT %Q0.0');
						}
						at = a.text;
					}
					expectOp(':');
					const type = expectIdent('a type like BOOL, INT, REAL or TON');
					const init = isOp(':=') ? (next(), expression()) : null;
					expectOp(';');
					vars.push({
						name: name.text,
						type: type.text.toUpperCase(),
						typeSpan: { from: type.from, to: type.to },
						at,
						init,
						from: name.from,
						to: type.to
					});
				} catch (e) {
					if (!(e instanceof StSyntaxError)) throw e;
					errors.push(e);
					if (pos === start) next();
					while (peek().kind !== 'eof' && !isOp(';') && !isKw('END_VAR')) next();
					if (isOp(';')) next();
				}
			}
			try {
				expectKw('END_VAR');
			} catch (e) {
				if (e instanceof StSyntaxError) errors.push(e);
				else throw e;
			}
		}
		return vars;
	}

	/* ---------- program ---------- */

	let wrapped = false;
	if (isKw('PROGRAM')) {
		next();
		if (peek().kind === 'ident') next();
		wrapped = true;
	}
	const vars = varBlocks();
	const body = statements();
	if (wrapped) {
		try {
			expectKw('END_PROGRAM');
		} catch (e) {
			if (e instanceof StSyntaxError) errors.push(e);
			else throw e;
		}
	}
	while (peek().kind !== 'eof') {
		const t = next();
		errors.push(new StSyntaxError(`Unexpected ${describe(t)}`, t.from, t.to));
		while (peek().kind !== 'eof' && !isOp(';')) next();
		if (isOp(';')) next();
		body.push(...statements());
	}

	return { program: { vars, body }, errors };
}
