import type { CmpOp } from '#lib/engine/index.js';
import { inputTap } from './compiler.js';
import type { Monitor } from './monitor.js';
import type { Coil, Element, Rung, Series } from './model.js';

/*
 * Plain-language (Polish) explanation of a ladder network — for learning. The text is generated
 * from the same series-parallel tree the compiler uses, so it always matches the program.
 * With a live monitor it also says what is blocking the power flow right now.
 */

/** "Start (I0.0)" — operand with its symbol / address, as it should be read. */
export type NameOf = (operand: string) => string;

export interface RungExplanation {
	/** Condition in words, e.g. "(Start LUB Motor) I NIE Stop". Empty = always true. */
	condition: string;
	/** One sentence per coil. */
	results: string[];
	/** Side effects of boxes in the middle of the rung (MOVE, MATH). */
	actions: string[];
}

const CMP_WORDS: Record<CmpOp, string> = {
	'==': '=',
	'<>': '≠',
	'<': '<',
	'>': '>',
	'<=': '≤',
	'>=': '≥'
};

const MATH_WORDS: Record<string, string> = {
	ADD: '+',
	SUB: '−',
	MUL: '·',
	DIV: '/',
	MOD: 'mod',
	MIN: 'min',
	MAX: 'max',
	WAND: 'AND',
	WOR: 'OR',
	WXOR: 'XOR',
	SHL: '<<',
	SHR: '>>'
};

const time = (pt: string) => {
	const m = /^T(?:IME)?#(.+)$/i.exec(pt.trim());
	return m ? m[1].replace(/_/g, ' ') : `${pt} ms`;
};

export function explainRung(rung: Rung, name: NameOf): RungExplanation {
	const actions: string[] = [];

	const group = (text: string) =>
		/ (I|LUB) /.test(text) && !/^\([^()]*\)$/.test(text) ? `(${text})` : text;

	function series(s: Series): string {
		let acc = '';
		const and = (part: string) => (acc = acc ? `${acc} I ${group(part)}` : part);
		const so = () => (acc ? group(acc) : 'zasilanie');
		for (const el of s.items) {
			switch (el.kind) {
				case 'contact':
					and(
						el.type === 'NO'
							? name(el.operand)
							: el.type === 'NC'
								? `NIE ${name(el.operand)}`
								: el.type === 'P'
									? `zbocze narastające ${name(el.operand)} (0→1, przez jeden cykl)`
									: `zbocze opadające ${name(el.operand)} (1→0, przez jeden cykl)`
					);
					break;
				case 'compare':
					and(`${name(el.a)} ${CMP_WORDS[el.cmp]} ${name(el.b)}`);
					break;
				case 'parallel': {
					const branches = el.branches.map((b) => series(b) || 'zawsze');
					and(branches.length > 1 ? `(${branches.join(' LUB ')})` : branches[0]);
					break;
				}
				case 'timer': {
					const t = time(el.pt);
					const timerName = name(el.timer);
					acc =
						el.type === 'TON'
							? `${so()} trwa nieprzerwanie co najmniej ${t} (${timerName}, opóźnione załączenie)`
							: el.type === 'TOF'
								? `${so()} — oraz jeszcze przez ${t} po zaniku (${timerName}, opóźnione wyłączenie)`
								: `impuls ${t} po pojawieniu się: ${so()} (${timerName})`;
					break;
				}
				case 'counter': {
					const c = name(el.counter);
					const reset = el.reset.trim()
						? `; ${el.type === 'CTU' ? 'kasowanie' : 'ładowanie'}: ${name(el.reset)}`
						: '';
					acc =
						el.type === 'CTU'
							? `${so()} wystąpiło co najmniej ${name(el.pv)} razy (licznik ${c} liczy zbocza narastające${reset})`
							: `licznik ${c} doliczył w dół do 0 od ${name(el.pv)} (każde wystąpienie: ${so()}${reset})`;
					break;
				}
				case 'move':
					actions.push(`kopiuje ${name(el.src)} do ${name(el.dst)}`);
					break;
				case 'math':
					actions.push(
						`liczy ${name(el.dst)} := ${name(el.a)} ${MATH_WORDS[el.fn] ?? el.fn} ${name(el.b)}`
					);
					break;
			}
		}
		return acc;
	}

	const condition = series(rung.logic);
	const when = condition || 'zawsze (network nie ma warunków)';
	const results = rung.coils.map((c) =>
		coilSentence(c, name, condition ? `gdy ${condition}` : when)
	);
	return { condition, results, actions };
}

function coilSentence(c: Coil, name: NameOf, when: string): string {
	const o = name(c.operand);
	switch (c.type) {
		case 'COIL':
			return `${o} = 1 ${when}; w przeciwnym razie 0 (w każdym cyklu).`;
		case 'NCOIL':
			return `${o} = 0 ${when}; w przeciwnym razie 1 (cewka zanegowana).`;
		case 'SET':
			return `${capital(when)} ${o} zostaje ustawione na 1 i zostaje tak (pamięć), aż skasuje je RESET.`;
		case 'RESET':
			return `${capital(when)} ${o} zostaje skasowane na 0 (w przeciwnym razie nie zmienia się).`;
	}
}

const capital = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) + ',' : s);

/* ---------- live: why does (or doesn't) power flow? ---------- */

/**
 * What stops the power in a network right now — the first open element in each failing path.
 * Empty when the power reaches the coils.
 */
export function blockers(rung: Rung, monitor: Monitor, name: NameOf): string[] {
	const power = (id: string | null) => monitor.power(id);

	function element(el: Element): string[] {
		if (el.kind === 'parallel') {
			const input = inputTap(el.id);
			const failing = el.branches.filter((b) => !power(b.id));
			if (failing.length < el.branches.length) return [];
			return failing.flatMap((b) => series(b, input));
		}
		return [why(el, monitor, name)];
	}

	function series(s: Series, inId: string | null): string[] {
		let feed = inId;
		for (const el of s.items) {
			if (!power(feed)) return []; // blocked earlier — reported already
			if (!power(el.id)) return element(el);
			feed = el.id;
		}
		return [];
	}

	return series(rung.logic, null);
}

function why(el: Exclude<Element, { kind: 'parallel' }>, m: Monitor, name: NameOf): string {
	const bit = (op: string) => (m.bit(op) ? 1 : 0);
	switch (el.kind) {
		case 'contact':
			if (el.type === 'NO')
				return `${name(el.operand)} = ${bit(el.operand)} — styk NO jest otwarty`;
			if (el.type === 'NC')
				return `${name(el.operand)} = ${bit(el.operand)} — styk NC jest otwarty`;
			return `${name(el.operand)}: w tym cyklu nie było zbocza ${el.type === 'P' ? '0→1' : '1→0'}`;
		case 'compare': {
			const a = m.number(el.a);
			const b = m.number(el.b);
			return `${name(el.a)} ${CMP_WORDS[el.cmp]} ${name(el.b)} nie jest spełnione (${a ?? '?'} vs ${b ?? '?'})`;
		}
		case 'timer': {
			const t = m.timer(el.timer);
			const et = t ? `${(t.et / 1000).toFixed(1)} s` : '?';
			return el.type === 'TON'
				? `${name(el.timer)} jeszcze odlicza (ET = ${et} z ${time(el.pt)})`
				: `${name(el.timer)}: wyjście Q = 0 (ET = ${et})`;
		}
		case 'counter': {
			const c = m.counter(el.counter);
			return `${name(el.counter)}: CV = ${c?.cv ?? '?'}, a próg PV = ${name(el.pv)}`;
		}
		case 'math':
			return `${el.fn}: błąd obliczenia (np. dzielenie przez zero) — ENO = 0`;
		case 'move':
			return 'MOVE nie przepuścił zasilania';
	}
}
