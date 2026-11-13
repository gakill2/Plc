import { describe, expect, it } from 'vitest';
import { assemble } from './assembler.js';
import { Plc, ProgramError } from './plc.js';

const START_STOP = `
	// Classic self-holding circuit. The stop button is wired NC, so I0.1 is normally true.
	LD  I0.0     // start
	OR  Q0.0     // hold
	AND I0.1     // stop
	ST  Q0.0     // motor
	POP
`;

function loaded(source: string): Plc {
	const plc = new Plc();
	plc.load(assemble(source));
	return plc;
}

describe('Plc scan cycle', () => {
	it('runs a start/stop circuit with self-holding', () => {
		const plc = loaded(START_STOP);
		plc.run();
		plc.setInput('I0.1', true); // NC stop button, not pressed

		plc.setInput('I0.0', true);
		plc.scan(10);
		plc.setInput('I0.0', false);
		plc.scan(10);
		expect(plc.getOutput('Q0.0')).toBe(true); // still on after releasing start

		plc.setInput('I0.1', false);
		plc.scan(10);
		plc.setInput('I0.1', true);
		plc.scan(10);
		expect(plc.getOutput('Q0.0')).toBe(false); // stopped and stays off
	});

	it('uses process images: inputs are sampled and outputs written once per scan', () => {
		const plc = loaded(START_STOP);
		plc.run();
		plc.setInput('I0.0', true);
		plc.setInput('I0.1', true);
		expect(plc.memory.I[0]).toBe(0); // not sampled yet
		expect(plc.getOutput('Q0.0')).toBe(false);
		plc.scan(10);
		expect(plc.memory.I[0]).toBe(0b11);
		expect(plc.getOutput('Q0.0')).toBe(true);
	});

	it('does nothing in STOP and switches outputs off on stop', () => {
		const plc = loaded(START_STOP);
		plc.setInput('I0.0', true);
		plc.setInput('I0.1', true);
		expect(plc.scan(10)).toBe(false);
		expect(plc.scanCount).toBe(0);

		plc.run();
		plc.scan(10);
		expect(plc.getOutput('Q0.0')).toBe(true);
		plc.stop();
		expect(plc.getOutput('Q0.0')).toBe(false);
		expect(plc.memory.readBit({ area: 'Q', size: 'X', byte: 0, bit: 0 })).toBe(true); // warm: image kept
	});

	it('blinks an output with a timer (deterministic time)', () => {
		const plc = loaded(`
			LDN M0.0
			TON T0 T#500ms
			ST  M0.0       // one-scan pulse every 500 ms
			POP
			LD  M0.0
			XOR Q0.0
			ST  Q0.0       // toggle
			POP
		`);
		plc.run();
		const q: boolean[] = [];
		for (let i = 0; i < 14; i++) {
			plc.scan(100);
			q.push(plc.getOutput('Q0.0'));
		}
		// TON starts on scan 1, reaches 500 ms on scan 6, restarts on scan 8, fires again on scan 13
		expect(q.indexOf(true)).toBe(5);
		expect(q[11]).toBe(true);
		expect(q[12]).toBe(false);
		expect(plc.timeMs).toBe(1400);
		expect(plc.scanCount).toBe(14);
	});

	it('counts pulses with CTU and resets with R', () => {
		const plc = loaded(`
			LD  I0.0     // CU
			LD  I0.1     // R
			CTU C0 3
			ST  Q0.0
			POP
		`);
		plc.run();
		const press = (addr: string) => {
			plc.setInput(addr, true);
			plc.scan(10);
			plc.setInput(addr, false);
			plc.scan(10);
		};
		press('I0.0');
		press('I0.0');
		expect(plc.getOutput('Q0.0')).toBe(false);
		press('I0.0');
		expect(plc.getOutput('Q0.0')).toBe(true);
		expect(plc.snapshot().counters[0].cv).toBe(3);
		press('I0.1');
		expect(plc.getOutput('Q0.0')).toBe(false);
	});

	it('rejects invalid programs on load with all issues listed', () => {
		const plc = new Plc({ inputBytes: 2 });
		try {
			plc.load(assemble('LD I5.0\nST I0.0\nTON T99 T#1s\nJMP 42\nMOVE 1 MW0:REAL'));
			expect.unreachable();
		} catch (e) {
			expect(e).toBeInstanceOf(ProgramError);
			expect((e as ProgramError).issues.map((i) => i.pc)).toEqual([0, 1, 2, 3, 4]);
		}
	});

	it('needs a reset to leave FAULT', () => {
		const plc = loaded('AND');
		plc.run();
		plc.scan(10);
		expect(plc.mode).toBe('FAULT');
		expect(plc.run()).toBe(false);
		plc.reset();
		expect(plc.mode).toBe('STOP');
		expect(plc.fault).toBeNull();
	});

	it('reset clears memory, timers and counters', () => {
		const plc = loaded('LDC 1\nMOVE 5 MW0\nTON T0 T#1s\nPOP');
		plc.run();
		plc.scan(100);
		plc.scan(100);
		plc.reset();
		const s = plc.snapshot();
		expect([s.M[1], s.timers[0].et, s.scanCount, s.timeMs]).toEqual([0, 0, 0, 0]);
	});

	it('validates terminals and scan time', () => {
		const plc = new Plc();
		expect(() => plc.setInput('Q0.0', true)).toThrow(/input terminal/);
		expect(() => plc.getOutput('MW0')).toThrow(/output terminal/);
		expect(() => plc.setInput('I99.0', true)).toThrow(/out of range/);
		expect(() => plc.scan(-1)).toThrow(RangeError);
	});

	it('produces a structured-cloneable snapshot', () => {
		const plc = loaded(START_STOP);
		plc.setInput('I0.1', true);
		const snapshot = structuredClone(plc.snapshot());
		expect(snapshot).toMatchObject({ mode: 'STOP', scanCount: 0, fault: null });
		expect(plc.getInput('I0.1')).toBe(true);
	});

	it('forces override inputs, the program and survive reset', () => {
		const plc = loaded(START_STOP);
		plc.run();
		plc.force('I0.0', true); // start held by force
		plc.force('I0.1', true); // stop not pressed
		plc.scan(10);
		expect(plc.getOutput('Q0.0')).toBe(true);

		plc.force('Q0.0', false); // program wants it on, force says off
		plc.force('I0.0', null);
		plc.scan(10);
		expect(plc.getOutput('Q0.0')).toBe(false);
		expect(plc.forces).toEqual([
			{ address: 'I0.1', value: true },
			{ address: 'Q0.0', value: false }
		]);

		plc.reset();
		expect(plc.snapshot().forces).toHaveLength(2);
		plc.clearForces();
		expect(plc.forces).toEqual([]);
		expect(() => plc.force('MW0', true)).toThrow(/only bits/);
		expect(() => plc.force('T1', true)).toThrow(/only bits/);
	});

	it('modify writes Q / M once', () => {
		const plc = loaded('LD M0.0\nST Q0.1\nPOP');
		plc.run();
		plc.modify('M0.0', 1);
		plc.modify('MW2', -5);
		plc.scan(10);
		expect(plc.getOutput('Q0.1')).toBe(true);
		expect(plc.memory.readNumber({ area: 'M', size: 'W', byte: 2, bit: 0 })).toBe(-5);
		plc.modify('Q0.7', 1);
		expect(plc.getOutput('Q0.7')).toBe(true);
		expect(() => plc.modify('I0.0', 1)).toThrow(/cannot be modified/);
	});
});
