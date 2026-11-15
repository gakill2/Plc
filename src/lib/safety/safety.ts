/*
 * The safety part of an F-CPU (Siemens Safety Integrated, in the spirit of it): a separate safety
 * program that runs before the standard program, fail-safe inputs evaluated in two channels with
 * a discrepancy time, passivation on a fault and reintegration only after an acknowledgement,
 * fail-safe outputs that the standard program cannot write, and a collective signature that
 * changes with every change of the safety program.
 *
 * The safety program is ST with a restricted instruction set (no loops, no CASE, no arrays, no
 * REAL) and the F-instructions ESTOP1 and FDBACK, like the F-LAD / F-FBD subset in TIA Portal.
 */
import type { Stmt, StProgram, Target, VarDecl } from '#lib/st/ast.js';

/** A two-channel fail-safe input (1oo2 evaluation, both contacts NC: 1 = safe to run). */
export interface FInput {
	/** name of the F-value in the safety program, e.g. F_EStop */
	name: string;
	ch1: string;
	ch2: string;
	discrepancyMs: number;
}

export interface SafetyConfig {
	inputs: FInput[];
	/** fail-safe outputs (addresses or symbols): only the safety program writes them */
	outputs: string[];
	/** acknowledgement for the reintegration of a passivated F-input (standard input / marker) */
	ackRei: string;
	/** the safety program (restricted ST) */
	program: string;
}

/** The F-instructions and the F-input driver, compiled as library blocks. */
export const SAFETY_LIB = `FUNCTION_BLOCK F_1OO2
(* F-DI pair, equivalent evaluation. Discrepancy longer than DISC_TIME: passivation (Q = 0,
   QBAD = 1). Reintegration after the channels agree again and ACK_REI. *)
VAR_INPUT
  CH1 : BOOL;
  CH2 : BOOL;
  DISC_TIME : TIME;
  ACK_REI : BOOL;
END_VAR
VAR_OUTPUT
  Q : BOOL;
  QBAD : BOOL;
  ACK_REQ : BOOL;
END_VAR
VAR
  disc : TON;
  ackEdge : R_TRIG;
  fault : BOOL;
END_VAR
disc(IN := CH1 XOR CH2, PT := DISC_TIME);
ackEdge(CLK := ACK_REI);
IF disc.Q THEN fault := TRUE; END_IF;
IF fault AND NOT (CH1 XOR CH2) AND ackEdge.Q THEN fault := FALSE; END_IF;
Q := NOT fault AND CH1 AND CH2;
QBAD := fault;
ACK_REQ := fault AND NOT (CH1 XOR CH2);
END_FUNCTION_BLOCK

FUNCTION_BLOCK ESTOP1
(* Emergency stop, stop category 0. Q = 0 at once when E_STOP = 0. With ACK_NEC the enable
   comes back only with a rising edge on ACK after the e-stop is released. *)
VAR_INPUT
  E_STOP : BOOL;
  ACK_NEC : BOOL;
  ACK : BOOL;
END_VAR
VAR_OUTPUT
  Q : BOOL;
  ACK_REQ : BOOL;
END_VAR
VAR
  ackEdge : R_TRIG;
END_VAR
ackEdge(CLK := ACK);
IF NOT E_STOP THEN
  Q := FALSE;
  ACK_REQ := FALSE;
ELSIF NOT Q THEN
  IF NOT ACK_NEC OR ackEdge.Q THEN
    Q := TRUE;
    ACK_REQ := FALSE;
  ELSE
    ACK_REQ := TRUE;
  END_IF;
END_IF;
END_FUNCTION_BLOCK

FUNCTION_BLOCK FDBACK
(* Feedback monitoring of a contactor. FEEDBACK is the NC readback contact: 1 = dropped out.
   It must follow Q within FDB_TIME, otherwise ERROR (latched, Q = 0) until ACK with the
   contactor dropped out. *)
VAR_INPUT
  ON : BOOL;
  FEEDBACK : BOOL;
  QBAD_FIO : BOOL;
  ACK : BOOL;
  FDB_TIME : TIME;
END_VAR
VAR_OUTPUT
  Q : BOOL;
  ERROR : BOOL;
  ACK_REQ : BOOL;
END_VAR
VAR
  wrong : TON;
  ackEdge : R_TRIG;
END_VAR
ackEdge(CLK := ACK);
wrong(IN := Q = FEEDBACK, PT := FDB_TIME);
IF wrong.Q THEN ERROR := TRUE; END_IF;
IF ERROR AND FEEDBACK AND ackEdge.Q THEN ERROR := FALSE; END_IF;
Q := ON AND NOT ERROR AND NOT QBAD_FIO;
ACK_REQ := ERROR AND FEEDBACK;
END_FUNCTION_BLOCK
`;

export const F_BLOCKS = ['ESTOP1', 'FDBACK'] as const;

const F_TYPES = new Set([
	'BOOL',
	'INT',
	'TIME',
	'TON',
	'TOF',
	'TP',
	'R_TRIG',
	'F_TRIG',
	...F_BLOCKS
]);

const timeLiteral = (ms: number) => `T#${Math.max(10, Math.round(ms))}ms`;

/**
 * The safety part as ST source: one generated section (the F-I/O drivers) and one with the
 * user's safety program. `userStart` is the offset of the user's program in `text`.
 */
export function safetySource(cfg: SafetyConfig): { text: string; userStart: number } {
	const decls = cfg.inputs.flatMap((i) => [
		`  ${i.name} : BOOL;`,
		`  ${i.name}_QBAD : BOOL;`,
		`  ${i.name}_ACK_REQ : BOOL;`,
		`  _fdi_${i.name} : F_1OO2;`
	]);
	const ack = cfg.ackRei.trim() || 'FALSE';
	const calls = cfg.inputs.flatMap((i) => [
		`_fdi_${i.name}(CH1 := ${i.ch1}, CH2 := ${i.ch2}, DISC_TIME := ${timeLiteral(i.discrepancyMs)}, ACK_REI := ${ack});`,
		`${i.name} := _fdi_${i.name}.Q;`,
		`${i.name}_QBAD := _fdi_${i.name}.QBAD;`,
		`${i.name}_ACK_REQ := _fdi_${i.name}.ACK_REQ;`
	]);
	const gen = `F_PROGRAM\n${decls.length ? `VAR\n${decls.join('\n')}\nEND_VAR\n` : ''}${calls.join('\n')}\nEND_F_PROGRAM\nF_PROGRAM\n`;
	return { text: `${gen}${cfg.program}\nEND_F_PROGRAM\n`, userStart: gen.length };
}

export interface SafetyIssue {
	/** offset in the source the span belongs to */
	from: number;
	to: number;
	message: string;
	/** the problem is in the safety program (not in the standard program) */
	safety: boolean;
}

function walk(stmts: Stmt[], visit: (s: Stmt) => void) {
	for (const s of stmts) {
		visit(s);
		if (s.kind === 'if') {
			for (const b of s.branches) walk(b.body, visit);
			if (s.otherwise) walk(s.otherwise, visit);
		} else if (s.kind === 'case') {
			for (const c of s.cases) walk(c.body, visit);
			if (s.otherwise) walk(s.otherwise, visit);
		} else if ('body' in s && Array.isArray(s.body)) walk(s.body as Stmt[], visit);
	}
}

const targetName = (t: Target) =>
	t.kind === 'name' ? t.name : t.kind === 'member' ? t.object : t.kind === 'index' ? t.array : null;

/**
 * The rules of an F-CPU: the safety program uses the restricted instruction set, and the standard
 * program neither writes the F-outputs nor the safety program's data.
 * `resolve` turns a symbol or address into a normalized address (null if it is not one).
 */
export function checkSafety(
	program: StProgram,
	outputs: string[],
	resolve: (text: string) => string | null
): SafetyIssue[] {
	const issues: SafetyIssue[] = [];
	const safety = program.safety;
	if (!safety) return issues;
	const fNames = new Set(safety.vars.map((v: VarDecl) => v.name.toUpperCase()));
	const fOut = new Set(outputs.map((o) => resolve(o)).filter((a): a is string => !!a));

	for (const v of safety.vars) {
		if (v.dims)
			issues.push({
				...v,
				message: `${v.name}: arrays are not allowed in the safety program`,
				safety: true
			});
		else if (!F_TYPES.has(v.type.toUpperCase()) && v.type !== 'F_1OO2')
			issues.push({
				...v.typeSpan,
				message: `${v.type} is not allowed in the safety program (BOOL, INT, TIME, timers, edges, ESTOP1, FDBACK)`,
				safety: true
			});
	}
	walk(safety.body, (s) => {
		if (s.kind !== 'assign' && s.kind !== 'call' && s.kind !== 'if')
			issues.push({
				from: s.from,
				to: s.to,
				message: `${s.kind.toUpperCase()} is not allowed in the safety program — only assignments, IF and F-instructions`,
				safety: true
			});
	});

	const writes = (t: Target) => {
		const name = targetName(t);
		if (name && fNames.has(name.toUpperCase()))
			return `${name} is safety data — the standard program may read it, not write it`;
		const text = t.kind === 'address' ? t.text : t.kind === 'name' ? t.name : null;
		const addr = text ? resolve(text) : null;
		if (addr && fOut.has(addr))
			return `${text} is a fail-safe output — only the safety program may switch it`;
		return null;
	};
	const standard = [
		...program.body,
		...(program.cyclic?.body ?? []),
		...(program.obs ?? []).flatMap((o) => o.body)
	];
	walk(standard, (s) => {
		if (s.kind === 'assign') {
			const m = writes(s.target);
			if (m) issues.push({ from: s.from, to: s.to, message: m, safety: false });
		} else if (s.kind === 'call') {
			if (fNames.has(s.name.toUpperCase()))
				issues.push({
					from: s.from,
					to: s.to,
					message: `${s.name} belongs to the safety program — the standard program cannot call it`,
					safety: false
				});
			for (const a of s.args)
				if (a.output && (a.value.kind === 'name' || a.value.kind === 'address')) {
					const m = writes(a.value);
					if (m) issues.push({ from: a.from, to: a.to, message: m, safety: false });
				}
		}
	});
	return issues;
}

/** CRC-32 of the safety program and its F-I/O settings: the collective signature. */
export function signature(cfg: SafetyConfig): string {
	const text = JSON.stringify({
		p: cfg.program
			.replace(/\/\/.*$/gm, '')
			.replace(/\s+/g, ' ')
			.trim(),
		i: cfg.inputs,
		o: cfg.outputs,
		a: cfg.ackRei
	});
	let crc = 0xffffffff;
	for (let i = 0; i < text.length; i++) {
		crc ^= text.charCodeAt(i);
		for (let k = 0; k < 8; k++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
	}
	return ((crc ^ 0xffffffff) >>> 0).toString(16).toUpperCase().padStart(8, '0');
}

export function isSafety(v: unknown): v is SafetyConfig {
	const o = v as SafetyConfig;
	return (
		typeof o === 'object' &&
		o !== null &&
		Array.isArray(o.inputs) &&
		Array.isArray(o.outputs) &&
		typeof o.program === 'string'
	);
}
