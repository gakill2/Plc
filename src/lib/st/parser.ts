import type {
	Arg,
	BinaryOp,
	CaseLabel,
	Expr,
	Span,
	Pou,
	Stmt,
	StProgram,
	StructType,
	Target,
	VarDecl
} from './ast.js';
import { EVENT_OBS, type ErrorOb } from './ast.js';
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
	'END_PROGRAM',
	'END_FUNCTION_BLOCK',
	'END_FUNCTION',
	'CYCLIC_INTERRUPT',
	'END_CYCLIC_INTERRUPT',
	'ORGANIZATION_BLOCK',
	'END_ORGANIZATION_BLOCK',
	'END_F_PROGRAM'
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

	// global data blocks: `Recipes.Speed` becomes one name, so a DB field behaves like a global
	// variable (and `Recipes.Items[i].Temp` like an element of an array of structures)
	const dbs = new Map<string, string>();
	for (let i = 0; i + 1 < tokens.length; i++)
		if (
			tokens[i].kind === 'keyword' &&
			tokens[i].text === 'DATA_BLOCK' &&
			tokens[i + 1].kind === 'ident'
		)
			dbs.set(tokens[i + 1].text.toUpperCase(), tokens[i + 1].text);
	if (dbs.size) {
		const merged: Token[] = [];
		for (let i = 0; i < tokens.length; i++) {
			const t = tokens[i];
			const db = t.kind === 'ident' ? dbs.get(t.text.toUpperCase()) : undefined;
			const dot = tokens[i + 1];
			const field = tokens[i + 2];
			if (db && dot?.kind === 'op' && dot.text === '.' && field?.kind === 'ident') {
				merged.push({ ...t, text: `${db}.${field.text}`, to: field.to });
				i += 2;
			} else merged.push(t);
		}
		tokens = merged;
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
			case 'string':
				return { kind: 'string', value: t.text, from: t.from, to: t.to };
			case 'address':
				return { kind: 'address', text: t.text, from: t.from, to: t.to };
			case 'ident': {
				if (isOp('(')) {
					next();
					const args: Expr[] = [];
					if (!isOp(')')) {
						do args.push(expression());
						while (isOp(',') && next());
					}
					const close = expectOp(')');
					return { kind: 'fcall', name: t.text.toUpperCase(), args, from: t.from, to: close.to };
				}
				if (isOp('[')) return indexed(t);
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

	/** `a[i]` or `a[i].member`, with the name token already read */
	function indexed(t: Token): Extract<Expr, { kind: 'index' }> {
		next(); // [
		const index = expression();
		if (isOp(',')) fail('Only one-dimensional arrays are supported — use an array of a STRUCT');
		let close = expectOp(']');
		let member: string | undefined;
		if (isOp('.')) {
			next();
			close = expectIdent('a member name');
			member = close.text.toUpperCase();
		}
		return { kind: 'index', array: t.text, index, member, from: t.from, to: close.to };
	}

	function target(): Target {
		const t = next();
		if (t.kind === 'ident' && isOp('[')) return indexed(t);
		if (t.kind === 'ident' && isOp('.')) {
			next();
			const member = expectIdent('a member name');
			return {
				kind: 'member',
				object: t.text,
				member: member.text.toUpperCase(),
				from: t.from,
				to: member.to
			};
		}
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
				case 'VAR_INPUT':
				case 'VAR_OUTPUT':
					return fail('VAR blocks must come before the first statement');
				case 'CYCLIC_INTERRUPT':
				case 'END_CYCLIC_INTERRUPT':
				case 'ORGANIZATION_BLOCK':
				case 'END_ORGANIZATION_BLOCK':
					return fail(`${t.text} goes after the main program, at the end of the source`);
			}
			return fail(`Unexpected ${describe(t)}`);
		}

		// function block call: name(arg := value, …);  or  name[i](…);
		let callIndex: Expr | undefined;
		if (t.kind === 'ident' && isOp('[', peek(1))) {
			const save = pos;
			next();
			const el = indexed(t);
			if (isOp('(') && !el.member) callIndex = el.index;
			else pos = save;
		}
		if (t.kind === 'ident' && (callIndex || isOp('(', peek(1)))) {
			if (!callIndex) next();
			next();
			const args: Arg[] = [];
			if (!isOp(')')) {
				do {
					const name = expectIdent('a parameter name like IN or PT');
					if (isOp('=>')) {
						next();
						const value = target();
						args.push({
							name: name.text.toUpperCase(),
							value,
							output: true,
							from: name.from,
							to: value.to
						});
						continue;
					}
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
				...(callIndex ? { index: callIndex } : {}),
				...span(from)
			};
		}

		// assignment
		const variable = target();
		if (!isOp(':='))
			fail(
				`Expected ":=" after ${variable.kind === 'name' ? variable.name : variable.kind === 'member' ? `${variable.object}.${variable.member}` : variable.kind === 'index' ? `${variable.array}[…]` : variable.text}`
			);
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

	type Section = 'VAR' | 'VAR_INPUT' | 'VAR_OUTPUT';

	const arrayBound = (): number => {
		const negative = isOp('-') ? (next(), true) : false;
		const t = next();
		if (t.kind !== 'int') fail('Array bounds are whole numbers, e.g. ARRAY[1..10] OF INT', t);
		return negative ? -t.value! : t.value!;
	};

	/** `INT` or `ARRAY[1..10] OF INT`; the returned token is the element type */
	/** STRING or STRING[n] (default 16, at most 64 characters in the simulator) */
	function stringLen(type: Token): number | undefined {
		if (type.text.toUpperCase() !== 'STRING') return undefined;
		if (!isOp('[')) return 16;
		next();
		const n = peek();
		if (n.kind !== 'int' || n.value! < 1 || n.value! > 64)
			fail('A STRING length is a number from 1 to 64, e.g. STRING[20]');
		next();
		expectOp(']');
		return n.value!;
	}

	function typeSpec(what: string): {
		type: Token;
		dims?: { low: number; high: number };
		strLen?: number;
	} {
		if (!isKw('ARRAY')) {
			const type = expectIdent(what);
			const strLen = stringLen(type);
			return strLen ? { type, strLen } : { type };
		}
		const head = next();
		expectOp('[');
		const low = arrayBound();
		expectOp('..');
		const high = arrayBound();
		if (isOp(',')) fail('Only one-dimensional arrays are supported — use an array of a STRUCT');
		expectOp(']');
		expectKw('OF');
		if (isKw('ARRAY')) fail('An array of arrays is not supported — use an array of a STRUCT');
		const type = expectIdent('the element type, e.g. INT');
		const strLen = stringLen(type);
		if (high < low) fail(`The upper bound ${high} is below the lower bound ${low}`, head);
		return { type, dims: { low, high }, ...(strLen ? { strLen } : {}) };
	}

	/** `:= value`, or `:= [1, 2, 3]` for an array */
	function initial(array: boolean): { init: Expr | null; initList?: Expr[] } {
		if (!isOp(':=')) return { init: null };
		next();
		if (!isOp('[')) {
			const init = expression();
			if (array) fail('Initialise an array with a list in brackets, e.g. := [1, 2, 3]', peek(-1));
			return { init };
		}
		const open = next();
		if (!array) fail('A list in brackets initialises an ARRAY', open);
		const initList: Expr[] = [];
		if (!isOp(']')) {
			do initList.push(expression());
			while (isOp(',') && next());
		}
		expectOp(']');
		return { init: null, initList };
	}
	function varBlocks(allowed: Section[] = ['VAR']): (VarDecl & { section: Section })[] {
		const vars: (VarDecl & { section: Section })[] = [];
		while (isKw('VAR') || isKw('VAR_INPUT') || isKw('VAR_OUTPUT')) {
			const head = next();
			const section = head.text as Section;
			let retain = false;
			if (isKw('RETAIN')) {
				const r = next();
				retain = true;
				if (section !== 'VAR' || allowed.length > 1)
					errors.push(
						new StSyntaxError(
							'RETAIN is only allowed in the VAR block of the program — an instance is retentive when it is declared there',
							r.from,
							r.to
						)
					);
			}
			if (!allowed.includes(section))
				errors.push(
					new StSyntaxError(
						`${section} is only allowed in a FUNCTION_BLOCK or FUNCTION`,
						head.from,
						head.to
					)
				);
			while (!isKw('END_VAR') && peek().kind !== 'eof') {
				const start = pos;
				try {
					const name = expectIdent('a variable name');
					// a, b, c : BOOL;  — several names share one declaration
					const more: Token[] = [];
					while (isOp(',')) {
						next();
						more.push(expectIdent('a variable name'));
					}
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
					const { type, dims, strLen } = typeSpec('a type like BOOL, INT, REAL or TON');
					const { init, initList } = initial(!!dims);
					expectOp(';');
					if (at && more.length) fail('AT needs a single variable');
					if (at && dims) fail('An ARRAY cannot have an AT address');
					for (const n of [name, ...more])
						vars.push({
							name: n.text,
							type: type.text.toUpperCase(),
							typeSpan: { from: type.from, to: type.to },
							at,
							init,
							...(dims ? { dims } : {}),
							...(initList ? { initList } : {}),
							...(retain ? { retain } : {}),
							...(strLen ? { strLen } : {}),
							section,
							from: n.from,
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

	/* ---------- user types and POUs ---------- */

	const recover = (e: unknown) => {
		if (!(e instanceof StSyntaxError)) throw e;
		errors.push(e);
	};

	/** DATA_BLOCK Name  VAR [RETAIN] … END_VAR  END_DATA_BLOCK — a global data block. */
	function dataBlock(): VarDecl[] {
		next(); // DATA_BLOCK
		const name = expectIdent('the name of the data block');
		const fields = varBlocks(['VAR']).map((d) => {
			const out: VarDecl & { section?: string } = { ...d, name: `${name.text}.${d.name}` };
			delete out.section;
			return out as VarDecl;
		});
		if (!fields.length) fail(`DATA_BLOCK ${name.text} needs a VAR … END_VAR block with its fields`);
		expectKw('END_DATA_BLOCK');
		optionalSemicolon();
		return fields;
	}

	function typeBlock(): StructType[] {
		next(); // TYPE
		const out: StructType[] = [];
		while (peek().kind === 'ident') {
			const name = next();
			try {
				expectOp(':');
				expectKw('STRUCT');
				const fields: VarDecl[] = [];
				while (!isKw('END_STRUCT') && peek().kind !== 'eof') {
					const f = expectIdent('a field name');
					expectOp(':');
					const { type, dims, strLen } = typeSpec('a field type');
					const { init, initList } = initial(!!dims);
					expectOp(';');
					fields.push({
						name: f.text,
						type: type.text.toUpperCase(),
						typeSpan: { from: type.from, to: type.to },
						at: null,
						init,
						...(dims ? { dims } : {}),
						...(initList ? { initList } : {}),
						...(strLen ? { strLen } : {}),
						from: f.from,
						to: type.to
					});
				}
				expectKw('END_STRUCT');
				optionalSemicolon();
				out.push({ name: name.text, fields, from: name.from, to: name.to });
			} catch (e) {
				recover(e);
				while (peek().kind !== 'eof' && !isKw('END_STRUCT') && !isKw('END_TYPE')) next();
				if (isKw('END_STRUCT')) next();
				optionalSemicolon();
			}
		}
		try {
			expectKw('END_TYPE');
			optionalSemicolon();
		} catch (e) {
			recover(e);
		}
		return out;
	}

	function pou(): Pou {
		const head = next();
		const kind = head.text === 'FUNCTION_BLOCK' ? 'fb' : 'function';
		const name = expectIdent(kind === 'fb' ? 'a function block name' : 'a function name');
		let returnType: string | null = null;
		if (kind === 'function') {
			expectOp(':');
			returnType = expectIdent('a result type like INT or REAL').text.toUpperCase();
		}
		const decls = varBlocks(['VAR', 'VAR_INPUT', 'VAR_OUTPUT']);
		if (kind === 'function' && decls.some((d) => d.section === 'VAR_OUTPUT'))
			errors.push(
				new StSyntaxError(
					'A FUNCTION returns one value — use a FUNCTION_BLOCK for several outputs',
					name.from,
					name.to
				)
			);
		const body = statements();
		const end = kind === 'fb' ? 'END_FUNCTION_BLOCK' : 'END_FUNCTION';
		try {
			expectKw(end);
			optionalSemicolon();
		} catch (e) {
			recover(e);
			while (peek().kind !== 'eof' && !isKw(end)) next();
			if (isKw(end)) next();
		}
		const strip = (d: VarDecl & { section: Section }): VarDecl => {
			const out: VarDecl & { section?: Section } = { ...d };
			delete out.section;
			return out;
		};
		return {
			kind,
			name: name.text,
			returnType,
			inputs: decls.filter((d) => d.section === 'VAR_INPUT').map(strip),
			outputs: decls.filter((d) => d.section === 'VAR_OUTPUT').map(strip),
			locals: decls.filter((d) => d.section === 'VAR').map(strip),
			body,
			from: head.from,
			to: name.to
		};
	}

	const types: StructType[] = [];
	const pous: Pou[] = [];
	const dbVars: VarDecl[] = [];
	while (isKw('TYPE') || isKw('FUNCTION_BLOCK') || isKw('FUNCTION') || isKw('DATA_BLOCK')) {
		try {
			if (isKw('TYPE')) types.push(...typeBlock());
			else if (isKw('DATA_BLOCK')) dbVars.push(...dataBlock());
			else pous.push(pou());
		} catch (e) {
			recover(e);
			next();
		}
	}

	/* ---------- safety program (F_PROGRAM sections, put in front by the compiler) ---------- */

	let safety: StProgram['safety'];
	while (isKw('F_PROGRAM')) {
		const head = next();
		const fvars = varBlocks().map((d) => {
			const out: VarDecl & { section?: string } = { ...d };
			delete out.section;
			return out as VarDecl;
		});
		const fbody = statements();
		try {
			expectKw('END_F_PROGRAM');
		} catch (e) {
			if (e instanceof StSyntaxError) errors.push(e);
			else throw e;
			while (peek().kind !== 'eof' && !isKw('END_F_PROGRAM')) next();
			if (isKw('END_F_PROGRAM')) next();
		}
		safety = {
			vars: [...(safety?.vars ?? []), ...fvars],
			body: [...(safety?.body ?? []), ...fbody],
			from: safety?.from ?? head.from,
			to: tokens[Math.max(0, pos - 1)].to
		};
	}

	/* ---------- program ---------- */

	let wrapped = false;
	if (isKw('PROGRAM')) {
		next();
		if (peek().kind === 'ident') next();
		wrapped = true;
	}
	const vars = [...dbVars, ...varBlocks()].map((d) => {
		const out: VarDecl & { section?: string } = { ...d };
		delete out.section;
		return out as VarDecl;
	});
	const body = statements();
	let cyclic: StProgram['cyclic'];
	const obs: NonNullable<StProgram['obs']> = [];
	while (isKw('CYCLIC_INTERRUPT') || isKw('ORGANIZATION_BLOCK')) {
		if (isKw('ORGANIZATION_BLOCK')) {
			const head = next();
			try {
				const name = next();
				const ob = name.text.toUpperCase();
				if (name.kind !== 'ident' || !(ob in EVENT_OBS))
					fail('Known blocks: OB100 (startup), OB121 (programming error), OB80 (time error)', name);
				if (obs.some((o) => o.ob === ob)) fail(`${ob} is defined twice`, name);
				const body = statements();
				expectKw('END_ORGANIZATION_BLOCK');
				optionalSemicolon();
				obs.push({ ob: ob as ErrorOb, body, from: head.from, to: name.to });
			} catch (e) {
				recover(e);
				while (peek().kind !== 'eof' && !isKw('END_ORGANIZATION_BLOCK')) next();
				if (isKw('END_ORGANIZATION_BLOCK')) next();
			}
			continue;
		}
		if (cyclic)
			errors.push(
				new StSyntaxError('Only one CYCLIC_INTERRUPT is allowed', peek().from, peek().to)
			);
		const head = next();
		try {
			const t = next();
			if (t.kind !== 'time')
				fail('CYCLIC_INTERRUPT needs its interval, e.g. CYCLIC_INTERRUPT T#100ms', t);
			const ms = t.value!;
			if (ms < 10 || ms % 10 !== 0)
				fail('The interval must be a multiple of the 10 ms scan, e.g. T#100ms', t);
			const cbody = statements();
			expectKw('END_CYCLIC_INTERRUPT');
			optionalSemicolon();
			cyclic = { intervalMs: ms, body: cbody, from: head.from, to: head.to };
		} catch (e) {
			recover(e);
			while (peek().kind !== 'eof' && !isKw('END_CYCLIC_INTERRUPT')) next();
			if (isKw('END_CYCLIC_INTERRUPT')) next();
		}
	}
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

	return {
		program: {
			...(safety ? { safety } : {}),
			vars,
			body,
			types,
			pous,
			...(cyclic ? { cyclic } : {}),
			...(obs.length ? { obs } : {})
		},
		errors
	};
}
