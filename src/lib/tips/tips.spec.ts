import { describe, expect, it } from 'vitest';
import { device, type Circuit } from '#lib/circuit/model.js';
import { coil, contact, parallel, rung, timer, type LadderProgram } from '#lib/ladder/model.js';
import { getChapter } from '#lib/tutorial/chapters.js';
import { splitTerms, TERMS } from './terms.js';
import { markTipSeen, nextTip, seenTips, TIPS, type TipInput } from './tips.js';

const circuit = (...devices: Circuit['devices']): Circuit => ({
	plc: { x: 0, y: 0 },
	devices,
	wires: []
});
const program = (...rungs: LadderProgram['rungs']): LadderProgram => ({ version: 1, rungs });
const input = (over: Partial<TipInput> = {}): TipInput => ({
	ladder: program(),
	circuit: circuit(),
	symbols: new Map([['Stop', 'I0.1']]),
	language: 'ladder',
	online: false,
	forces: 0,
	...over
});
const ids = (s: TipInput) => TIPS.filter((t) => t.when(s)).map((t) => t.id);

describe('tips', () => {
	it('link to existing chapters and have unique ids', () => {
		for (const t of TIPS) expect(getChapter(t.chapter), t.id).toBeTruthy();
		expect(new Set(TIPS.map((t) => t.id)).size).toBe(TIPS.length);
	});

	it('stay quiet on an empty project', () => {
		expect(ids(input())).toEqual([]);
	});

	it('react to what is in the program', () => {
		const s = input({
			ladder: program(
				rung(
					[parallel([[contact('NO', 'I0.0')], [contact('NO', 'Q0.0')]]), contact('NC', 'Stop')],
					[coil('SET', 'Q0.0')]
				),
				rung([contact('P', 'I0.2'), timer('TON', 'T0', 'T#3s')], [coil('COIL', 'Q0.1')]),
				rung([contact('NO', 'I0.3')], [coil('COIL', 'Q0.1')])
			)
		});
		expect(ids(s)).toEqual(
			expect.arrayContaining([
				'stop-nc-program',
				'branch',
				'double-coil',
				'set-reset',
				'edge',
				'timer'
			])
		);
	});

	it('warns about Stop wiring, not the program, when Stop is wired NO', () => {
		const stop = device('pushbutton', 'Stop', 0, 0);
		const s = input({
			circuit: circuit(stop),
			ladder: program(rung([contact('NC', 'I0.1')], [coil('COIL', 'Q0.0')]))
		});
		expect(ids(s)).toContain('stop-wired-no');
		expect(ids(s)).not.toContain('stop-nc-program');
	});

	it('shows each tip once', () => {
		const data = new Map<string, string>();
		const store = {
			getItem: (k: string) => data.get(k) ?? null,
			setItem: (k: string, v: string) => void data.set(k, v)
		};
		const s = input({ online: true, forces: 1 });
		expect(nextTip(s, seenTips(store))?.id).toBe('first-run');
		markTipSeen('first-run', store);
		expect(nextTip(s, seenTips(store))?.id).toBe('force');
	});
});

describe('terms', () => {
	it('mark whole abbreviations only', () => {
		const parts = splitTerms('Timer TON i styk NC, ale nie TONY ani NCX.');
		expect(parts.filter((p) => p.term).map((p) => p.t)).toEqual(['TON', 'NC']);
		expect(parts.map((p) => p.t).join('')).toBe('Timer TON i styk NC, ale nie TONY ani NCX.');
	});

	it('link to existing chapters', () => {
		for (const [k, t] of Object.entries(TERMS))
			if (t.chapter) expect(getChapter(t.chapter), k).toBeTruthy();
	});
});
