import { describe, expect, it } from 'vitest';
import { assemble } from '#lib/engine/index.js';
import { RuntimeCore, SCAN_MS } from './core.js';
import { TraceBuffer } from './trace.js';

const BLINK = assemble(`
	LDN M0.0
	TON T0 50
	ST  M0.0
	POP
	LD  M0.0
	XOR Q0.0
	ST  Q0.0
	POP
`);

describe('trace sampling in RuntimeCore', () => {
	it('records a sample only when a traced value changes', () => {
		const core = new RuntimeCore();
		core.handle({ type: 'load', program: BLINK });
		core.handle({
			type: 'setTrace',
			signals: [
				{ address: 'Q0.0', kind: 'bit' },
				{ address: 'T0', kind: 'number' },
				{ address: 'nonsense', kind: 'bit' }
			]
		});
		core.handle({ type: 'run' });
		core.snapshot(); // drop the initial sample
		core.tick(8 * SCAN_MS);
		const { epoch, samples } = core.snapshot().trace;

		expect(epoch).toBeGreaterThan(0);
		// ET changes on most scans (but not 0 → 0), Q0.0 toggles at 60 ms
		expect(samples.map((s) => s.t)).toEqual([20, 30, 40, 50, 60, 70]);
		expect(samples.find((s) => s.v[0] === 1)?.t).toBe(60);
		expect(Number.isNaN(samples[0].v[2])).toBe(true);
		expect(core.snapshot().trace.samples).toEqual([]); // drained
	});

	it('only bit signals → no samples while nothing changes', () => {
		const core = new RuntimeCore();
		core.handle({ type: 'load', program: assemble('LD I0.0\nST Q0.0\nPOP') });
		core.handle({ type: 'setTrace', signals: [{ address: 'Q0.0', kind: 'bit' }] });
		core.handle({ type: 'run' });
		core.snapshot();
		core.tick(100);
		expect(core.snapshot().trace.samples).toEqual([]);
		core.handle({ type: 'setInput', address: 'I0.0', value: true });
		core.tick(10);
		expect(core.snapshot().trace.samples).toEqual([{ t: 110, v: [1] }]);
	});

	it('reports bad force / modify commands instead of throwing', () => {
		const core = new RuntimeCore();
		expect(core.handle({ type: 'force', address: 'MW0', value: true })).toMatchObject({
			type: 'commandError'
		});
		expect(core.handle({ type: 'modify', address: 'I0.0', value: 1 })).toMatchObject({
			type: 'commandError'
		});
		expect(core.handle({ type: 'force', address: 'Q0.0', value: true })).toBeNull();
		expect(core.snapshot().forces).toEqual([{ address: 'Q0.0', value: true }]);
		core.handle({ type: 'clearForces' });
		expect(core.snapshot().forces).toEqual([]);
	});
});

describe('TraceBuffer', () => {
	it('restarts on a new epoch and answers time queries', () => {
		const buf = new TraceBuffer(3);
		buf.push({ epoch: 1, samples: [{ t: 0, v: [0] }] });
		buf.push({
			epoch: 1,
			samples: [
				{ t: 10, v: [1] },
				{ t: 30, v: [0] }
			]
		});
		expect(buf.valuesAt(25)).toEqual([1]);
		expect(buf.valuesAt(-1)).toBeNull();
		expect(buf.window(15, 40).map((s) => s.t)).toEqual([10, 30]);

		buf.push({ epoch: 1, samples: [{ t: 40, v: [1] }] });
		expect(buf.samples.map((s) => s.t)).toEqual([10, 30, 40]); // trimmed to 3

		buf.push({ epoch: 2, samples: [] });
		expect(buf.samples).toEqual([]);
	});
});
