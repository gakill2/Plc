/**
 * Function Block Diagram (IEC 61131-3 FBD, "FUP" in Siemens): every network is a tree of boxes —
 * AND / OR, comparators, arithmetic, timers, counters, flip-flops and function blocks — whose
 * inputs are operands or other boxes, ending in one or more assignments on the right.
 *
 * Like SFC, the diagram is translated to Structured Text and runs on the same compiler and VM.
 * Every logic box stores its result in a hidden variable, so the editor can show the signal
 * flow online.
 */
import { newId } from '#lib/ladder/model.js';
import type { BlockInfo } from '#lib/st/stdlib.js';

export type FbdValue = { kind: 'operand'; text: string } | { kind: 'box'; box: FbdBox };

export interface FbdPin {
	name: string;
	value: FbdValue;
	/** negation circle on the input (BOOL inputs) */
	negated?: boolean;
}

export interface FbdBox {
	id: string;
	/** AND, OR, GT, ADD, TON, SR … or the name of a function block from the library */
	type: string;
	/** instance name: timers, counters, edges, flip-flops and function blocks */
	instance?: string;
	inputs: FbdPin[];
	/** extra outputs written to operands, e.g. ET → MD20 */
	outputs: Record<string, string>;
}

export type FbdAssign = '=' | 'S' | 'R';

export interface FbdOutput {
	id: string;
	kind: FbdAssign;
	target: string;
}

export interface FbdNetwork {
	id: string;
	comment: string;
	value: FbdValue;
	outputs: FbdOutput[];
}

export interface Fbd {
	version: 1;
	networks: FbdNetwork[];
}

/* ---------- the boxes ---------- */

export type BoxGroup =
	'logic' | 'compare' | 'math' | 'move' | 'timer' | 'counter' | 'memory' | 'fb';

export interface BoxType {
	type: string;
	group: BoxGroup;
	/** shown in the box header */
	label: string;
	title: string;
	inputs: { name: string; bool: boolean }[];
	/** outputs besides the main one, written to operands */
	extra: string[];
	/** the output that continues to the right; null: the box only writes its extra outputs */
	main: string | null;
	/** the number of inputs can grow (AND, OR, XOR) */
	variadic?: boolean;
	/** default instance name prefix — null: no instance */
	instance: string | null;
}

const logic = (type: string, title: string): BoxType => ({
	type,
	group: 'logic',
	label: type === 'AND' ? '&' : type === 'OR' ? '>=1' : 'X',
	title,
	inputs: [
		{ name: 'IN1', bool: true },
		{ name: 'IN2', bool: true }
	],
	extra: [],
	main: 'OUT',
	variadic: true,
	instance: null
});
const compare = (type: string, op: string, title: string): BoxType => ({
	type,
	group: 'compare',
	label: `CMP ${op}`,
	title,
	inputs: [
		{ name: 'IN1', bool: false },
		{ name: 'IN2', bool: false }
	],
	extra: [],
	main: 'OUT',
	instance: null
});
const math = (type: string, title: string): BoxType => ({
	type,
	group: 'math',
	label: type,
	title,
	inputs: [
		{ name: 'IN1', bool: false },
		{ name: 'IN2', bool: false }
	],
	extra: [],
	main: 'OUT',
	instance: null
});
const timer = (type: string, title: string): BoxType => ({
	type,
	group: 'timer',
	label: type,
	title,
	inputs: [
		{ name: 'IN', bool: true },
		{ name: 'PT', bool: false }
	],
	extra: ['ET'],
	main: 'Q',
	instance: 'Timer'
});

export const BOX_TYPES: BoxType[] = [
	logic('AND', 'AND — wszystkie wejścia 1'),
	logic('OR', 'OR — choć jedno wejście 1'),
	logic('XOR', 'XOR — nieparzysta liczba jedynek'),
	compare('EQ', '==', 'Równe'),
	compare('NE', '<>', 'Różne'),
	compare('GT', '>', 'Większe'),
	compare('GE', '>=', 'Większe lub równe'),
	compare('LT', '<', 'Mniejsze'),
	compare('LE', '<=', 'Mniejsze lub równe'),
	math('ADD', 'Dodawanie'),
	math('SUB', 'Odejmowanie'),
	math('MUL', 'Mnożenie'),
	math('DIV', 'Dzielenie'),
	{
		type: 'MOVE',
		group: 'move',
		label: 'MOVE',
		title: 'Przepisz IN na OUT, gdy EN = 1',
		inputs: [
			{ name: 'EN', bool: true },
			{ name: 'IN', bool: false }
		],
		extra: ['OUT'],
		main: 'ENO',
		instance: null
	},
	timer('TON', 'Opóźnione załączenie'),
	timer('TOF', 'Opóźnione wyłączenie'),
	timer('TP', 'Impuls'),
	{
		type: 'CTU',
		group: 'counter',
		label: 'CTU',
		title: 'Licznik w górę',
		inputs: [
			{ name: 'CU', bool: true },
			{ name: 'R', bool: true },
			{ name: 'PV', bool: false }
		],
		extra: ['CV'],
		main: 'Q',
		instance: 'Counter'
	},
	{
		type: 'CTD',
		group: 'counter',
		label: 'CTD',
		title: 'Licznik w dół',
		inputs: [
			{ name: 'CD', bool: true },
			{ name: 'LD', bool: true },
			{ name: 'PV', bool: false }
		],
		extra: ['CV'],
		main: 'Q',
		instance: 'Counter'
	},
	{
		type: 'SR',
		group: 'memory',
		label: 'SR',
		title: 'Przerzutnik, dominuje ustawianie (S1)',
		inputs: [
			{ name: 'S1', bool: true },
			{ name: 'R', bool: true }
		],
		extra: [],
		main: 'Q1',
		instance: 'Flag'
	},
	{
		type: 'RS',
		group: 'memory',
		label: 'RS',
		title: 'Przerzutnik, dominuje kasowanie (R1)',
		inputs: [
			{ name: 'S', bool: true },
			{ name: 'R1', bool: true }
		],
		extra: [],
		main: 'Q1',
		instance: 'Flag'
	},
	{
		type: 'R_TRIG',
		group: 'memory',
		label: 'R_TRIG',
		title: 'Zbocze narastające',
		inputs: [{ name: 'CLK', bool: true }],
		extra: [],
		main: 'Q',
		instance: 'Edge'
	},
	{
		type: 'F_TRIG',
		group: 'memory',
		label: 'F_TRIG',
		title: 'Zbocze opadające',
		inputs: [{ name: 'CLK', bool: true }],
		extra: [],
		main: 'Q',
		instance: 'Edge'
	}
];

/** The box types: the built-in ones and the function blocks of the catalog (SCALE, PID, own). */
export function boxTypes(catalog: BlockInfo[]): BoxType[] {
	return [
		...BOX_TYPES,
		...catalog.map((b): BoxType => ({
			type: b.name,
			group: 'fb',
			label: b.name,
			title: b.comment ?? `Blok funkcyjny ${b.name}`,
			inputs: b.inputs.map((p) => ({ name: p.name, bool: p.type.toUpperCase() === 'BOOL' })),
			extra: b.outputs.slice(1).map((p) => p.name),
			main: b.outputs[0]?.name ?? null,
			instance: b.name
		}))
	];
}

export function isFbd(v: unknown): v is Fbd {
	const f = v as Fbd;
	return (
		!!f &&
		f.version === 1 &&
		Array.isArray(f.networks) &&
		f.networks.every((n) => !!n?.value && Array.isArray(n.outputs))
	);
}

export const findType = (types: BoxType[], type: string) =>
	types.find((t) => t.type.toUpperCase() === type.toUpperCase());

/* ---------- construction ---------- */

export const operand = (text = ''): FbdValue => ({ kind: 'operand', text });

/** A new box; `first` becomes its first input (wrapping what was there). */
export function newBox(t: BoxType, instance?: string, first?: FbdValue): FbdBox {
	return {
		id: newId('b'),
		type: t.type,
		...(t.instance ? { instance: instance ?? `${t.instance}1` } : {}),
		inputs: t.inputs.map((p, i) => ({ name: p.name, value: i === 0 && first ? first : operand() })),
		outputs: Object.fromEntries(t.extra.map((o) => [o, '']))
	};
}

export const fbdNetwork = (value: FbdValue = operand(), outputs: [FbdAssign, string][] = []) => ({
	id: newId('f'),
	comment: '',
	value,
	outputs: outputs.map(([kind, target]) => ({ id: newId('o'), kind, target }))
});

export const emptyFbd = (): Fbd => ({ version: 1, networks: [fbdNetwork(operand(), [['=', '']])] });

/** Builds a box tree in code (lessons, demo): `box('AND', ['Start', 'Stop'])`. */
export function box(
	type: string,
	inputs: (string | FbdBox | [string | FbdBox, 'not'])[],
	opts: { instance?: string; outputs?: Record<string, string>; names?: string[] } = {}
): FbdBox {
	const t = findType(BOX_TYPES, type);
	const names =
		opts.names ??
		(t?.variadic ? inputs.map((_, i) => `IN${i + 1}`) : (t?.inputs ?? []).map((p) => p.name));
	return {
		id: newId('b'),
		type,
		...(opts.instance ? { instance: opts.instance } : {}),
		inputs: inputs.map((x, i) => {
			const [v, not] = Array.isArray(x) ? [x[0], true] : [x, false];
			return {
				name: names[i] ?? `IN${i + 1}`,
				value: typeof v === 'string' ? operand(v) : { kind: 'box', box: v },
				...(not ? { negated: true } : {})
			};
		}),
		outputs: { ...Object.fromEntries((t?.extra ?? []).map((o) => [o, ''])), ...opts.outputs }
	};
}

export function allBoxes(fbd: Fbd): FbdBox[] {
	const out: FbdBox[] = [];
	const walk = (v: FbdValue) => {
		if (v.kind !== 'box') return;
		out.push(v.box);
		v.box.inputs.forEach((p) => walk(p.value));
	};
	fbd.networks.forEach((n) => walk(n.value));
	return out;
}

/** A free instance name like Timer2. */
export function freeInstance(fbd: Fbd, prefix: string): string {
	const used = new Set(allBoxes(fbd).map((b) => (b.instance ?? '').toUpperCase()));
	let i = 1;
	while (used.has(`${prefix}${i}`.toUpperCase())) i++;
	return `${prefix}${i}`;
}

/* ---------- checks ---------- */

export interface FbdIssue {
	/** box, output or network id */
	id: string;
	message: string;
}

const NAME_RE = /^[A-Za-z_][A-Za-z0-9_]{0,23}$/;
/** An address-looking name (T1, C3, M0 …) would be read as an address in ST. */
const ADDRESS_LIKE = /^(%|[IQM][XBWD]?\d|[TC]\d+$)/i;

export function checkFbd(fbd: Fbd, types: BoxType[]): FbdIssue[] {
	const issues: FbdIssue[] = [];
	const instances = new Map<string, string>();
	fbd.networks.forEach((n, i) => {
		const where = `Network ${i + 1}`;
		const value = (v: FbdValue, what: string, id: string) => {
			if (v.kind === 'operand') {
				if (!v.text.trim()) issues.push({ id, message: `${where}: ${what} jest puste` });
				return;
			}
			const b = v.box;
			const t = findType(types, b.type);
			if (!t) {
				issues.push({ id: b.id, message: `${where}: nieznany blok ${b.type}` });
				return;
			}
			if (t.instance) {
				const name = (b.instance ?? '').trim();
				if (!NAME_RE.test(name) || ADDRESS_LIKE.test(name))
					issues.push({
						id: b.id,
						message: `${where}: ${b.type} potrzebuje nazwy instancji, np. ${t.instance}1 (nie adresu)`
					});
				else if (instances.has(name.toUpperCase()) && instances.get(name.toUpperCase()) !== b.type)
					issues.push({
						id: b.id,
						message: `${where}: nazwa ${name} jest już użyta dla innego bloku`
					});
				else instances.set(name.toUpperCase(), b.type);
			}
			for (const p of b.inputs) {
				// R / LD of counters and the pins of function blocks (they have defaults) may stay empty
				const optional =
					t.group === 'fb' ||
					(b.type === 'CTU' && p.name === 'R') ||
					(b.type === 'CTD' && p.name === 'LD');
				if (optional && p.value.kind === 'operand' && !p.value.text.trim()) continue;
				value(p.value, `wejście ${p.name} bloku ${b.type}`, b.id);
			}
		};
		value(n.value, 'wejście', n.id);
		for (const o of n.outputs)
			if (!o.target.trim()) issues.push({ id: o.id, message: `${where}: wyjście bez operandu` });
		if (n.outputs.length === 0 && (n.value.kind !== 'box' || !hasEffect(n.value.box, types)))
			issues.push({ id: n.id, message: `${where}: dodaj wyjście (=, S albo R)` });
	});
	return issues;
}

/** A box with its own effect even without an assignment: a timer writing ET, a MOVE, an FB … */
const hasEffect = (b: FbdBox, types: BoxType[]) => {
	const t = findType(types, b.type);
	return !!t && (t.instance !== null || Object.values(b.outputs).some((o) => o.trim()));
};

/* ---------- translation to ST ---------- */

export interface GeneratedFbd {
	source: string;
	/** 1-based line of the ST source → network id */
	origin: Record<number, string>;
	/** box id → the variable holding its output (BOOL boxes), or the instance output */
	signals: Record<string, string>;
}

const OPS: Record<string, string> = {
	AND: 'AND',
	OR: 'OR',
	XOR: 'XOR',
	EQ: '=',
	NE: '<>',
	GT: '>',
	GE: '>=',
	LT: '<',
	LE: '<=',
	ADD: '+',
	SUB: '-',
	MUL: '*',
	DIV: '/'
};

const paren = (s: string) => (/^[\w.%#]+$/.test(s) ? s : `(${s})`);

export function fbdToSt(fbd: Fbd, types: BoxType[]): GeneratedFbd {
	const vars: string[] = [];
	const declared = new Set<string>();
	const lines: { text: string; net: string | null }[] = [];
	const signals: Record<string, string> = {};
	let net: string | null = null;
	const emit = (text: string) => lines.push({ text, net });
	let hidden = 0;
	const declare = (name: string, type: string) => {
		if (declared.has(name.toUpperCase())) return;
		declared.add(name.toUpperCase());
		vars.push(`  ${name} : ${type};`);
	};

	const value = (v: FbdValue, negated = false): string => {
		const s = v.kind === 'operand' ? v.text.trim() || 'FALSE' : boxOut(v.box);
		return negated ? `NOT ${paren(s)}` : s;
	};
	const pin = (b: FbdBox, name: string) => {
		const p = b.inputs.find((x) => x.name.toUpperCase() === name.toUpperCase());
		return p ? value(p.value, p.negated) : 'FALSE';
	};
	const writeExtra = (b: FbdBox, from: (name: string) => string) => {
		for (const [name, target] of Object.entries(b.outputs))
			if (target.trim()) emit(`${target.trim()} := ${from(name)};`);
	};

	function boxOut(b: FbdBox): string {
		const t = findType(types, b.type);
		const inst = (b.instance ?? '').trim();
		if (!t) return 'FALSE';
		switch (t.group) {
			case 'logic': {
				const v = `FBD_${++hidden}`;
				declare(v, 'BOOL');
				const ins = b.inputs.map((p) => paren(value(p.value, p.negated)));
				emit(`${v} := ${ins.join(` ${OPS[t.type]} `)};`);
				signals[b.id] = v;
				return v;
			}
			case 'compare': {
				const v = `FBD_${++hidden}`;
				declare(v, 'BOOL');
				emit(`${v} := ${paren(pin(b, 'IN1'))} ${OPS[t.type]} ${paren(pin(b, 'IN2'))};`);
				signals[b.id] = v;
				return v;
			}
			case 'math':
				return `${paren(pin(b, 'IN1'))} ${OPS[t.type]} ${paren(pin(b, 'IN2'))}`;
			case 'move': {
				const v = `FBD_${++hidden}`;
				declare(v, 'BOOL');
				emit(`${v} := ${pin(b, 'EN')};`);
				const target = (b.outputs.OUT ?? '').trim();
				if (target) emit(`IF ${v} THEN ${target} := ${pin(b, 'IN')}; END_IF;`);
				signals[b.id] = v;
				return v;
			}
			case 'memory':
				if (t.type === 'SR' || t.type === 'RS') {
					declare(inst, 'BOOL');
					emit(
						t.type === 'SR'
							? `${inst} := ${paren(pin(b, 'S1'))} OR (${inst} AND NOT ${paren(pin(b, 'R'))});`
							: `${inst} := NOT ${paren(pin(b, 'R1'))} AND (${paren(pin(b, 'S'))} OR ${inst});`
					);
					signals[b.id] = inst;
					return inst;
				}
				break;
		}
		// timers, counters, edges and function blocks: an instance called with its pins
		declare(inst, t.type);
		const args = b.inputs
			.filter((p) => !(p.value.kind === 'operand' && !p.value.text.trim()))
			.map((p) => `${p.name} := ${value(p.value, p.negated)}`);
		emit(`${inst}(${args.join(', ')});`);
		writeExtra(b, (name) => `${inst}.${name}`);
		if (!t.main) return 'FALSE';
		signals[b.id] = `${inst}.${t.main}`;
		return `${inst}.${t.main}`;
	}

	fbd.networks.forEach((n, i) => {
		net = n.id;
		emit(`// Network ${i + 1}${n.comment ? `: ${n.comment.replace(/\n/g, ' ')}` : ''}`);
		const out = value(n.value);
		for (const o of n.outputs) {
			const target = o.target.trim();
			if (!target) continue;
			if (o.kind === '=') emit(`${target} := ${out};`);
			else emit(`IF ${out} THEN ${target} := ${o.kind === 'S' ? 'TRUE' : 'FALSE'}; END_IF;`);
		}
	});

	const head = vars.length ? ['VAR', ...vars, 'END_VAR', ''] : [];
	const origin: Record<number, string> = {};
	lines.forEach((l, i) => {
		if (l.net) origin[head.length + i + 1] = l.net;
	});
	return {
		source: [...head, ...lines.map((l) => l.text)].join('\n') + '\n',
		origin,
		signals
	};
}

/* ---------- demo ---------- */

/** Start / stop with an SR flip-flop (I0.0 sets, I0.1 resets) and a delayed lamp. */
export const demoFbd = (): Fbd => ({
	version: 1,
	networks: [
		{
			...fbdNetwork({ kind: 'box', box: box('SR', ['I0.0', 'I0.1'], { instance: 'Run' }) }, [
				['=', 'Q0.0']
			]),
			comment: 'Start ustawia, Stop kasuje'
		},
		{
			...fbdNetwork({ kind: 'box', box: box('TON', ['Q0.0', 'T#2s'], { instance: 'Timer1' }) }, [
				['=', 'Q0.1']
			]),
			comment: 'Lampka po 2 s pracy'
		}
	]
});
