import { describe, expect, it } from 'vitest';
import { Plc } from '#lib/engine/index.js';
import { DeviceBank } from './devices.js';
import { connect, device, deviceSymbols, checkCircuit, emptyCircuit, inputDrive } from './model.js';
import { FAULTS, newVfd, RAW_FULL, stepVfd, type VfdInputs, type VfdState } from './vfd.js';

const run = (s: VfdState, i: VfdInputs, ms: number) => {
	let out = stepVfd(s, i, 10).out;
	for (let t = 10; t < ms; t += 10) ({ state: s, out } = stepVfd(s, i, 10));
	return { s, out };
};

describe('VFD model', () => {
	it('ramps up to the setpoint, reports at-speed and the actual value', () => {
		const half = { run: true, rev: false, reset: false, setpoint: RAW_FULL / 2 };
		const { s, out } = run(newVfd(), half, 1000);
		expect(s.hz).toBeCloseTo(50 / 3, 0); // 1 s of a 3 s ramp
		expect(out.atSpeed).toBe(false);
		const later = run(s, half, 1000);
		expect(later.s.hz).toBe(25);
		expect(later.out).toMatchObject({
			atSpeed: true,
			ready: true,
			fault: false,
			actual: RAW_FULL / 2
		});
		// stop: ramps down
		const stopped = run(later.s, { ...half, run: false }, 2000);
		expect(stopped.s.hz).toBe(0);
		// reverse
		expect(run(newVfd(), { ...half, run: false, rev: true }, 2000).s.hz).toBe(-25);
	});

	it('trips on run + rev while turning and needs a reset edge with RUN off', () => {
		const going = run(newVfd(), { run: true, rev: false, reset: false, setpoint: RAW_FULL }, 1000);
		const both = run(going.s, { run: true, rev: true, reset: false, setpoint: RAW_FULL }, 50);
		expect(both.s.fault).toBe(FAULTS.reversing);
		expect(both.out).toMatchObject({ ready: false, fault: true });
		// reset while RUN is still on: ignored
		const ignored = run(both.s, { run: true, rev: false, reset: true, setpoint: 0 }, 50);
		expect(ignored.s.fault).not.toBeNull();
		const off = run(ignored.s, { run: false, rev: false, reset: false, setpoint: 0 }, 50);
		const reset = run(off.s, { run: false, rev: false, reset: true, setpoint: 0 }, 50);
		expect(reset.s.fault).toBeNull();
		expect(reset.s.hz).toBeLessThan(both.s.hz); // coasting down
	});
});

describe('VFD in a circuit', () => {
	it('reads its digital and analog commands from the PLC and reports back', () => {
		const c = emptyCircuit();
		const u = device('vfd', 'U1', 0, 0, { aiWord: 'QW4', aoWord: 'IW4' });
		c.devices.push(u);
		connect(c, u.id, 'Q0.0');
		connect(c, u.id, 'I0.0', 'ready');
		connect(c, u.id, 'I0.1', 'atSpeed');
		expect(checkCircuit(c, { inputBytes: 8, outputBytes: 8 })).toEqual([]);
		expect(deviceSymbols(c).map((s) => `${s.name}=${s.address}`)).toEqual([
			'U1_Run=Q0.0',
			'U1_Ready=I0.0',
			'U1_AtSpeed=I0.1',
			'U1_Setpoint=QW4',
			'U1_Speed=IW4'
		]);

		const bank = new DeviceBank();
		const plc = {
			bit: (t: string) => t === 'Q0.0',
			word: (a: string) => (a === 'QW4' ? RAW_FULL : 0)
		};
		let words = new Map<string, number>();
		for (let t = 0; t < 4000; t += 10) words = bank.step(c, 10, plc);
		expect(words.get('IW4')).toBe(RAW_FULL);
		const drive = inputDrive(c, {}, { vfd: (id) => bank.out.get(id) });
		expect(Object.fromEntries(drive)).toEqual({ 'I0.0': true, 'I0.1': true });

		bank.trip(u.id);
		bank.step(c, 10, plc);
		expect(bank.out.get(u.id)).toMatchObject({ ready: false, fault: true });
	});

	it('reports wrong word addresses', () => {
		const c = emptyCircuit();
		c.devices.push(device('vfd', 'U1', 0, 0, { aiWord: 'IW4', aoWord: 'QW99' }));
		expect(checkCircuit(c, { inputBytes: 8, outputBytes: 8 }).map((i) => i.message)).toEqual([
			'U1: setpoint (AI1) must be a word QW… (e.g. QW4)',
			'U1: actual speed (AO1) must be a word IW… (e.g. IW4)'
		]);
	});

	it('the PLC reads input words set from the field', () => {
		const plc = new Plc();
		plc.load([]);
		plc.run();
		plc.setInputNumber('IW4', 12345);
		plc.setInputNumber('IB6', 7);
		plc.scan(10);
		expect(plc.memory.readNumber({ area: 'I', size: 'W', byte: 4, bit: 0 })).toBe(12345);
		expect(plc.memory.readNumber({ area: 'I', size: 'B', byte: 6, bit: 0 })).toBe(7);
		expect(() => plc.setInputNumber('QW4', 1)).toThrow(/not an input byte or word/);
		plc.setInputNumber('ID0', 1.5, 'REAL');
		plc.setInputNumber('ID0', 3);
		plc.scan(10);
		expect(plc.memory.readNumber({ area: 'I', size: 'D', byte: 0, bit: 0 })).toBe(3);
	});
});
