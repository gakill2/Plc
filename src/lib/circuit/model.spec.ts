import { describe, expect, it } from 'vitest';
import {
	checkCircuit,
	connect,
	demoCircuit,
	device,
	deviceSymbols,
	emptyCircuit,
	inputDrive,
	nextLabel,
	removeDevice
} from './model.js';

const TERMINALS = { inputBytes: 2, outputBytes: 2 };

describe('circuit model', () => {
	it('drives inputs from devices, honouring NC wiring and OR-ing parallel devices', () => {
		const c = emptyCircuit();
		const a = device('pushbutton', 'A', 0, 0);
		const b = device('pushbutton', 'B', 0, 0);
		const stop = device('pushbutton', 'Stop', 0, 0, { nc: true });
		const lamp = device('lamp', 'L', 0, 0);
		c.devices.push(a, b, stop, lamp);
		connect(c, a.id, 'I0.0');
		connect(c, b.id, 'i0.0');
		connect(c, stop.id, 'I0.1');
		connect(c, lamp.id, 'Q0.0');

		expect(Object.fromEntries(inputDrive(c, {}))).toEqual({ 'I0.0': false, 'I0.1': true });
		expect(Object.fromEntries(inputDrive(c, { [b.id]: true, [stop.id]: true }))).toEqual({
			'I0.0': true,
			'I0.1': false
		});
	});

	it('keeps one wire per device and removes wires with the device', () => {
		const c = emptyCircuit();
		const a = device('switch', 'A', 0, 0);
		c.devices.push(a);
		connect(c, a.id, 'I0.0');
		connect(c, a.id, 'I0.3');
		expect(c.wires.map((w) => w.terminal)).toEqual(['I0.3']);
		removeDevice(c, a.id);
		expect(c.wires).toEqual([]);
	});

	it('reports devices wired to the wrong kind of terminal and bad names', () => {
		const c = emptyCircuit();
		const lamp = device('lamp', 'Lamp1', 0, 0);
		const button = device('pushbutton', 'Big button', 0, 0);
		const sensor = device('sensor', 'S1', 0, 0);
		c.devices.push(lamp, button, sensor);
		connect(c, lamp.id, 'I0.0');
		connect(c, sensor.id, 'I5.0');
		const ids = checkCircuit(c, TERMINALS).map((i) => i.id);
		expect(ids).toEqual([lamp.id, sensor.id, button.id]);
	});

	it('turns wired devices into symbols', () => {
		const symbols = deviceSymbols(demoCircuit());
		expect(symbols.map((s) => `${s.name}=${s.address}`)).toEqual([
			'Start=I0.0',
			'Stop=I0.1',
			'ResetCount=I0.2',
			'Motor=Q0.0',
			'Running=Q0.1',
			'Service=Q0.2'
		]);
		expect(checkCircuit(demoCircuit(), TERMINALS)).toEqual([]);
	});

	it('suggests unused labels', () => {
		const c = emptyCircuit();
		c.devices.push(device('lamp', 'Lamp1', 0, 0));
		expect(nextLabel(c, 'lamp')).toBe('Lamp2');
		expect(nextLabel(c, 'motor')).toBe('Motor1');
	});
});
