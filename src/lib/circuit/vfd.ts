/*
 * A frequency inverter (falownik / VFD) controlled the simple way small machines do it:
 *
 *   PLC → VFD   digital inputs DI1 RUN (forward), DI2 REV (reverse), DI3 RESET (fault reset, edge)
 *               analog input AI1 = speed setpoint, 0 … 27648 = 0 … 50 Hz (an analog output word, QW)
 *   VFD → PLC   relay outputs READY (no fault), FAULT, AT SPEED
 *               analog output AO1 = actual frequency, 0 … 27648 = 0 … 50 Hz (an analog input word, IW)
 *
 * It ramps like a real drive (acceleration and deceleration ramps) and can trip on a fault,
 * which has to be reset by the PLC.
 */

export const VFD_MAX_HZ = 50;
export const VFD_RAMP_HZ_PER_S = 50 / 3; // 0 → 50 Hz in 3 s
export const RAW_FULL = 27648;

export interface VfdInputs {
	run: boolean;
	rev: boolean;
	reset: boolean;
	/** AI1 raw value 0 … 27648 */
	setpoint: number;
}

export interface VfdOutputs {
	ready: boolean;
	fault: boolean;
	atSpeed: boolean;
	/** AO1 raw value 0 … 27648 */
	actual: number;
}

export interface VfdState {
	/** signed output frequency, negative = reverse */
	hz: number;
	fault: string | null;
	lastReset: boolean;
}

export const newVfd = (): VfdState => ({ hz: 0, fault: null, lastReset: false });

export const FAULTS = {
	overcurrent: 'F001 przetężenie',
	reversing: 'F002 zmiana kierunku przy pracy',
	overload: 'F003 przeciążenie silnika'
} as const;

export function stepVfd(
	s: VfdState,
	i: VfdInputs,
	dtMs: number
): { state: VfdState; out: VfdOutputs } {
	let fault = s.fault;
	// fault reset on a rising edge of RESET, only when RUN is off (like most drives)
	if (i.reset && !s.lastReset && !i.run && !i.rev) fault = null;
	// asking for both directions at once while running is a classic programming mistake
	if (i.run && i.rev && Math.abs(s.hz) > 1 && !fault) fault = FAULTS.reversing;

	const sp = (Math.min(RAW_FULL, Math.max(0, i.setpoint)) / RAW_FULL) * VFD_MAX_HZ;
	const target = fault ? 0 : i.run && !i.rev ? sp : i.rev && !i.run ? -sp : 0;
	const step = (VFD_RAMP_HZ_PER_S * dtMs) / 1000;
	let hz = s.hz;
	if (fault)
		hz = Math.abs(hz) < step * 4 ? 0 : hz - Math.sign(hz) * step * 4; // coasts to a stop
	else if (hz < target) hz = Math.min(target, hz + step);
	else if (hz > target) hz = Math.max(target, hz - step);

	const state = { hz, fault, lastReset: i.reset };
	return {
		state,
		out: {
			ready: fault === null,
			fault: fault !== null,
			atSpeed: fault === null && target !== 0 && Math.abs(hz - target) < 0.5,
			actual: Math.round((Math.abs(hz) / VFD_MAX_HZ) * RAW_FULL)
		}
	};
}

/** Trips the drive (from the "fault" button on the device). */
export const tripVfd = (s: VfdState, fault: string = FAULTS.overcurrent): VfdState => ({
	...s,
	fault
});
