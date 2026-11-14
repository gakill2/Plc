import { describe, expect, it } from 'vitest';
import { RuntimeCore } from '#lib/runtime/core.js';
import { compileLadder } from './compiler.js';
import { demoProgram } from './defaults.js';
import { blockers, explainRung } from './explain.js';
import { createMonitor } from './monitor.js';
import {
	coil,
	compare,
	contact,
	counterBox,
	mathBox,
	moveBox,
	rung,
	timer,
	type Element
} from './model.js';

const names: Record<string, string> = { 'I0.0': 'Start', 'I0.1': 'Stop', 'Q0.0': 'Motor' };
const name = (op: string) => (names[op] ? `${names[op]} (${op})` : op);

describe('explainRung', () => {
	it('reads a self-holding circuit like a sentence', () => {
		const [motor] = demoProgram().rungs;
		const e = explainRung(motor, name);
		expect(e.condition).toBe('(Start (I0.0) LUB Motor (Q0.0)) I NIE Stop (I0.1)');
		expect(e.results).toEqual([
			'Motor (Q0.0) = 1 gdy (Start (I0.0) LUB Motor (Q0.0)) I NIE Stop (I0.1); w przeciwnym razie 0 (w każdym cyklu).'
		]);
	});

	it('timers, counters, compare, edges and latches', () => {
		const r = (...items: Element[]) => explainRung(rung(items, [coil('SET', 'M0.0')]), name);
		expect(r(contact('NO', 'I0.0'), timer('TON', 'T0', 'T#3s')).condition).toBe(
			'Start (I0.0) trwa nieprzerwanie co najmniej 3s (T0, opóźnione załączenie)'
		);
		expect(
			r(contact('NO', 'I0.0'), contact('NC', 'I0.1'), timer('TOF', 'T1', 'T#2s')).condition
		).toMatch(/^\(Start \(I0.0\) I NIE Stop \(I0.1\)\) — oraz jeszcze przez 2s po zaniku/);
		expect(r(timer('TP', 'T2', '500')).condition).toBe(
			'impuls 500 ms po pojawieniu się: zasilanie (T2)'
		);
		expect(r(contact('P', 'I0.0'), counterBox('CTU', 'C0', '5', 'I0.1')).condition).toMatch(
			/wystąpiło co najmniej 5 razy \(licznik C0 liczy zbocza narastające; kasowanie: Stop \(I0.1\)\)$/
		);
		expect(r(counterBox('CTD', 'C1', '3', '')).condition).toMatch(
			/^licznik C1 doliczył w dół do 0 od 3/
		);
		expect(r(compare('>=', 'MW0', '10'), contact('N', 'I0.1')).condition).toMatch(
			/^MW0 ≥ 10 I zbocze opadające Stop/
		);
		const set = r(contact('NO', 'I0.0'));
		expect(set.results[0]).toBe(
			'Gdy Start (I0.0), M0.0 zostaje ustawione na 1 i zostaje tak (pamięć), aż skasuje je RESET.'
		);
	});

	it('actions, negated and reset coils, an empty network', () => {
		const e = explainRung(
			rung(
				[moveBox('5', 'MW0'), mathBox('ADD', 'MW0', '1', 'MW2')],
				[coil('NCOIL', 'Q0.0'), coil('RESET', 'M0.0')]
			),
			name
		);
		expect(e.condition).toBe('');
		expect(e.actions).toEqual(['kopiuje 5 do MW0', 'liczy MW2 := MW0 + 1']);
		expect(e.results[0]).toBe(
			'Motor (Q0.0) = 0 zawsze (network nie ma warunków); w przeciwnym razie 1 (cewka zanegowana).'
		);
		expect(e.results[1]).toMatch(/^Zawsze \(network nie ma warunków\), M0.0 zostaje skasowane/);
	});
});

describe('blockers (live)', () => {
	it('names the open contacts that stop the power', () => {
		const ladder = demoProgram();
		const compiled = compileLadder(ladder);
		const core = new RuntimeCore();
		core.handle({ type: 'load', program: compiled.program });
		core.handle({ type: 'run' });
		core.tick(10);
		const live = () => createMonitor(core.snapshot(), compiled.taps);
		const [motor, running] = ladder.rungs;
		expect(blockers(motor, live(), name)).toEqual([
			'Start (I0.0) = 0 — styk NO jest otwarty',
			'Motor (Q0.0) = 0 — styk NO jest otwarty'
		]);

		core.handle({ type: 'setInput', address: 'I0.0', value: true });
		core.tick(10);
		expect(blockers(motor, live(), name)).toEqual([]);
		expect(blockers(running, live(), name)[0]).toMatch(/^T0 jeszcze odlicza \(ET = 0.0 s z 3s\)/);

		core.handle({ type: 'setInput', address: 'I0.1', value: true });
		core.tick(10);
		expect(blockers(motor, live(), name)).toEqual(['Stop (I0.1) = 1 — styk NC jest otwarty']);
	});
});
