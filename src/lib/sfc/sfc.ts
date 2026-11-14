/**
 * Sequential Function Chart (IEC 61131-3 SFC / GRAFCET): steps with actions, transitions with
 * conditions. The chart is translated to Structured Text, so it runs on the same compiler and VM
 * as everything else — the way many real tools implement SFC too.
 */
import { newId } from '#lib/ladder/model.js';

/** N: on while the step is active · S: set when the step activates · R: reset */
export type Qualifier = 'N' | 'S' | 'R';

export interface SfcAction {
	id: string;
	qualifier: Qualifier;
	/** a BOOL operand: symbol or address */
	operand: string;
}

export interface SfcStep {
	id: string;
	name: string;
	initial: boolean;
	actions: SfcAction[];
}

export interface SfcTransition {
	id: string;
	/** names of the steps that must all be active (more than one = convergence of parallel branches) */
	from: string[];
	/** names of the steps activated (more than one = parallel divergence) */
	to: string[];
	/** ST boolean expression; `Step.T` is the step's active time, `Step.X` its activity */
	condition: string;
}

export interface Sfc {
	steps: SfcStep[];
	transitions: SfcTransition[];
	/**
	 * Permanent logic in ST that runs every scan next to the chart (start / stop latch,
	 * conveyor, alarms …). May start with its own VAR blocks.
	 */
	logic: string;
}

export const sfcStep = (
	name: string,
	initial = false,
	actions: [Qualifier, string][] = []
): SfcStep => ({
	id: newId('s'),
	name,
	initial,
	actions: actions.map(([qualifier, operand]) => ({ id: newId('a'), qualifier, operand }))
});

export const sfcTransition = (
	from: string | string[],
	to: string | string[],
	condition: string
): SfcTransition => ({
	id: newId('t'),
	from: Array.isArray(from) ? from : [from],
	to: Array.isArray(to) ? to : [to],
	condition
});

export const emptySfc = (): Sfc => ({
	steps: [sfcStep('Init', true)],
	transitions: [],
	logic: ''
});

const NAME_RE = /^[A-Za-z][A-Za-z0-9_]{0,23}$/;
export const stepVar = (name: string) => `X_${name}`;
export const stepTimer = (name: string) => `T_${name}`;

export interface SfcIssue {
	/** step or transition id */
	id: string;
	message: string;
}

export function checkSfc(sfc: Sfc): SfcIssue[] {
	const issues: SfcIssue[] = [];
	const names = new Set<string>();
	for (const s of sfc.steps) {
		if (!NAME_RE.test(s.name))
			issues.push({
				id: s.id,
				message: `Krok „${s.name}”: nazwa z liter, cyfr i _ (zaczyna się literą)`
			});
		else if (names.has(s.name.toUpperCase()))
			issues.push({ id: s.id, message: `Dwa kroki o nazwie „${s.name}”` });
		names.add(s.name.toUpperCase());
		for (const a of s.actions)
			if (!a.operand.trim())
				issues.push({ id: s.id, message: `Krok „${s.name}”: akcja bez operandu` });
	}
	if (sfc.steps.length && !sfc.steps.some((s) => s.initial))
		issues.push({ id: sfc.steps[0].id, message: 'Brak kroku początkowego (zaznacz „początkowy”)' });
	sfc.transitions.forEach((t, i) => {
		const label = `Przejście ${i + 1}`;
		for (const n of [...t.from, ...t.to])
			if (!names.has(n.toUpperCase()))
				issues.push({ id: t.id, message: `${label}: nie ma kroku „${n}”` });
		if (!t.from.length || !t.to.length)
			issues.push({ id: t.id, message: `${label}: wybierz krok źródłowy i docelowy` });
		if (!t.condition.trim()) issues.push({ id: t.id, message: `${label}: brak warunku` });
	});
	return issues;
}

/** `Fill.T` → `T_Fill.ET`, `Fill.X` → `X_Fill` for every step name. */
export function expandCondition(cond: string, steps: readonly SfcStep[]): string {
	let out = cond;
	for (const s of steps) {
		out = out
			.replace(new RegExp(`\\b${s.name}\\.T\\b`, 'gi'), `${stepTimer(s.name)}.ET`)
			.replace(new RegExp(`\\b${s.name}\\.X\\b`, 'gi'), stepVar(s.name));
	}
	return out;
}

/** Leading VAR … END_VAR blocks of the permanent logic, and the statements after them. */
function splitLogic(logic: string): { vars: string; body: string } {
	const m = /^(\s*(?:\(\*[\s\S]*?\*\)\s*|\/\/[^\n]*\n\s*)*(?:VAR\b[\s\S]*?\bEND_VAR\s*)+)/i.exec(
		logic
	);
	return m ? { vars: m[1], body: logic.slice(m[1].length) } : { vars: '', body: logic };
}

export interface GeneratedSt {
	source: string;
	/** 1-based ST line → what it came from (for error messages) */
	origin: (string | null)[];
}

/** Translates the chart (plus permanent logic) into Structured Text. */
export function sfcToSt(sfc: Sfc): GeneratedSt {
	const lines: string[] = [];
	const origin: (string | null)[] = [null];
	const emit = (line: string, from: string | null = null) => {
		lines.push(line);
		origin.push(from);
	};
	const emitBlock = (text: string, from: string) => {
		for (const l of text.replace(/\s+$/, '').split('\n')) emit(l, from);
	};
	const { vars, body } = splitLogic(sfc.logic);
	const trName = (i: number) => `SFC_T${i + 1}`;

	emit('(* Wygenerowane z diagramu SFC *)');
	emit('VAR');
	for (const s of sfc.steps) {
		emit(`  ${stepVar(s.name)} : BOOL;`, `krok ${s.name}`);
		emit(`  ${stepTimer(s.name)} : TON;`, `krok ${s.name}`);
	}
	sfc.transitions.forEach((_, i) => emit(`  ${trName(i)} : BOOL;`));
	emit('  SFC_Ready : BOOL;');
	emit('END_VAR');
	if (vars.trim()) emitBlock(vars, 'logika stała');

	emit('// pierwszy cykl: aktywne kroki początkowe');
	emit('IF NOT SFC_Ready THEN');
	for (const s of sfc.steps.filter((x) => x.initial))
		emit(`  ${stepVar(s.name)} := TRUE;`, `krok ${s.name}`);
	emit('  SFC_Ready := TRUE;');
	emit('END_IF;');

	emit('// czas aktywności kroków (Krok.T)');
	for (const s of sfc.steps)
		emit(`${stepTimer(s.name)}(IN := ${stepVar(s.name)}, PT := T#24h);`, `krok ${s.name}`);

	emit('// przejścia: najpierw warunki na stanie z początku cyklu …');
	sfc.transitions.forEach((t, i) => {
		const from = t.from.map(stepVar);
		// alternative branches: an earlier transition from the same step has priority
		const earlier = sfc.transitions
			.slice(0, i)
			.map((u, j) => (u.from.some((n) => t.from.includes(n)) ? `NOT ${trName(j)}` : null))
			.filter(Boolean);
		const cond = expandCondition(t.condition.trim() || 'FALSE', sfc.steps);
		emit(
			`${trName(i)} := ${[...from, `(${cond})`, ...earlier].join(' AND ')};`,
			`przejście ${i + 1} (${t.from.join(', ')} → ${t.to.join(', ')})`
		);
	});
	emit('// … potem zmiana kroków');
	sfc.transitions.forEach((t, i) => {
		emit(`IF ${trName(i)} THEN`, `przejście ${i + 1}`);
		for (const n of t.from)
			if (!t.to.includes(n)) emit(`  ${stepVar(n)} := FALSE;`, `przejście ${i + 1}`);
		for (const n of t.to) emit(`  ${stepVar(n)} := TRUE;`, `przejście ${i + 1}`);
		emit('END_IF;');
	});

	emit('// akcje kroków');
	const plain = new Map<string, { operand: string; steps: string[] }>();
	for (const s of sfc.steps)
		for (const a of s.actions) {
			const op = a.operand.trim();
			if (!op) continue;
			if (a.qualifier === 'N') {
				const key = op.toUpperCase();
				const entry = plain.get(key) ?? { operand: op, steps: [] };
				entry.steps.push(s.name);
				plain.set(key, entry);
			} else {
				emit(
					`IF ${stepVar(s.name)} THEN ${op} := ${a.qualifier === 'S' ? 'TRUE' : 'FALSE'}; END_IF;`,
					`akcja ${a.qualifier} ${op} w kroku ${s.name}`
				);
			}
		}
	for (const { operand, steps } of plain.values())
		emit(`${operand} := ${steps.map(stepVar).join(' OR ')};`, `akcja N ${operand}`);

	if (body.trim()) {
		emit('// logika stała');
		emitBlock(body, 'logika stała');
	}
	return { source: lines.join('\n') + '\n', origin };
}

export function isSfc(v: unknown): v is Sfc {
	const s = v as Sfc;
	return (
		!!s &&
		Array.isArray(s.steps) &&
		Array.isArray(s.transitions) &&
		s.steps.every((x) => typeof x?.name === 'string' && Array.isArray(x.actions)) &&
		s.transitions.every(
			(t) => Array.isArray(t?.from) && Array.isArray(t?.to) && typeof t.condition === 'string'
		)
	);
}

/** A small demo chart: a start / stop latch and a two-step blinking sequence. */
export function demoSfc(): Sfc {
	return {
		steps: [
			sfcStep('Idle', true),
			sfcStep('On', false, [['N', 'Q0.0']]),
			sfcStep('Off', false, [['N', 'Q0.1']])
		],
		transitions: [
			sfcTransition('Idle', 'On', 'I0.0'),
			sfcTransition('On', 'Off', 'On.T >= T#1s'),
			sfcTransition('Off', 'Idle', 'I0.1'),
			sfcTransition('Off', 'On', 'Off.T >= T#1s')
		],
		logic: ''
	};
}
