import { describe, expect, it } from 'vitest';
import { assemble } from './assembler.js';
import { describeFrame, traceScan } from './debug.js';
import { Plc } from './plc.js';

const program = assemble(`
	LD I0.0
	OR Q0.0
	ANDN I0.1
	ST Q0.0
	POP
	LD Q0.0
	TON T0, 1000
	ST Q0.1
	POP
	LDC 1
	MOVE 7, MW0
	ADD MW0, 1, MW2
	POP
`);

describe('traceScan', () => {
	it('records every instruction with the stack, reads and changes', () => {
		const plc = new Plc();
		plc.load(program);
		plc.run();
		plc.setInput('I0.0', true);
		const t = traceScan(program, plc.snapshot(), 10);
		expect(t.fault).toBeNull();
		expect(t.frames.map((f) => f.pc)).toEqual(program.map((_, i) => i));
		const [ld, or, andn, st] = t.frames;
		expect(ld.reads).toEqual([['I0.0', '1']]);
		expect(ld.after).toEqual([true]);
		expect(or.before).toEqual([true]);
		expect(andn.reads).toEqual([['I0.1', '0']]);
		expect(st.changes).toEqual([{ address: 'Q0.0', before: '0', after: '1' }]);
		expect(t.frames[6].changes[0]).toMatchObject({ address: 'T0', before: 'IN=0 Q=0 ET=0ms' });
		expect(t.frames[6].changes[0].after).toMatch(/^IN=1 Q=0 ET=\d+ms$/);
		expect(t.frames[11].changes).toEqual([{ address: 'MW2', before: '0', after: '8' }]);
		expect(t.outputs).toEqual([{ address: 'Q0.0', before: '0', after: '1' }]);
		// the real PLC is untouched
		expect(plc.getOutput('Q0.0')).toBe(false);
	});

	it('describes instructions in words', () => {
		const t = traceScan(program, null, 10);
		const text = t.frames.map((f) =>
			describeFrame(f, program[f.pc], (a) => (a === 'I0.0' ? 'Start (I0.0)' : a))
		);
		expect(text[0]).toBe('Wczytaj Start (I0.0) = 0 na stos (nowy wynik logiczny RLO = 0).');
		expect(text[2]).toBe('AND: RLO 0 AND I0.1 = 0 (zanegowany) → 0.');
		expect(text[3]).toBe('Zapisz RLO = 0 do Q0.0 (bez zmian).');
		expect(text[4]).toBe('Koniec networku: zdejmij wynik ze stosu.');
		expect(text[9]).toMatch(/lewej szyny/);
		expect(text[10]).toBe('EN = 1, więc MOVE: MW0 := 7 (było 0, jest 7).');
	});

	it('reports a fault instead of throwing', () => {
		const loop = assemble('JMP 0');
		const t = traceScan(loop, null, 10);
		expect(t.fault).toMatch(/Watchdog/);
		expect(t.truncated).toBe(true);
		expect(t.frames).toHaveLength(5000);
	});
});
