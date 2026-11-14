import { describe, expect, it } from 'vitest';
import {
	closedLoop,
	identify,
	performance,
	psuSize,
	simc,
	stepResponse,
	voltageAtLoad,
	type Plant
} from './control.js';

const oven: Plant = { kind: 'first', k: 2, t: 10, delay: 2, zeta: 1 };

describe('step responses', () => {
	it('first order reaches 63 % one time constant after the dead time', () => {
		const c = stepResponse(oven, 80);
		const id = identify(c);
		expect(id.k).toBeCloseTo(2, 1);
		expect(id.delay).toBeGreaterThan(1.9);
		expect(id.delay).toBeLessThan(2.6);
		expect(id.t).toBeGreaterThan(9);
		expect(id.t).toBeLessThan(10.5);
	});

	it('an integrating plant keeps rising, an underdamped one overshoots', () => {
		const tank = stepResponse({ kind: 'integrating', k: 0.5, t: 1, delay: 0, zeta: 1 }, 10);
		expect(tank.at(-1)!.y).toBeCloseTo(5, 1);
		const spring = stepResponse({ kind: 'second', k: 1, t: 1, delay: 0, zeta: 0.2 }, 20);
		expect(Math.max(...spring.map((s) => s.y))).toBeGreaterThan(1.4);
	});
});

describe('PI loop', () => {
	it('SIMC tuning settles without much overshoot, an aggressive one oscillates', () => {
		const { kp, ti } = simc(2, 10, 2);
		expect(kp).toBeCloseTo(1.25, 2);
		expect(ti).toBeCloseTo(10, 5);
		const good = performance(closedLoop(oven, kp, ti, 80));
		expect(good.overshoot).toBeLessThan(0.1);
		expect(good.settling).not.toBeNull();
		const bad = performance(closedLoop(oven, 4, 2, 80));
		expect(bad.overshoot).toBeGreaterThan(0.3);
	});
});

describe('control cabinet', () => {
	it('sizes the 24 V supply with a reserve', () => {
		const r = psuSize([
			{ name: 'CPU', count: 1, amps: 0.6 },
			{ name: 'zawory', count: 8, amps: 0.25 },
			{ name: 'czujniki', count: 20, amps: 0.02 }
		]);
		expect(r.total).toBeCloseTo(3, 5);
		expect(r.psu).toBe(5);
	});

	it('computes the voltage drop on a long cable', () => {
		expect(voltageAtLoad(24, 2, 50, 0.75)).toBeCloseTo(24 - 4.67, 1);
	});
});
