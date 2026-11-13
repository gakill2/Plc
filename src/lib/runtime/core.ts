import { parseAddress, Plc, ProgramError, type Address, type NumType } from '#lib/engine/index.js';
import type {
	RuntimeCommand,
	RuntimeEvent,
	RuntimeSnapshot,
	RuntimeStatus,
	TraceSample
} from './protocol.js';

/** Fixed simulated scan time. Real time is converted into a whole number of scans. */
export const SCAN_MS = 10;
/** Upper bound of scans per tick, so a slow frame or a huge speed cannot freeze the worker. */
export const MAX_SCANS_PER_TICK = 500;
export const SPEEDS = [0.1, 0.25, 0.5, 1, 2, 5, 10] as const;

type TracePoint = { addr: Address; kind: 'bit' | 'number'; type?: NumType } | null;

/**
 * Everything the PLC worker does, without the worker. The worker only forwards messages and
 * calls `tick` with real elapsed time — which keeps this class testable in Node.
 */
export class RuntimeCore {
	readonly plc = new Plc();
	#paused = false;
	#speed = 1;
	#debtMs = 0;

	#trace: TracePoint[] = [];
	#traceEpoch = 0;
	#traceLast: number[] | null = null;
	#traceSamples: TraceSample[] = [];

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
		try {
			return this.#handle(cmd);
		} catch (e) {
			if (e instanceof ProgramError)
				return { type: 'loadError', message: e.message, issues: e.issues };
			if (e instanceof Error) return { type: 'commandError', message: e.message };
			throw e;
		}
	}

	#handle(cmd: RuntimeCommand): RuntimeEvent | null {
		switch (cmd.type) {
			case 'load':
				this.plc.load(cmd.program);
				this.#paused = false;
				this.#debtMs = 0;
				this.#restartTrace();
				return null;
			case 'run':
				if (this.plc.run()) this.#paused = false;
				return null;
			case 'pause':
				if (this.plc.mode === 'RUN') this.#paused = true;
				return null;
			case 'step':
				if (this.plc.mode === 'STOP' && this.plc.run()) this.#paused = true;
				if (this.status === 'PAUSED' && this.plc.scan(SCAN_MS)) this.#sample();
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
				this.#restartTrace();
				return null;
			case 'setInput':
				this.plc.setInput(cmd.address, cmd.value);
				return null;
			case 'setSpeed':
				if (cmd.speed > 0 && Number.isFinite(cmd.speed)) this.#speed = cmd.speed;
				return null;
			case 'force':
				this.plc.force(cmd.address, cmd.value);
				return null;
			case 'clearForces':
				this.plc.clearForces();
				return null;
			case 'modify':
				this.plc.modify(cmd.address, cmd.value, cmd.numType);
				return null;
			case 'setTrace':
				this.#trace = cmd.signals.map((s) => {
					try {
						return { addr: parseAddress(s.address), kind: s.kind, type: s.type };
					} catch {
						return null;
					}
				});
				this.#restartTrace();
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
			this.#sample();
			this.#debtMs -= SCAN_MS;
			scans++;
		}
		if (scans === MAX_SCANS_PER_TICK) this.#debtMs = 0; // fall behind instead of spiralling
		return scans;
	}

	/** Returns the current state and hands over the trace samples collected since last time. */
	snapshot(): RuntimeSnapshot {
		const samples = this.#traceSamples;
		this.#traceSamples = [];
		return {
			...this.plc.snapshot(),
			status: this.status,
			speed: this.#speed,
			scanMs: SCAN_MS,
			trace: { epoch: this.#traceEpoch, samples }
		};
	}

	#restartTrace() {
		this.#traceEpoch++;
		this.#traceLast = null;
		this.#traceSamples = [];
		this.#sample();
	}

	/** Records the traced values after a scan — only when one of them changed. */
	#sample() {
		if (this.#trace.length === 0) return;
		const mem = this.plc.memory;
		const values = this.#trace.map((p) => {
			if (!p) return NaN;
			try {
				return p.kind === 'bit' ? (mem.readBit(p.addr) ? 1 : 0) : mem.readNumber(p.addr, p.type);
			} catch {
				return NaN;
			}
		});
		const last = this.#traceLast;
		if (last && values.every((v, i) => Object.is(v, last[i]))) return;
		this.#traceLast = values;
		this.#traceSamples.push({ t: this.plc.timeMs, v: values });
	}
}
