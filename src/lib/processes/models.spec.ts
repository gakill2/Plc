import { describe, expect, it } from 'vitest';
import { ConveyorProcess, createProcess, TankProcess } from './models.js';
import type { ProcessIO } from './types.js';

/** A fake PLC: outputs we set by hand, inputs recorded. */
function fakeIO(outputs: Record<string, boolean> = {}) {
	const inputs: Record<string, boolean> = {};
	const io: ProcessIO = {
		output: (t) => outputs[t] ?? false,
		input: (t, v) => (inputs[t] = v)
	};
	return { io, inputs, outputs };
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
