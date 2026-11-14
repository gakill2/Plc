/**
 * Explanations of FBD networks in plain words (the same style as the ladder explanations): what
 * a network writes and, online, why an output is 0 — which inputs of which box block it.
 */
import {
	findType,
	type BoxType,
	type Fbd,
	type FbdBox,
	type FbdNetwork,
	type FbdValue
} from './fbd.js';

type NameOf = (operand: string) => string;
type Live = (v: FbdValue) => boolean | number | null;

const WORDS: Record<string, string> = {
	AND: ' I ',
	OR: ' LUB ',
	XOR: ' XOR ',
	EQ: ' = ',
	NE: ' ≠ ',
	GT: ' > ',
	GE: ' ≥ ',
	LT: ' < ',
	LE: ' ≤ ',
	ADD: ' + ',
	SUB: ' − ',
	MUL: ' · ',
	DIV: ' / '
};

/** A value as words: `Start (I0.0) I NIE Stop (I0.1)`. */
export function describeValue(
	v: FbdValue,
	types: BoxType[],
	name: NameOf,
	negated = false
): string {
	const not = negated ? 'NIE ' : '';
	if (v.kind === 'operand') return `${not}${v.text.trim() ? name(v.text) : '?'}`;
	const b = v.box;
	const t = findType(types, b.type);
	const pin = (n: string) => {
		const p = b.inputs.find((x) => x.name === n);
		return p ? describeValue(p.value, types, name, p.negated) : '?';
	};
	let text: string;
	switch (t?.group) {
		case 'logic':
		case 'compare':
		case 'math':
			text = b.inputs
				.map((p) => {
					const inner = describeValue(p.value, types, name, p.negated);
					return p.value.kind === 'box' ? `(${inner})` : inner;
				})
				.join(WORDS[b.type] ?? ` ${b.type} `);
			break;
		case 'memory':
			text =
				b.type === 'SR' || b.type === 'RS'
					? `przerzutnik ${b.type} „${b.instance}” (ustawia: ${pin(b.type === 'SR' ? 'S1' : 'S')}, kasuje: ${pin(b.type === 'SR' ? 'R' : 'R1')}${b.type === 'SR' ? ', ważniejsze ustawianie' : ', ważniejsze kasowanie'})`
					: `${b.type === 'R_TRIG' ? 'zbocze narastające' : 'zbocze opadające'} ${pin('CLK')}`;
			break;
		case 'timer':
			text = `${b.type} „${b.instance}” (wejście: ${pin('IN')}, czas ${pin('PT')})`;
			break;
		case 'counter':
			text = `licznik ${b.type} „${b.instance}” (liczy: ${pin(b.type === 'CTU' ? 'CU' : 'CD')}, próg ${pin('PV')})`;
			break;
		case 'move':
			text = `MOVE (gdy ${pin('EN')}: ${b.outputs.OUT || '?'} := ${pin('IN')})`;
			break;
		default:
			text = `blok ${b.type} „${b.instance ?? ''}”`;
	}
	return `${not}${text}`;
}

/** What a network does: one sentence per output. */
export function explainNetwork(n: FbdNetwork, types: BoxType[], name: NameOf): string[] {
	const value = describeValue(n.value, types, name);
	const out = n.outputs
		.filter((o) => o.target.trim())
		.map((o) =>
			o.kind === '='
				? `${name(o.target)} = ${value}.`
				: o.kind === 'S'
					? `Gdy ${value}: ustaw ${name(o.target)} (zostaje 1).`
					: `Gdy ${value}: skasuj ${name(o.target)} (zostaje 0).`
		);
	return out.length ? out : value === '?' ? [] : [`Wynik: ${value}.`];
}

/**
 * Online: why the network's result is 0 — follows the boxes that give 0 down to the inputs that
 * block them (an AND with an input at 0, an OR with all inputs at 0, a timer still counting …).
 */
export function whyZero(n: FbdNetwork, types: BoxType[], name: NameOf, live: Live): string[] {
	const reasons: string[] = [];
	const on = (v: boolean | number | null) => v === true || (typeof v === 'number' && v !== 0);
	const effective = (v: FbdValue, negated?: boolean) => {
		const x = live(v);
		return x === null ? null : negated ? !on(x) : on(x);
	};
	const walk = (b: FbdBox) => {
		const t = findType(types, b.type);
		const zeroPins = b.inputs.filter((p) => effective(p.value, p.negated) === false);
		const label = (p: FbdBox['inputs'][number]) =>
			`${p.negated ? 'NIE ' : ''}${p.value.kind === 'operand' ? name(p.value.text) : `wynik bloku ${p.value.kind === 'box' ? p.value.box.type : ''}`}`;
		if (b.type === 'AND' && zeroPins.length) {
			reasons.push(`Bramka & ma 0 na: ${zeroPins.map(label).join(', ')}.`);
			for (const p of zeroPins) if (p.value.kind === 'box') walk(p.value.box);
		} else if (b.type === 'OR' && zeroPins.length === b.inputs.length) {
			reasons.push(`Bramka ≥1: wszystkie wejścia mają 0 (${b.inputs.map(label).join(', ')}).`);
			for (const p of zeroPins) if (p.value.kind === 'box') walk(p.value.box);
		} else if (t?.group === 'timer') {
			const inPin = b.inputs.find((p) => p.name === 'IN');
			if (inPin && effective(inPin.value, inPin.negated) === false)
				reasons.push(`Timer „${b.instance}”: wejście IN = 0.`);
			else reasons.push(`Timer „${b.instance}” jeszcze odlicza czas.`);
		} else if (t?.group === 'memory' && (b.type === 'SR' || b.type === 'RS'))
			reasons.push(
				`Przerzutnik „${b.instance}” jest skasowany — wejście ustawiające nie dało jeszcze 1 albo kasowanie ma pierwszeństwo.`
			);
		else if (t?.group === 'compare') reasons.push(`Porównanie ${b.type} nie jest spełnione.`);
	};
	if (n.value.kind === 'box' && effective(n.value) === false) walk(n.value.box);
	else if (n.value.kind === 'operand' && effective(n.value) === false)
		reasons.push(`${name(n.value.text)} = 0.`);
	return reasons;
}

export const networksOf = (fbd: Fbd) => fbd.networks;
