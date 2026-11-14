import { describe, expect, it } from 'vitest';
import { blockCatalog } from '#lib/st/stdlib.js';
import { box, boxTypes, fbdNetwork, type FbdValue } from './fbd.js';
import { explainNetwork, whyZero } from './explain.js';

const types = boxTypes(blockCatalog(''));
const names: Record<string, string> = { I0: 'Start', I1: 'Stop', Q0: 'Motor' };
const name = (op: string) => names[op] ?? op;

describe('FBD explanations', () => {
	const n = fbdNetwork({ kind: 'box', box: box('AND', [box('OR', ['I0', 'Q0']), ['I1', 'not']]) }, [
		['=', 'Q0']
	]);

	it('says what a network writes', () => {
		expect(explainNetwork(n, types, name)).toEqual(['Motor = (Start LUB Motor) I NIE Stop.']);
		const sr = fbdNetwork(
			{ kind: 'box', box: box('SR', [['I0', 'not'], 'I1'], { instance: 'P' }) },
			[['S', 'Q0']]
		);
		expect(explainNetwork(sr, types, name)[0]).toMatch(
			/^Gdy przerzutnik SR „P” \(ustawia: NIE Start, kasuje: Stop/
		);
	});

	it('online: which input blocks the result', () => {
		const values: Record<string, boolean> = { I0: false, Q0: false, I1: false };
		const live = (v: FbdValue) => {
			if (v.kind === 'operand') return values[v.text] ?? null;
			if (v.box.type === 'OR') return values.I0 || values.Q0;
			return (values.I0 || values.Q0) && !values.I1;
		};
		const why = whyZero(n, types, name, live);
		expect(why[0]).toBe('Bramka & ma 0 na: wynik bloku OR.');
		expect(why[1]).toMatch(/wszystkie wejścia mają 0 \(Start, Motor\)/);
		values.I0 = true;
		expect(whyZero(n, types, name, live)).toEqual([]);
	});
});
