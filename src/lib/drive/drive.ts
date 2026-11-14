/**
 * A frequency inverter controlled over a fieldbus, the way PROFIdrive drives (SINAMICS and others)
 * work: the PLC sends a control word STW1 and a speed setpoint NSOLL_A every bus cycle, the drive
 * answers with a status word ZSW1 and the actual speed NIST_A.
 *
 * It also has a little physics, so the classic faults happen for the classic reasons: a big
 * flywheel braked too fast pushes energy back into the DC link (overvoltage), accelerating it too
 * fast draws too much current, an overloaded motor heats up.
 */

/* ---------- control word STW1 ---------- */
export const STW = {
	ON: 1 << 0,
	NO_OFF2: 1 << 1,
	NO_OFF3: 1 << 2,
	ENABLE_OPERATION: 1 << 3,
	ENABLE_RAMP: 1 << 4,
	CONTINUE_RAMP: 1 << 5,
	ENABLE_SETPOINT: 1 << 6,
	ACK: 1 << 7,
	CONTROL_BY_PLC: 1 << 10
} as const;

/* ---------- status word ZSW1 ---------- */
export const ZSW = {
	READY_TO_SWITCH_ON: 1 << 0,
	READY: 1 << 1,
	OPERATION_ENABLED: 1 << 2,
	FAULT: 1 << 3,
	NO_OFF2: 1 << 4,
	NO_OFF3: 1 << 5,
	SWITCHING_ON_INHIBITED: 1 << 6,
	AT_SETPOINT: 1 << 8,
	CONTROL_REQUESTED: 1 << 9
} as const;

export const STW_BITS: { bit: number; name: string; text: string }[] = [
	{ bit: 0, name: 'ON / OFF1', text: '1 = załącz; 0 = zatrzymanie rampą (OFF1)' },
	{ bit: 1, name: 'OFF2', text: '0 = wybieg (impulsy wyłączone od razu)' },
	{ bit: 2, name: 'OFF3', text: '0 = szybkie zatrzymanie' },
	{ bit: 3, name: 'Praca', text: '1 = zezwolenie na pracę (impulsy)' },
	{ bit: 4, name: 'Rampa', text: '1 = zezwolenie generatora rampy' },
	{ bit: 5, name: 'Rampa dalej', text: '0 = zamroź rampę' },
	{ bit: 6, name: 'Zadana', text: '1 = zezwolenie wartości zadanej' },
	{ bit: 7, name: 'Kwitowanie', text: 'zbocze 0→1 kwituje błąd' },
	{ bit: 10, name: 'Sterowanie z PLC', text: '1 = napęd przyjmuje słowo sterujące' }
];

export const ZSW_BITS: { bit: number; name: string }[] = [
	{ bit: 0, name: 'Gotowy do załączenia' },
	{ bit: 1, name: 'Gotowy do pracy' },
	{ bit: 2, name: 'Praca' },
	{ bit: 3, name: 'Błąd' },
	{ bit: 4, name: 'Brak OFF2' },
	{ bit: 5, name: 'Brak OFF3' },
	{ bit: 6, name: 'Blokada załączenia' },
	{ bit: 8, name: 'Prędkość = zadana' },
	{ bit: 9, name: 'Żądanie sterowania' }
];

/** PROFIdrive device states. */
export type DriveStateId = 'S1' | 'S2' | 'S3' | 'S4' | 'FAULT';

export const STATE_NAMES: Record<DriveStateId, string> = {
	S1: 'S1 · Blokada załączenia',
	S2: 'S2 · Gotowy do załączenia',
	S3: 'S3 · Gotowy do pracy',
	S4: 'S4 · Praca',
	FAULT: 'Błąd'
};

export const DRIVE_FAULTS = {
	overcurrent: 'F30001 przetężenie',
	overvoltage: 'F30002 przepięcie w obwodzie DC',
	motorOverload: 'F07011 przegrzanie silnika (I²t)'
} as const;

/** Drive parameters (numbers like in SINAMICS). */
export interface DriveParams {
	/** P1082 maximum frequency, Hz (= 100 % = 16#4000 of the setpoint) */
	maxHz: number;
	/** P1120 ramp-up time 0 → max, s */
	rampUp: number;
	/** P1121 ramp-down time max → 0, s */
	rampDown: number;
	/** P1135 OFF3 (quick stop) ramp-down time, s */
	rampOff3: number;
	/** braking resistor with a chopper fitted */
	brakingResistor: boolean;
	/** load inertia, per-unit seconds (light ≈ 0.01, flywheel ≈ 0.1) */
	inertia: number;
	/** load torque, per unit of rated (0.3 = light conveyor, 1.3 = overloaded) */
	load: number;
}

export const DEFAULT_PARAMS: DriveParams = {
	maxHz: 50,
	rampUp: 3,
	rampDown: 3,
	rampOff3: 1,
	brakingResistor: false,
	inertia: 0.01,
	load: 0.3
};

export interface DriveState {
	state: DriveStateId;
	hz: number;
	/** DC link voltage, V */
	vdc: number;
	/** motor current, per unit of rated */
	current: number;
	/** motor thermal model 0 … 1 (1 = trip) */
	thermal: number;
	fault: string | null;
	stopping: 'off1' | 'off3' | 'coast' | null;
	lastAck: boolean;
	/** braking resistor is dissipating */
	braking: boolean;
}

export const VDC_NOMINAL = 560;
export const VDC_TRIP = 820;
export const VDC_CHOPPER = 760;
export const CURRENT_TRIP = 3;

export const newDrive = (): DriveState => ({
	state: 'S1',
	hz: 0,
	vdc: VDC_NOMINAL,
	current: 0,
	thermal: 0,
	fault: null,
	stopping: null,
	lastAck: false,
	braking: false
});

export interface DriveOutputs {
	zsw: number;
	/** actual speed, 16#4000 = 100 % */
	nist: number;
}

const has = (word: number, bit: number) => (word & bit) !== 0;

/** One step of the drive: control word and setpoint in, status word and actual speed out. */
export function stepDrive(
	s: DriveState,
	stw: number,
	nsoll: number,
	p: DriveParams,
	dtMs: number
): { state: DriveState; out: DriveOutputs } {
	const dt = dtMs / 1000;
	const n: DriveState = { ...s };
	const plc = has(stw, STW.CONTROL_BY_PLC);
	const on = plc && has(stw, STW.ON);
	const off2 = !plc || !has(stw, STW.NO_OFF2);
	const off3 = plc && !has(stw, STW.NO_OFF3);
	const ack = plc && has(stw, STW.ACK);

	/* ---- state machine ---- */
	if (n.state === 'FAULT') {
		if (ack && !s.lastAck && Math.abs(n.hz) < 0.5) {
			n.fault = null;
			n.state = 'S1';
		}
	} else if (n.state === 'S1') {
		if (!off2 && !off3 && !on) n.state = 'S2';
	} else if (n.state === 'S2') {
		if (off2 || off3) n.state = 'S1';
		else if (on) n.state = 'S3';
	} else if (n.state === 'S3') {
		if (off2 || off3) n.state = 'S1';
		else if (!on) n.state = 'S2';
		else if (has(stw, STW.ENABLE_OPERATION)) {
			n.state = 'S4';
			n.stopping = null;
		}
	} else if (n.state === 'S4') {
		if (off2) n.stopping = 'coast';
		else if (off3) n.stopping = 'off3';
		else if (!on) n.stopping = n.stopping === 'off3' ? 'off3' : 'off1';
		else if (!has(stw, STW.ENABLE_OPERATION)) n.stopping = 'coast';
		else if (n.stopping !== 'off3') n.stopping = null;
	}

	/* ---- speed ---- */
	const sp = (Math.max(-32768, Math.min(32767, nsoll)) / 16384) * p.maxHz;
	const spClamped = Math.max(-p.maxHz, Math.min(p.maxHz, sp));
	const pulses = n.state === 'S4' && n.stopping !== 'coast';
	let target = 0;
	if (pulses && !n.stopping && has(stw, STW.ENABLE_RAMP))
		target = has(stw, STW.ENABLE_SETPOINT) ? spClamped : 0;
	const hold = pulses && !n.stopping && !has(stw, STW.CONTINUE_RAMP);

	const before = n.hz;
	if (pulses && !hold) {
		const towardsZero = Math.abs(target) < Math.abs(n.hz) || Math.sign(target) !== Math.sign(n.hz);
		const time = n.stopping === 'off3' ? p.rampOff3 : towardsZero ? p.rampDown : p.rampUp;
		const rate = p.maxHz / Math.max(0.05, time);
		const step = rate * dt;
		n.hz = Math.abs(target - n.hz) <= step ? target : n.hz + Math.sign(target - n.hz) * step;
	} else if (!pulses) {
		// no pulses: the motor coasts, slowed only by the load
		const decel = ((p.load + 0.05) / Math.max(0.002, p.inertia)) * dt;
		n.hz = Math.abs(n.hz) <= decel ? 0 : n.hz - Math.sign(n.hz) * decel;
	}

	/* ---- torque, current, DC link, temperature ---- */
	const dAbs = (Math.abs(n.hz) - Math.abs(before)) / Math.max(dt, 1e-6);
	const turning = Math.abs(n.hz) > 0.1;
	const torque = pulses ? (turning ? p.load : 0) + p.inertia * dAbs : 0;
	n.current = pulses ? 0.3 + Math.abs(torque) : 0;
	const regen = pulses ? Math.max(0, -torque) * (Math.abs(n.hz) / p.maxHz) : 0;
	const vTarget = VDC_NOMINAL + 350 * regen;
	n.vdc += (vTarget - n.vdc) * Math.min(1, dt / 0.15);
	n.braking = false;
	if (p.brakingResistor && n.vdc > VDC_CHOPPER) {
		n.vdc = VDC_CHOPPER;
		n.braking = true;
	}
	n.thermal = Math.max(0, n.thermal + ((n.current ** 2 - 1) / 60) * dt);

	if (n.state !== 'FAULT') {
		const fault =
			n.current > CURRENT_TRIP
				? DRIVE_FAULTS.overcurrent
				: n.vdc > VDC_TRIP
					? DRIVE_FAULTS.overvoltage
					: n.thermal >= 1
						? DRIVE_FAULTS.motorOverload
						: null;
		if (fault) {
			n.state = 'FAULT';
			n.fault = fault;
			n.stopping = 'coast';
			n.current = 0;
		}
	}
	// stopped after OFF1 / OFF3 / coast
	if (n.state === 'S4' && n.stopping && Math.abs(n.hz) < 0.05) {
		n.hz = 0;
		n.state = n.stopping === 'off1' ? 'S2' : 'S1';
		n.stopping = null;
	}
	n.lastAck = ack;

	/* ---- status word ---- */
	let zsw = ZSW.CONTROL_REQUESTED;
	if (n.state === 'S2' || n.state === 'S3' || n.state === 'S4') zsw |= ZSW.READY_TO_SWITCH_ON;
	if (n.state === 'S3' || n.state === 'S4') zsw |= ZSW.READY;
	if (n.state === 'S4') zsw |= ZSW.OPERATION_ENABLED;
	if (n.state === 'FAULT') zsw |= ZSW.FAULT;
	if (!off2) zsw |= ZSW.NO_OFF2;
	if (!off3) zsw |= ZSW.NO_OFF3;
	if (n.state === 'S1') zsw |= ZSW.SWITCHING_ON_INHIBITED;
	if (n.state === 'S4' && !n.stopping && Math.abs(n.hz - target) < 1) zsw |= ZSW.AT_SETPOINT;

	return { state: n, out: { zsw, nist: Math.round((n.hz / p.maxHz) * 16384) } };
}

/** Trips the drive from outside (the "fault" button). */
export const tripDrive = (s: DriveState, fault: string = DRIVE_FAULTS.overcurrent): DriveState => ({
	...s,
	state: 'FAULT',
	fault,
	stopping: 'coast'
});

export const hex4 = (n: number) => `16#${(n & 0xffff).toString(16).toUpperCase().padStart(4, '0')}`;
