import type { CraneState, ProcessIO, ProcessModel } from './types.js';

/**
 * Overhead crane trolley on a 10 m runway, with a hoist.
 *
 * - Q0.0 Left, Q0.1 Right: travel contactors (never both!)
 * - Q0.2 Fast: 1 m/s instead of 0.2 m/s
 * - Q0.3 HookUp, Q0.4 HookDown: hoist
 * - IW4 Position: incremental encoder, mm from the left end (0 … 10000)
 * - I0.0 LimitLeft, I0.1 LimitRight: end limit switches, wired NC (1 = not reached)
 * - I0.2 HookTop, I0.3 HookBottom: hoist end positions
 *
 * The trolley has mass: it needs about 0.5 m to stop from full speed, so it has to slow down
 * before the target. Moving with the hook lowered makes the load swing.
 */
export class CraneProcess implements ProcessModel {
	static readonly LENGTH = 10_000;
	static readonly FAST = 1000;
	static readonly SLOW = 200;
	/** mm/s² — acceleration and braking */
	static readonly ACCEL = 1000;
	/** limit switches act this far from the ends */
	static readonly LIMIT = 150;
	/** hitting the buffers faster than this is a crash */
	static readonly CRASH_SPEED = 250;
	static readonly HOOK_SPEED = 0.5;

	readonly kind = 'crane';
	readonly sensors = ['I0.0', 'I0.1', 'I0.2', 'I0.3', 'IW4'] as const;

	x = 5000;
	v = 0;
	/** 0 = hook at the top, 1 = at the bottom */
	hook = 0;
	crashes = 0;
	swings = 0;
	shorts = 0;
	lastFault: string | null = null;
	#cmd = { left: false, right: false, fast: false, up: false, down: false };
	#both = false;
	#swinging = false;

	step(dtMs: number, io: ProcessIO): void {
		const s = dtMs / 1000;
		const cmd = {
			left: io.output('Q0.0'),
			right: io.output('Q0.1'),
			fast: io.output('Q0.2'),
			up: io.output('Q0.3'),
			down: io.output('Q0.4')
		};
		this.#cmd = cmd;

		const both = cmd.left && cmd.right;
		if (both && !this.#both) {
			this.shorts++;
			this.lastFault = 'Left i Right naraz — zwarcie w obwodzie silnika jazdy!';
		}
		this.#both = both;

		const dir = both ? 0 : cmd.right ? 1 : cmd.left ? -1 : 0;
		const target = dir * (cmd.fast ? CraneProcess.FAST : CraneProcess.SLOW);
		const dv = CraneProcess.ACCEL * s;
		this.v = Math.abs(target - this.v) <= dv ? target : this.v + Math.sign(target - this.v) * dv;
		this.x += this.v * s;

		if (this.x <= 0 || this.x >= CraneProcess.LENGTH) {
			if (Math.abs(this.v) > CraneProcess.CRASH_SPEED) {
				this.crashes++;
				this.lastFault = 'Wózek uderzył w odbojnik na końcu toru!';
			}
			this.x = Math.min(CraneProcess.LENGTH, Math.max(0, this.x));
			this.v = 0;
		}

		const swinging = Math.abs(this.v) > 1 && this.hook > 0.05;
		if (swinging && !this.#swinging) {
			this.swings++;
			this.lastFault = 'Jazda z opuszczonym hakiem — ładunek się buja!';
		}
		this.#swinging = swinging;

		const hookDir = cmd.up && !cmd.down ? -1 : cmd.down && !cmd.up ? 1 : 0;
		this.hook = Math.min(1, Math.max(0, this.hook + hookDir * CraneProcess.HOOK_SPEED * s));

		io.input('I0.0', this.x > CraneProcess.LIMIT);
		io.input('I0.1', this.x < CraneProcess.LENGTH - CraneProcess.LIMIT);
		io.input('I0.2', this.hook <= 0.01);
		io.input('I0.3', this.hook >= 0.99);
		io.setWord('IW4', Math.round(this.x));
	}

	command(name: string, value?: unknown): void {
		if (name === 'position' && typeof value === 'number') {
			this.x = Math.min(CraneProcess.LENGTH, Math.max(0, value));
			this.v = 0;
		}
		if (name === 'hook' && typeof value === 'number') this.hook = Math.min(1, Math.max(0, value));
		if (name === 'clear') {
			this.crashes = this.swings = this.shorts = 0;
			this.lastFault = null;
		}
	}

	state(): CraneState {
		return {
			kind: 'crane',
			x: this.x,
			v: this.v,
			hook: this.hook,
			...this.#cmd,
			crashes: this.crashes,
			swings: this.swings,
			shorts: this.shorts,
			lastFault: this.lastFault
		};
	}
}
