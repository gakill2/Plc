import { describe, expect, it } from 'vitest';
import {
	analogRaw,
	newOven,
	newPid,
	onOff,
	pid,
	RAW_NOMINAL,
	scale,
	stepOven,
	wiring,
	type Oven,
	type PidParams
} from './physics.js';

describe('wiring', () => {
	it('PNP needs a sink input, NPN a source input', () => {
		expect(wiring('PNP', 'sink', true)).toMatchObject({ signal: true, wire: 24, compatible: true });
		expect(wiring('NPN', 'source', true)).toMatchObject({
			signal: true,
			wire: 0,
			compatible: true
		});
		expect(wiring('PNP', 'source', true)).toMatchObject({ signal: false, compatible: false });
		expect(wiring('NPN', 'sink', true).explanation).toMatch(/choć czujnik świeci/);
		expect(wiring('PNP', 'sink', false)).toMatchObject({ signal: false, wire: null });
	});
});

describe('analog', () => {
	it('maps 4–20 mA and 0–10 V onto 0 … 27648', () => {
		expect(analogRaw(4, '4-20mA').raw).toBe(0);
		expect(analogRaw(12, '4-20mA').raw).toBe(13824);
		expect(analogRaw(20, '4-20mA').raw).toBe(RAW_NOMINAL);
		expect(analogRaw(5, '0-10V')).toMatchObject({ raw: 13824, percent: 50, fault: null });
		expect(scale(13824, 0, 150)).toBe(75);
	});

	it('detects a wire break below ~1.2 mA and an overflow', () => {
		expect(analogRaw(0, '4-20mA').fault).toBe('wire-break');
		expect(analogRaw(0, '0-10V').fault).toBeNull(); // 0 V is a valid value
		expect(analogRaw(23, '4-20mA')).toMatchObject({ raw: 32767, fault: 'overflow' });
		expect(analogRaw(2, '4-20mA').raw).toBe(-3456); // under-range, still valid
	});
});

describe('oven control', () => {
	const run = (control: (pv: number) => number, seconds: number) => {
		let o: Oven = newOven();
		const temps: number[] = [];
		for (let t = 0; t < seconds; t += 0.5) {
			o = stepOven(o, control(o.temp), 0.5);
			temps.push(o.temp);
		}
		return temps;
	};

	it('heats up with full power and cools down without', () => {
		const hot = run(() => 100, 600);
		expect(hot.at(-1)!).toBeGreaterThan(150);
		const cold = run(() => 0, 100);
		expect(cold.at(-1)!).toBeCloseTo(20, 5);
	});

	it('on/off control oscillates around the setpoint (overshoot because of the lag)', () => {
		let on = false;
		const temps = run((pv) => {
			on = onOff(pv, 100, 4, on);
			return on ? 100 : 0;
		}, 900).slice(1200);
		expect(Math.max(...temps)).toBeGreaterThan(102);
		expect(Math.min(...temps)).toBeLessThan(98);
		expect(Math.abs(temps.reduce((a, b) => a + b) / temps.length - 100)).toBeLessThan(8);
	});

	it('P leaves an offset, PI removes it, anti-windup keeps it sane', () => {
		const withPid = (k: PidParams) => {
			let s = newPid();
			return run((pv) => {
				const r = pid(s, pv, 100, k, 0.5);
				s = r.state;
				return r.out;
			}, 1500);
		};
		const p = withPid({ kp: 4, ti: 0, td: 0 }).at(-1)!;
		expect(100 - p).toBeGreaterThan(3); // steady-state error
		const pi = withPid({ kp: 4, ti: 60, td: 0 });
		expect(pi.at(-1)!).toBeCloseTo(100, 0);
		expect(Math.max(...pi)).toBeLessThan(125);
		const pidRun = withPid({ kp: 4, ti: 60, td: 10 });
		expect(pidRun.at(-1)!).toBeCloseTo(100, 0);
	});

	it('clamps the output to 0 … 100 %', () => {
		const r = pid(newPid(), 20, 200, { kp: 50, ti: 10, td: 0 }, 1);
		expect(r.out).toBe(100);
		expect(r.state.integral).toBe(0); // saturated: no wind-up
		expect(pid(newPid(), 300, 100, { kp: 2, ti: 0, td: 0 }, 1).out).toBe(0);
	});
});
