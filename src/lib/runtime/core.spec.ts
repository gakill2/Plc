import { describe, expect, it } from 'vitest';
import { assemble } from '#lib/engine/index.js';
import { MAX_SCANS_PER_TICK, RuntimeCore, SCAN_MS } from './core.js';

const BLINK = assemble(`
	LD I0.0
	ST Q0.0
	POP
`);

function loaded() {
	const core = new RuntimeCore();
	core.handle({ type: 'load', program: BLINK });
	return core;
}

describe('RuntimeCore', () => {
	it('turns real time into whole scans, scaled by speed', () => {
		const core = loaded();
		core.handle({ type: 'run' });
		expect(core.tick(25)).toBe(2);
		expect(core.tick(5)).toBe(1); // 5 ms carried over
		core.handle({ type: 'setSpeed', speed: 10 });
		expect(core.tick(10)).toBe(10);
		expect(core.snapshot().timeMs).toBe(13 * SCAN_MS);
	});

	it('does not scan in STOP or PAUSED; STEP runs exactly one scan', () => {
		const core = loaded();
		expect(core.tick(100)).toBe(0);

		core.handle({ type: 'setInput', address: 'I0.0', value: true });
		core.handle({ type: 'step' });
		expect(core.status).toBe('PAUSED');
		expect(core.snapshot().scanCount).toBe(1);
		expect(core.plc.getOutput('Q0.0')).toBe(true);
		expect(core.tick(100)).toBe(0);

		core.handle({ type: 'run' });
		expect(core.status).toBe('RUN');
		core.handle({ type: 'pause' });
		expect(core.status).toBe('PAUSED');
	});

	it('routes a wired button through the configured input module', () => {
		const core = loaded();
		core.handle({
			type: 'setHardware',
			hw: {
				cpu: 'CPU',
				imageBytes: 128,
				modules: [{ slot: 2, kind: 'DI16', start: 4 }],
				wiring: [{ terminal: 'I0.0', device: 'S1', slot: 2, channel: 0 }]
			}
		});
		core.handle({ type: 'setInput', address: 'I0.0', value: true });
		expect(core.plc.getInput('I4.0')).toBe(true);
		expect(core.plc.getInput('I0.0')).toBe(false);
		core.handle({ type: 'setHardware', hw: null });
		core.handle({ type: 'setInput', address: 'I0.0', value: true });
		expect(core.plc.getInput('I0.0')).toBe(true);
	});

	it('caps the work per tick', () => {
		const core = loaded();
		core.handle({ type: 'run' });
		expect(core.tick(60_000)).toBe(MAX_SCANS_PER_TICK);
		expect(core.tick(0)).toBe(0); // backlog dropped
	});

	it('reports load errors instead of throwing', () => {
		const core = new RuntimeCore();
		const event = core.handle({ type: 'load', program: assemble('ST I0.0') });
		expect(event).toMatchObject({ type: 'loadError', issues: [{ pc: 0 }] });
	});

	it('stop and reset return to STOP', () => {
		const core = loaded();
		core.handle({ type: 'run' });
		core.tick(50);
		core.handle({ type: 'stop' });
		expect(core.status).toBe('STOP');
		core.handle({ type: 'reset' });
		expect(core.snapshot().scanCount).toBe(0);
		core.handle({ type: 'setSpeed', speed: -1 });
		expect(core.speed).toBe(1);
	});
});
