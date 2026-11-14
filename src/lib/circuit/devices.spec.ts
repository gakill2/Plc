import { describe, expect, it } from 'vitest';
import { demoProject } from '#lib/project/project.js';
import { ProjectState } from '#lib/project/state.svelte.js';
import {
	checkCircuit,
	connect,
	device,
	deviceSymbols,
	emptyCircuit,
	inputDrive,
	portsOf,
	wireOf
} from './model.js';

const TERMINALS = { inputBytes: 2, outputBytes: 2 };

describe('multi-port devices', () => {
	it('3-position selector: HAND and AUTO are two contacts on two inputs', () => {
		const c = emptyCircuit();
		const mode = device('selector', 'Mode', 0, 0);
		c.devices.push(mode);
		connect(c, mode.id, 'I0.0');
		connect(c, mode.id, 'I0.1', 'auto');
		expect(c.wires).toHaveLength(2);
		const drive = (pos: number) =>
			Object.fromEntries(inputDrive(c, {}, { positions: { [mode.id]: pos } }));
		expect(drive(-1)).toEqual({ 'I0.0': true, 'I0.1': false });
		expect(drive(0)).toEqual({ 'I0.0': false, 'I0.1': false });
		expect(drive(1)).toEqual({ 'I0.0': false, 'I0.1': true });
		expect(deviceSymbols(c).map((s) => [s.name, s.address])).toEqual([
			['Mode_Hand', 'I0.0'],
			['Mode_Auto', 'I0.1']
		]);
		// re-wiring one port keeps the other
		connect(c, mode.id, 'I0.2', 'auto');
		expect(wireOf(c, mode.id)?.terminal).toBe('I0.0');
		expect(wireOf(c, mode.id, 'auto')?.terminal).toBe('I0.2');
	});

	it('contactor: feedback follows the coil unless the overload has tripped', () => {
		const c = emptyCircuit();
		const k = device('contactor', 'K1', 0, 0);
		c.devices.push(k);
		connect(c, k.id, 'Q0.0');
		connect(c, k.id, 'I0.5', 'aux');
		const fb = (coil: boolean, tripped = false) =>
			inputDrive(c, { [k.id]: tripped }, { output: (t) => t === 'Q0.0' && coil }).get('I0.5');
		expect(fb(false)).toBe(false);
		expect(fb(true)).toBe(true);
		expect(fb(true, true)).toBe(false);
		expect(inputDrive(c, {}).get('I0.5')).toBe(false); // no output image yet
		expect(deviceSymbols(c).map((s) => s.name)).toEqual(['K1', 'K1_FB']);
		expect(checkCircuit(c, TERMINALS)).toEqual([]);

		connect(c, k.id, 'Q0.1', 'aux');
		expect(checkCircuit(c, TERMINALS)[0].message).toMatch(
			/K1: FB contact must be wired to an input/
		);
	});

	it('e-stop latches and is wired NC: the signal drops while it is pressed', () => {
		const c = emptyCircuit();
		const e = device('estop', 'EStop', 0, 0, { nc: true });
		c.devices.push(e);
		connect(c, e.id, 'I0.0');
		expect(inputDrive(c, {}).get('I0.0')).toBe(true);
		expect(inputDrive(c, { [e.id]: true }).get('I0.0')).toBe(false);
		expect(portsOf('estop')).toHaveLength(1);
	});
});

describe('plants in own projects', () => {
	it('choosing a plant adds its I/O as symbols without clobbering existing ones', () => {
		const circuit = emptyCircuit();
		const run = device('switch', 'Run', 0, 0);
		circuit.devices.push(run);
		connect(circuit, run.id, 'I0.3');
		const p = new ProjectState({
			...demoProject(),
			circuit,
			symbols: [{ id: 'y1', name: 'Belt', address: 'Q1.0', comment: '' }]
		});
		p.setScenario('conveyor');
		expect(p.scenario).toBe('conveyor');
		// the name Belt is taken by the user's own symbol
		expect(p.userSymbols.map((s) => s.name)).toEqual([
			'Belt',
			'EntrySensor',
			'EndSensor',
			'TallBox',
			'Pusher'
		]);
		expect(p.warnings.filter((w) => w.message.includes('plant sensor'))).toEqual([]);
		connect(p.circuit, run.id, 'I0.0');
		expect(p.warnings[0].message).toMatch(
			/^I0.0 is a plant sensor \(EntrySensor\) but Run is wired/
		);
		p.setScenario(undefined);
		expect(p.scenario).toBeUndefined();
		expect(p.toJSON().scenario).toBeUndefined();

		const restored = new ProjectState(demoProject());
		restored.restore({ ...demoProject(), scenario: 'tank' });
		expect(restored.scenario).toBe('tank');
	});

	it('lessons keep their plant', () => {
		const p = new ProjectState({ ...demoProject(), lesson: 'x', scenario: 'tank' });
		p.setScenario('traffic');
		p.restore({ ...demoProject(), scenario: undefined });
		expect(p.scenario).toBe('tank');
	});
});
