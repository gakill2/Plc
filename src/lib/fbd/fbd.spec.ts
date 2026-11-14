import { describe, expect, it } from 'vitest';
import { Plc } from '#lib/engine/index.js';
import { compileSt } from '#lib/st/compiler.js';
import { blockCatalog, STDLIB } from '#lib/st/stdlib.js';
import {
	box,
	boxTypes,
	checkFbd,
	demoFbd,
	emptyFbd,
	fbdNetwork,
	fbdToSt,
	newBox,
	findType,
	type Fbd
} from './fbd.js';

const types = boxTypes(blockCatalog(''));

function run(fbd: Fbd) {
	expect(checkFbd(fbd, types)).toEqual([]);
	const gen = fbdToSt(fbd, types);
	const r = compileSt(gen.source, { prelude: STDLIB });
	expect(
		r.diagnostics.map((d) => d.message),
		gen.source
	).toEqual([]);
	const plc = new Plc();
	plc.load(r.program);
	plc.run();
	return {
		plc,
		gen,
		scan: (n = 1) => {
			for (let i = 0; i < n; i++) plc.scan(10);
		}
	};
}

describe('FBD', () => {
	it('the demo: SR flip-flop and a timer', () => {
		const { plc, scan } = run(demoFbd());
		plc.setInput('I0.0', true);
		scan();
		plc.setInput('I0.0', false);
		scan(100);
		expect(plc.getOutput('Q0.0')).toBe(true);
		expect(plc.getOutput('Q0.1')).toBe(false);
		scan(110);
		expect(plc.getOutput('Q0.1')).toBe(true);
		plc.setInput('I0.1', true);
		scan();
		expect(plc.getOutput('Q0.0')).toBe(false);
	});

	it('nested logic with negated inputs, S / R outputs and comparators', () => {
		const fbd: Fbd = {
			version: 1,
			networks: [
				fbdNetwork(
					{ kind: 'box', box: box('AND', [box('OR', ['I0.0', 'Q0.0']), ['I0.1', 'not']]) },
					[['=', 'Q0.0']]
				),
				fbdNetwork({ kind: 'box', box: box('GT', [box('ADD', ['IW4', '100']), '500']) }, [
					['S', 'Q0.1']
				]),
				fbdNetwork(
					{ kind: 'box', box: box('MOVE', ['I0.2', '42'], { outputs: { OUT: 'MW10' } }) },
					[['R', 'Q0.1']]
				)
			]
		};
		const { plc, scan } = run(fbd);
		plc.setInput('I0.0', true);
		scan();
		plc.setInput('I0.0', false);
		scan();
		expect(plc.getOutput('Q0.0')).toBe(true);
		plc.setInput('I0.1', true);
		scan();
		expect(plc.getOutput('Q0.0')).toBe(false);
		plc.setInputNumber('IW4', 450);
		scan();
		expect(plc.getOutput('Q0.1')).toBe(true);
		plc.setInputNumber('IW4', 0);
		scan();
		expect(plc.getOutput('Q0.1')).toBe(true); // set stays
		plc.setInput('I0.2', true);
		scan();
		expect(plc.getOutput('Q0.1')).toBe(false);
		expect(plc.memory.readNumber({ area: 'M', size: 'W', byte: 10, bit: 0 })).toBe(42);
	});

	it('counters with CV out and a library block (SCALE)', () => {
		const fbd: Fbd = {
			version: 1,
			networks: [
				fbdNetwork(
					{
						kind: 'box',
						box: box('CTU', ['I0.0', 'I0.1', '3'], { instance: 'Parts', outputs: { CV: 'MW20' } })
					},
					[['=', 'Q0.0']]
				),
				fbdNetwork(
					{
						kind: 'box',
						box: box('SCALE', ['IW4', '0.0', '1000.0'], {
							instance: 'Lvl',
							names: ['IN', 'OUT_LO', 'OUT_HI'],
							outputs: {}
						})
					},
					[['=', 'MD30']]
				)
			]
		};
		const { plc, scan } = run(fbd);
		for (let k = 0; k < 3; k++) {
			plc.setInput('I0.0', true);
			scan();
			plc.setInput('I0.0', false);
			scan();
		}
		expect(plc.getOutput('Q0.0')).toBe(true);
		expect(plc.memory.readNumber({ area: 'M', size: 'W', byte: 20, bit: 0 })).toBe(3);
		plc.setInputNumber('IW4', 13824);
		scan();
		// MD30 is a DINT: the REAL result is stored rounded
		expect(plc.memory.readNumber({ area: 'M', size: 'D', byte: 30, bit: 0 })).toBe(500);
	});

	it('reports empty inputs, missing outputs and bad instance names', () => {
		const t = findType(types, 'TON')!;
		const fbd: Fbd = {
			version: 1,
			networks: [fbdNetwork({ kind: 'box', box: newBox(t, 'T1') }, []), ...emptyFbd().networks]
		};
		const messages = checkFbd(fbd, types).map((i) => i.message);
		expect(messages).toContain(
			'Network 1: TON potrzebuje nazwy instancji, np. Timer1 (nie adresu)'
		);
		expect(messages).toContain('Network 1: wejście IN bloku TON jest puste');
		expect(messages).toContain('Network 2: wejście jest puste');
		expect(messages).toContain('Network 2: wyjście bez operandu');
	});

	it('maps each box to the signal the editor shows online', () => {
		const { gen } = run(demoFbd());
		const [sr, ton] = demoFbd().networks.map((n) => (n.value.kind === 'box' ? n.value.box : null));
		expect(Object.values(gen.signals)).toEqual(['Run', 'Timer1.Q']);
		expect(sr && ton).toBeTruthy();
	});
});
