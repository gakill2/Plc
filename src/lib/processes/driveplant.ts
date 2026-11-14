import {
	DEFAULT_PARAMS,
	newDrive,
	stepDrive,
	tripDrive,
	type DriveParams,
	type DriveState
} from '#lib/drive/drive.js';
import type { DrivePlantState, ProcessIO, ProcessModel } from './types.js';

/**
 * A drive on Profinet with standard telegram 1 (PZD-2/2):
 *
 * - QW4 STW1 control word, QW6 NSOLL_A speed setpoint (16#4000 = 100 % = 50 Hz)
 * - IW4 ZSW1 status word, IW6 NIST_A actual speed (same scaling)
 */
export class DriveProcess implements ProcessModel {
	readonly kind = 'drive';
	readonly sensors = ['IW4', 'IW6'] as const;

	params: DriveParams = { ...DEFAULT_PARAMS };
	#drive: DriveState = newDrive();
	#io = { stw: 0, nsoll: 0, zsw: 0, nist: 0 };

	step(dtMs: number, io: ProcessIO): void {
		const stw = io.word('QW4') & 0xffff;
		const nsoll = io.word('QW6');
		const { state, out } = stepDrive(this.#drive, stw, nsoll, this.params, dtMs);
		this.#drive = state;
		this.#io = { stw, nsoll, zsw: out.zsw, nist: out.nist };
		io.setWord('IW4', out.zsw);
		io.setWord('IW6', out.nist);
	}

	command(name: string, value?: unknown): void {
		if (name === 'fault') this.#drive = tripDrive(this.#drive);
		if (name === 'params' && value && typeof value === 'object')
			this.params = { ...this.params, ...(value as Partial<DriveParams>) };
	}

	state(): DrivePlantState {
		return { kind: 'drive', drive: { ...this.#drive }, ...this.#io, params: { ...this.params } };
	}
}
