/**
 * Control theory basics for the tutorial: step responses of typical plants, reading K, T and the
 * dead time off a curve, and a PI loop tuned with the SIMC rules.
 */

export type PlantKind = 'first' | 'second' | 'integrating';

export interface Plant {
	kind: PlantKind;
	/** gain: output change per unit input (for integrating: rate per unit input, per second) */
	k: number;
	/** time constant, s */
	t: number;
	/** dead time, s */
	delay: number;
	/** second order: damping ratio (< 1 oscillates) */
	zeta: number;
}

export const PLANT_NAMES: Record<PlantKind, string> = {
	first: 'inercja I rzędu z opóźnieniem (piec, wymiennik)',
	second: 'obiekt II rzędu (masa na sprężynie, ramię, mało tłumiony)',
	integrating: 'całkujący (poziom w zbiorniku, pozycja)'
};

/** Output over time for a unit step at t = 0. */
export function stepResponse(p: Plant, seconds: number, dt = 0.05): { t: number; y: number }[] {
	const out: { t: number; y: number }[] = [];
	let y = 0;
	let v = 0; // second order: derivative
	const wn = 1 / Math.max(0.01, p.t);
	for (let t = 0; t <= seconds + 1e-9; t += dt) {
		out.push({ t, y });
		const u = t >= p.delay ? 1 : 0;
		if (p.kind === 'first') y += ((p.k * u - y) / Math.max(0.01, p.t)) * dt;
		else if (p.kind === 'integrating') y += p.k * u * dt;
		else {
			const a = wn * wn * (p.k * u - y) - 2 * p.zeta * wn * v;
			v += a * dt;
			y += v * dt;
		}
	}
	return out;
}

/** The 63 % method: read gain, time constant and dead time from a first-order response. */
export function identify(curve: { t: number; y: number }[]): {
	k: number;
	t: number;
	delay: number;
} {
	const final = curve[curve.length - 1].y;
	const start = curve.find((s) => s.y > final * 0.02)?.t ?? 0;
	const t63 = curve.find((s) => s.y >= final * 0.632)?.t ?? 0;
	return { k: final, delay: start, t: Math.max(0, t63 - start) };
}

/** SIMC tuning for a first-order plant with dead time (closed-loop time constant = dead time). */
export function simc(k: number, t: number, delay: number): { kp: number; ti: number } {
	const tc = Math.max(delay, 0.1 * t, 0.05);
	return { kp: t / (k * (tc + delay)), ti: Math.min(t, 4 * (tc + delay)) };
}

/** Closed loop: PI controller on the plant, setpoint step to 1 at t = 0. */
export function closedLoop(
	p: Plant,
	kp: number,
	ti: number,
	seconds: number,
	dt = 0.05
): { t: number; y: number; u: number }[] {
	const out: { t: number; y: number; u: number }[] = [];
	const delayed: number[] = [];
	const steps = Math.round(p.delay / dt);
	let y = 0;
	let v = 0;
	let integral = 0;
	const wn = 1 / Math.max(0.01, p.t);
	for (let t = 0; t <= seconds + 1e-9; t += dt) {
		const e = 1 - y;
		let u = kp * (e + integral);
		if (u > 3 || u < -3) u = Math.max(-3, Math.min(3, u));
		else integral += (e * dt) / Math.max(0.01, ti);
		out.push({ t, y, u });
		delayed.push(u);
		const ud = delayed.length > steps ? delayed[delayed.length - 1 - steps] : 0;
		if (p.kind === 'first') y += ((p.k * ud - y) / Math.max(0.01, p.t)) * dt;
		else if (p.kind === 'integrating') y += p.k * ud * dt;
		else {
			const a = wn * wn * (p.k * ud - y) - 2 * p.zeta * wn * v;
			v += a * dt;
			y += v * dt;
		}
	}
	return out;
}

/** Overshoot (fraction above 1) and 2 % settling time of a closed-loop response. */
export function performance(curve: { t: number; y: number }[]): {
	overshoot: number;
	settling: number | null;
} {
	const overshoot = Math.max(0, Math.max(...curve.map((s) => s.y)) - 1);
	let settling: number | null = null;
	for (let i = curve.length - 1; i >= 0; i--) {
		if (Math.abs(curve[i].y - 1) > 0.02) {
			settling = i === curve.length - 1 ? null : curve[i + 1].t;
			break;
		}
		if (i === 0) settling = 0;
	}
	return { overshoot, settling };
}

/* ---------- control cabinet: 24 V supply ---------- */

export interface Load {
	name: string;
	count: number;
	/** amps each */
	amps: number;
}

export const PSU_SIZES = [2.5, 5, 10, 20, 40];

export function psuSize(
	loads: Load[],
	reserve = 0.25
): { total: number; needed: number; psu: number | null } {
	const total = loads.reduce((n, l) => n + l.count * l.amps, 0);
	const needed = total * (1 + reserve);
	return { total, needed, psu: PSU_SIZES.find((s) => s >= needed) ?? null };
}

/** Voltage at the end of a two-wire copper cable. */
export function voltageAtLoad(supply: number, amps: number, lengthM: number, mm2: number): number {
	const rho = 0.0175; // Ω·mm²/m, copper
	return supply - (2 * lengthM * amps * rho) / mm2;
}
