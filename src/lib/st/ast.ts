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
		| { kind: 'unary'; op: 'NOT' | '-'; expr: Expr }
		| { kind: 'binary'; op: BinaryOp; left: Expr; right: Expr }
	);

/** Something that can be assigned to. */
export type Target = Extract<Expr, { kind: 'name' | 'address' }>;

export interface Arg extends Span {
	name: string;
	value: Expr;
}

export type CaseLabel = Span &
	({ kind: 'value'; value: number } | { kind: 'range'; low: number; high: number });

export type Stmt = Span &
	(
		| { kind: 'assign'; target: Target; value: Expr }
		| { kind: 'call'; name: string; nameSpan: Span; args: Arg[] }
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
}

export interface StProgram {
	vars: VarDecl[];
	body: Stmt[];
}
