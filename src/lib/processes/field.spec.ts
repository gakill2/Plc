import { describe, expect, it } from 'vitest';
import { ANALOG_OVERFLOW, FieldLayer } from './field.js';
import { createProcess } from './models.js';
import type { ConveyorState, ProcessIO } from './types.js';

function rig() {
	const inputs = new Map<string, boolean | number>();
	const outputs = new Map<string, boolean>();
	const raw: ProcessIO = {
		output: (t) => outputs.get(t) ?? false,
		input: (t, v) => void inputs.set(t, v),
		word: () => 0,
		setWord: (a, v) => void inputs.set(a, v)
	};
	const field = new FieldLayer(7);
	return { field, io: field.wrap(raw), inputs, outputs };
}

describe('field layer', () => {
	it('passes signals through when nothing is wrong', () => {
		const { io, inputs } = rig();
		io.input('I0.0', true);
		io.setWord('IW4', 1234);
		expect(inputs.get('I0.0')).toBe(true);
		expect(inputs.get('IW4')).toBe(1234);
	});

	it('stuck, dirty and slow digital sensors', () => {
		const { field, io, inputs } = rig();
		field.setFault('I0.0', 'stuck0');
		io.input('I0.0', true);
		expect(inputs.get('I0.0')).toBe(false);
		field.setFault('I0.0', 'stuck1');
		io.input('I0.0', false);
		expect(inputs.get('I0.0')).toBe(true);

		field.setFault('I0.1', 'flicker');
		let drops = 0;
		for (let i = 0; i < 200; i++) {
			io.input('I0.1', true);
			if (!inputs.get('I0.1')) drops++;
		}
		expect(drops).toBeGreaterThan(10);
		expect(drops).toBeLessThan(60);

		field.setFault('I0.2', 'slow');
		io.input('I0.2', false);
		for (let t = 0; t < 400; t += 10) {
			field.tick(10);
			io.input('I0.2', true);
		}
		expect(inputs.get('I0.2')).toBe(false);
		for (let t = 0; t < 200; t += 10) {
			field.tick(10);
			io.input('I0.2', true);
		}
		expect(inputs.get('I0.2')).toBe(true);
	});

	it('analog: noise only with realism, wire break, offset, frozen and overflow', () => {
		const { field, io, inputs } = rig();
		field.noise = { IW4: 5 };
		io.setWord('IW4', 1000);
		expect(inputs.get('IW4')).toBe(1000);
		field.realism = true;
		const values = new Set<number>();
		for (let i = 0; i < 20; i++) {
			io.setWord('IW4', 1000);
			values.add(inputs.get('IW4') as number);
		}
		expect(values.size).toBeGreaterThan(3);
		io.setWord('IW6', 40000);
		expect(inputs.get('IW6')).toBe(ANALOG_OVERFLOW);
		field.setFault('IW6', 'wireBreak');
		io.setWord('IW6', 500);
		expect(inputs.get('IW6')).toBe(ANALOG_OVERFLOW);
		field.setFault('IW6', 'offset');
		io.setWord('IW6', 500);
		expect(inputs.get('IW6')).toBe(500 + 2765);
		field.setFault('IW6', 'frozen');
		io.setWord('IW6', 9000);
		expect(inputs.get('IW6')).toBe(500 + 2765);
	});

	it('plant faults reach the model, also a new one after a restart', () => {
		const { field, io, outputs } = rig();
		const belt = createProcess('conveyor');
		belt.command('spawn', { tall: false });
		outputs.set('Q0.0', true);
		field.setPlantFault(belt, 'jam', true);
		for (let i = 0; i < 100; i++) belt.step(10, io);
		expect((belt.state() as ConveyorState).boxes[0].x).toBe(0);
		const fresh = createProcess('conveyor');
		field.applyPlantFaults(fresh);
		fresh.command('spawn', { tall: false });
		for (let i = 0; i < 100; i++) fresh.step(10, io);
		expect((fresh.state() as ConveyorState).boxes[0].x).toBe(0);
	});
});
