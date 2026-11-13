import { Plc, ProgramError } from '#lib/engine/index.js';
import type { RuntimeCommand, RuntimeEvent, RuntimeSnapshot, RuntimeStatus } from './protocol.js';

/** Fixed simulated scan time. Real time is converted into a whole number of scans. */
export const SCAN_MS = 10;
/** Upper bound of scans per tick, so a slow frame or a huge speed cannot freeze the worker. */
export const MAX_SCANS_PER_TICK = 500;
export const SPEEDS = [0.1, 0.25, 0.5, 1, 2, 5, 10] as const;

/**
 * Everything the PLC worker does, without the worker. The worker only forwards messages and
 * calls `tick` with real elapsed time — which keeps this class testable in Node.
 */
export class RuntimeCore {
	readonly plc = new Plc();
	#paused = false;
	#speed = 1;
	#debtMs = 0;

	get status(): RuntimeStatus {
		const mode = this.plc.mode;
		if (mode === 'RUN' && this.#paused) return 'PAUSED';
		return mode;
	}

	get speed(): number {
		return this.#speed;
	}

	/** Applies a command. Returns an event to send back, if any. */
	handle(cmd: RuntimeCommand): RuntimeEvent | null {
		switch (cmd.type) {
			case 'load':
				try {
					this.plc.load(cmd.program);
				} catch (e) {
					if (!(e instanceof ProgramError)) throw e;
					return { type: 'loadError', message: e.message, issues: e.issues };
				}
				this.#paused = false;
				this.#debtMs = 0;
				return null;
			case 'run':
				if (this.plc.run()) this.#paused = false;
				return null;
			case 'pause':
				if (this.plc.mode === 'RUN') this.#paused = true;
				return null;
			case 'step':
				if (this.plc.mode === 'STOP' && this.plc.run()) this.#paused = true;
				if (this.status === 'PAUSED') this.plc.scan(SCAN_MS);
				return null;
			case 'stop':
				this.plc.stop();
				this.#paused = false;
				this.#debtMs = 0;
				return null;
			case 'reset':
				this.plc.reset();
				this.#paused = false;
				this.#debtMs = 0;
				return null;
			case 'setInput':
				this.plc.setInput(cmd.address, cmd.value);
				return null;
			case 'setSpeed':
				if (cmd.speed > 0 && Number.isFinite(cmd.speed)) this.#speed = cmd.speed;
				return null;
		}
	}

	/** Advances simulated time by `realMs × speed`. Returns the number of scans executed. */
	tick(realMs: number): number {
		if (this.status !== 'RUN') return 0;
		this.#debtMs += Math.max(0, realMs) * this.#speed;
		let scans = 0;
		while (this.#debtMs >= SCAN_MS && scans < MAX_SCANS_PER_TICK) {
			if (!this.plc.scan(SCAN_MS)) break;
			this.#debtMs -= SCAN_MS;
			scans++;
		}
		if (scans === MAX_SCANS_PER_TICK) this.#debtMs = 0; // fall behind instead of spiralling
		return scans;
	}

	snapshot(): RuntimeSnapshot {
		return { ...this.plc.snapshot(), status: this.status, speed: this.#speed, scanMs: SCAN_MS };
	}
}
