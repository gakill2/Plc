import { describe, expect, it } from 'vitest';
import {
	DEFAULT_PARAMS,
	DRIVE_FAULTS,
	newDrive,
	stepDrive,
	ZSW,
	type DriveParams,
	type DriveState
} from './drive.js';

const OFF = 0x047e;
const ON = 0x047f;

function run(
	s: DriveState,
	stw: number,
	nsoll: number,
	ms: number,
	p: DriveParams = DEFAULT_PARAMS
) {
	let zsw = 0;
	let nist = 0;
	for (let t = 0; t < ms; t += 10) {
		const r = stepDrive(s, stw, nsoll, p, 10);
		s = r.state;
		zsw = r.out.zsw;
		nist = r.out.nist;
	}
	return { s, zsw, nist };
}

describe('PROFIdrive drive', () => {
	it('needs 047E before 047F, then runs to the setpoint', () => {
		let r = run(newDrive(), ON, 8192, 100);
		expect(r.s.state).toBe('S1'); // switching on inhibited: ON without the OFF edge
		r = run(r.s, OFF, 8192, 50);
		expect(r.s.state).toBe('S2');
		expect(r.zsw & ZSW.READY_TO_SWITCH_ON).toBeTruthy();
		r = run(r.s, ON, 8192, 2000);
		expect(r.s.state).toBe('S4');
		expect(r.s.hz).toBeCloseTo(25, 1);
		expect(r.nist).toBe(8192);
		expect(r.zsw & ZSW.AT_SETPOINT).toBeTruthy();
	});

	it('OFF1 ramps down to S2, OFF2 coasts to S1', () => {
		let r = run(run(newDrive(), OFF, 16384, 50).s, ON, 16384, 4000);
		r = run(r.s, OFF, 16384, 4000);
		expect(r.s.state).toBe('S2');
		expect(r.s.hz).toBe(0);
		r = run(run(r.s, ON, 16384, 4000).s, ON & ~0x0002, 16384, 3000);
		expect(r.s.state).toBe('S1');
	});

	it('trips on DC overvoltage when a flywheel is braked too fast, unless there is a resistor', () => {
		const flywheel = { ...DEFAULT_PARAMS, inertia: 0.1, load: 0.1, rampUp: 10, rampDown: 3 };
		let r = run(run(newDrive(), OFF, 16384, 50, flywheel).s, ON, 16384, 11_000, flywheel);
		expect(r.s.state).toBe('S4');
		r = run(r.s, OFF, 16384, 3000, flywheel);
		expect(r.s.fault).toBe(DRIVE_FAULTS.overvoltage);

		const slow = { ...flywheel, rampDown: 8 };
		r = run(
			run(run(newDrive(), OFF, 16384, 50, slow).s, ON, 16384, 11_000, slow).s,
			OFF,
			16384,
			9000,
			slow
		);
		expect(r.s.fault).toBeNull();
		expect(r.s.state).toBe('S2');

		const resistor = { ...flywheel, brakingResistor: true };
		r = run(
			run(run(newDrive(), OFF, 16384, 50, resistor).s, ON, 16384, 11_000, resistor).s,
			OFF,
			16384,
			4000,
			resistor
		);
		expect(r.s.fault).toBeNull();
	});

	it('trips on overcurrent when a flywheel is accelerated too fast', () => {
		const p = { ...DEFAULT_PARAMS, inertia: 0.1, load: 0.1, rampUp: 1 };
		const r = run(run(newDrive(), OFF, 16384, 50, p).s, ON, 16384, 1000, p);
		expect(r.s.fault).toBe(DRIVE_FAULTS.overcurrent);
	});

	it('overheats an overloaded motor and needs an acknowledge edge', () => {
		const p = { ...DEFAULT_PARAMS, load: 1.3 };
		let r = run(run(newDrive(), OFF, 16384, 50, p).s, ON, 16384, 60_000, p);
		expect(r.s.fault).toBe(DRIVE_FAULTS.motorOverload);
		expect(r.zsw & ZSW.FAULT).toBeTruthy();
		r = run(r.s, OFF, 0, 1000, p);
		expect(r.s.state).toBe('FAULT');
		r = run(r.s, OFF | 0x80, 0, 50, p);
		expect(r.s.fault).toBeNull(); // acknowledged: S1, and with 047E straight on to S2
		expect(r.s.state).toBe('S2');
	});
});
