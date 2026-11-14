import { describe, expect, it } from 'vitest';
import { ConveyorProcess, createProcess, TankProcess } from './models.js';
import { CraneProcess } from './crane.js';
import { OvenProcess } from './oven.js';
import { RemoteProcess } from './remote.js';
import type { ProcessIO } from './types.js';

/** A fake PLC: outputs we set by hand, inputs recorded. */
function fakeIO(outputs: Record<string, boolean> = {}, words: Record<string, number> = {}) {
	const inputs: Record<string, boolean> = {};
	const io: ProcessIO = {
		output: (t) => outputs[t] ?? false,
		input: (t, v) => (inputs[t] = v),
		word: (a) => words[a] ?? 0,
		setWord: (a, v) => (words[a] = v)
	};
	return { io, inputs, outputs, words };
}

function run(p: { step: (dt: number, io: ProcessIO) => void }, io: ProcessIO, ms: number) {
	for (let t = 0; t < ms; t += 10) p.step(10, io);
}

describe('TankProcess', () => {
	it('drains, fills and reports LOW / HIGH', () => {
		const tank = new TankProcess();
		const { io, inputs, outputs } = fakeIO();
		run(tank, io, 1000);
		expect(tank.level).toBeCloseTo(46);
		expect(inputs).toEqual({ 'I0.0': true, 'I0.1': false });

		outputs['Q0.0'] = true; // +8 −4 = +4 %/s
		run(tank, io, 10_000);
		expect(tank.level).toBeCloseTo(86);
		expect(inputs['I0.1']).toBe(true);
		expect(tank.pumpStarts).toBe(1);

		run(tank, io, 10_000);
		expect(tank.level).toBe(100);
		expect(tank.state().overflowed).toBe(true);
	});

	it('can stop the consumer and set the level', () => {
		const tank = new TankProcess();
		tank.command('drain', false);
		tank.command('level', 10);
		run(tank, fakeIO().io, 1000);
		expect(tank.level).toBe(10);
		expect(tank.state()).toMatchObject({ low: false, minLevel: 10 });
	});
});

describe('ConveyorProcess', () => {
	it('moves boxes, triggers sensors and delivers them', () => {
		const c = new ConveyorProcess();
		const { io, inputs } = fakeIO({ 'Q0.0': true });
		c.command('spawn', { tall: false });
		run(c, io, 1000); // 0.2 m → entry sensor
		expect(inputs['I0.0']).toBe(true);
		run(c, io, 8500); // 1.9 m → end sensor
		expect(inputs['I0.1']).toBe(true);
		run(c, io, 1000);
		expect(c.state()).toMatchObject({ delivered: 1, boxes: [] });
	});

	it('the pusher rejects a box in front of it; a stopped belt holds boxes', () => {
		const c = new ConveyorProcess();
		const outputs: Record<string, boolean> = { 'Q0.0': true };
		const { io, inputs } = fakeIO(outputs);
		c.command('spawn', { tall: true });
		run(c, io, 6000); // 1.2 m
		expect(inputs['I0.2']).toBe(true);
		outputs['Q0.0'] = false;
		run(c, io, 2000);
		expect(c.boxes[0].x).toBeCloseTo(1.2);
		outputs['Q0.1'] = true;
		run(c, io, 300);
		expect(c.state()).toMatchObject({ rejected: 1, wrongRejected: 0, boxes: [] });
	});

	it('feeds a pattern at an interval, waiting for room', () => {
		const c = new ConveyorProcess();
		const { io } = fakeIO({ 'Q0.0': true });
		c.command('feed', { pattern: [true, false, false], interval: 2000 });
		run(c, io, 4100);
		expect(c.boxes.map((b) => b.tall)).toEqual([true, false, false]);
		c.command('clear');
		expect(c.state().boxes).toEqual([]);
	});

	it('is created by kind', () => {
		expect(createProcess('traffic').kind).toBe('traffic');
		expect(createProcess('tank').sensors).toEqual(['I0.0', 'I0.1']);
	});
});

describe('oven', () => {
	it('heats towards ambient + gain × power, with dead time', () => {
		const oven = new OvenProcess();
		const { io, inputs, words } = fakeIO({ 'Q0.0': true }, { QW4: 27648 / 2 });
		run(oven, io, 1000);
		expect(oven.temp).toBeCloseTo(20, 0); // nothing yet: dead time
		run(oven, io, 200_000);
		expect(oven.temp).toBeCloseTo(160, 0);
		expect(words.IW4).toBe(Math.round(oven.temp * 10));
		expect(inputs['I0.0']).toBe(true);
	});

	it('cools with the door open and trips the thermostat', () => {
		const oven = new OvenProcess();
		const { io, inputs } = fakeIO({ 'Q0.0': true }, { QW4: 27648 });
		run(oven, io, 200_000);
		expect(oven.maxTemp).toBeGreaterThan(280); // the thermostat cut in …
		expect(oven.maxTemp).toBeLessThan(290); // … and kept it from reaching 300 °C
		oven.command('door', true);
		run(oven, io, 1000);
		expect(oven.power).toBe(0);
		expect(inputs['I0.0']).toBe(false);
	});
});

describe('crane', () => {
	it('accelerates, coasts and reports the encoder', () => {
		const crane = new CraneProcess();
		const outputs: Record<string, boolean> = { 'Q0.1': true, 'Q0.2': true };
		const { io, words, inputs } = fakeIO(outputs);
		run(crane, io, 2000);
		expect(crane.v).toBe(1000);
		outputs['Q0.1'] = false;
		const x = crane.x;
		run(crane, io, 2000);
		expect(crane.x - x).toBeGreaterThan(400); // braking distance from full speed
		expect(words.IW4).toBe(Math.round(crane.x));
		expect(inputs['I0.2']).toBe(true);
	});

	it('counts crashes, swings and shorts', () => {
		const crane = new CraneProcess();
		const outputs: Record<string, boolean> = { 'Q0.1': true, 'Q0.2': true };
		const { io, inputs } = fakeIO(outputs);
		run(crane, io, 8000);
		expect(crane.crashes).toBe(1);
		expect(inputs['I0.1']).toBe(false);
		crane.command('hook', 0.5);
		Object.assign(outputs, { 'Q0.0': true, 'Q0.1': false, 'Q0.2': false });
		run(crane, io, 500);
		expect(crane.swings).toBe(1);
		outputs['Q0.1'] = true;
		run(crane, io, 100);
		expect(crane.shorts).toBe(1);
	});
});

describe('remote I/O station', () => {
	it('freezes the PLC image when the cable breaks, the station stops the pump', () => {
		const st = new RemoteProcess();
		const { io, inputs, words, outputs } = fakeIO({ 'Q2.0': true });
		run(st, io, 1000);
		expect(inputs['I2.0']).toBe(true);
		const beat = words.IW6;
		expect(beat).toBeGreaterThan(5);
		st.command('link', false);
		run(st, io, 1500);
		expect(words.IW6).toBe(beat); // stale
		expect(inputs['I2.0']).toBe(true); // the PLC still thinks it runs …
		expect(st.pumpRunning).toBe(false); // … but the station's watchdog stopped it
		st.command('link', true);
		outputs['Q2.0'] = false;
		run(st, io, 200);
		expect(words.IW6).toBeGreaterThan(beat);
		expect(inputs['I2.0']).toBe(false);
	});
});
