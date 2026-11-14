/** Source span (character offsets) used for error messages. */
export interface Span {
	from: number;
	to: number;
}

export type BinaryOp =
	'OR' | 'XOR' | 'AND' | '=' | '<>' | '<' | '>' | '<=' | '>=' | '+' | '-' | '*' | '/' | 'MOD';

export type Expr = Span &
	(
		| { kind: 'number'; value: number; real: boolean }
		| { kind: 'bool'; value: boolean }
		| { kind: 'time'; value: number }
		| { kind: 'name'; name: string }
		| { kind: 'address'; text: string }
		| { kind: 'member'; object: string; member: string }
		/** element of an ARRAY: `a[i]`, or a member of one: `motors[i].Running` */
		| { kind: 'index'; array: string; index: Expr; member?: string }
		| { kind: 'unary'; op: 'NOT' | '-'; expr: Expr }
		| { kind: 'binary'; op: BinaryOp; left: Expr; right: Expr }
		/** Standard function call with positional arguments, e.g. MAX(a, b) or INT_TO_REAL(x). */
		| { kind: 'fcall'; name: string; args: Expr[] }
	);

/** Something that can be assigned to (a member: an input of a function block instance or a struct field). */
export type Target = Extract<Expr, { kind: 'name' | 'address' | 'member' | 'index' }>;

export interface Arg extends Span {
	name: string;
	value: Expr;
	/** `Q => target`: copy an output after the call */
	output?: boolean;
}

export type CaseLabel = Span &
	({ kind: 'value'; value: number } | { kind: 'range'; low: number; high: number });

export type Stmt = Span &
	(
		| { kind: 'assign'; target: Target; value: Expr }
		| { kind: 'call'; name: string; nameSpan: Span; args: Arg[]; index?: Expr }
		| { kind: 'if'; branches: { cond: Expr; body: Stmt[] }[]; otherwise: Stmt[] | null }
		| {
				kind: 'case';
				selector: Expr;
				cases: { labels: CaseLabel[]; body: Stmt[] }[];
				otherwise: Stmt[] | null;
		  }
		| { kind: 'for'; variable: Target; start: Expr; end: Expr; step: Expr | null; body: Stmt[] }
		| { kind: 'while'; cond: Expr; body: Stmt[] }
		| { kind: 'repeat'; body: Stmt[]; until: Expr }
		| { kind: 'exit' }
		| { kind: 'return' }
	);

export interface VarDecl extends Span {
	name: string;
	type: string;
	typeSpan: Span;
	at: string | null;
	init: Expr | null;
	/** ARRAY[low..high] OF type — `type` is the element type */
	dims?: { low: number; high: number };
	/** initial values of an array: `[1, 2, 3]` */
	initList?: Expr[];
	/** declared in VAR RETAIN: survives a restart of the CPU */
	retain?: boolean;
}

export interface StructType extends Span {
	name: string;
	fields: VarDecl[];
}

/** A user FUNCTION_BLOCK or FUNCTION. */
export interface Pou extends Span {
	kind: 'fb' | 'function';
	name: string;
	/** FUNCTION: type of the result */
	returnType: string | null;
	inputs: VarDecl[];
	outputs: VarDecl[];
	locals: VarDecl[];
	body: Stmt[];
}

export interface StProgram {
	vars: VarDecl[];
	body: Stmt[];
	types?: StructType[];
	pous?: Pou[];
	/** CYCLIC_INTERRUPT T#100ms … END_CYCLIC_INTERRUPT — runs at a fixed interval, like OB30 */
	cyclic?: { intervalMs: number; body: Stmt[] } & Span;
}
