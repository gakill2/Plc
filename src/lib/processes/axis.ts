import { faultCommand, type AxisState, type ProcessIO, type ProcessModel } from './types.js';

/**
 * A linear servo axis with a positioning drive and a gripper — a pick-and-place unit. The drive
 * runs the PLCopen axis state machine and the motion profile; the PLC talks to it through a
 * small telegram, which the MC_* blocks of the library wrap:
 *
 * PLC → drive: Q64.0 Enable · Q64.1 Reset (rising edge) · QW66 command (1 home, 2 absolute,
 *   3 relative, 4 velocity, 5 stop) · QW68 sequence number (a new number starts the command) ·
 *   QD70 position / distance (µm) · QD74 velocity (µm/s, signed for velocity mode) ·
 *   QD78 acceleration = deceleration (µm/s²)
 * drive → PLC: I64.0 PowerOn · I64.1 Homed · I64.2 Error (ErrorStop) · I64.3 Standstill ·
 *   I64.4 InVelocity · I64.5 Done · I64.6 Busy · I65.2 command rejected · I65.0 / I65.1 hardware
 *   limit switches (NC, 1 = free) · IW66 acknowledged sequence number · IW68 ErrorID ·
 *   ID70 actual position (µm) · ID74 actual velocity (µm/s)
 *
 * Gripper: Q0.0 closes it; I0.0 a part waits at the pick station, I0.1 gripper closed.
 * The axis runs from 0 to 1000 mm (software limits once homed); the reference switch is at the
 * left end, the hardware limit switches 20 mm beyond the software limits.
 */
export type AxisMode =
	| 'Disabled'
	| 'Standstill'
	| 'Homing'
	| 'DiscreteMotion'
	| 'ContinuousMotion'
	| 'Stopping'
	| 'ErrorStop';

export const AXIS_ERRORS: Record<number, string> = {
	1: 'oś niezałączona (MC_Power)',
	2: 'oś niezbazowana — ruch absolutny wymaga bazowania',
	3: 'cel poza wyłącznikami programowymi (0 … 1000 mm)',
	4: 'najechany wyłącznik krańcowy',
	5: 'błąd nadążania (oś zablokowana)',
	6: 'błąd napędu (przeciążenie)',
	7: 'oś w stanie ErrorStop — najpierw MC_Reset',
	8: 'za duża prędkość lub przyspieszenie',
	9: 'nieznane polecenie'
};

export class AxisProcess implements ProcessModel {
	/** physical rail, mm: the reference switch and the hardware limits */
	static readonly REF = 20;
	static readonly HW_MIN = 0;
	static readonly HW_MAX = 1040;
	static readonly SW_MIN = 0;
	static readonly SW_MAX = 1000;
	static readonly V_MAX = 1000;
	static readonly A_MAX = 5000;
	static readonly HOMING_V = 50;
	static readonly FOLLOW_MAX = 5;
	static readonly PICK = 100;
	static readonly PLACE = 800;

	readonly kind = 'axis';
	readonly sensors = [
		'I0.0',
		'I0.1',
		'I64.0',
		'I64.1',
		'I64.2',
		'I64.3',
		'I64.4',
		'I64.5',
		'I64.6',
		'I65.0',
		'I65.1',
		'I65.2',
		'IW66',
		'IW68',
		'ID70',
		'ID74'
	] as const;

	/** physical position of the carriage, mm (unknown to the PLC until homing) */
	x = 312.5;
	/** position setpoint, mm (physical) */
	sp = 312.5;
	v = 0;
	mode: AxisMode = 'Disabled';
	homed = false;
	/** axis position = physical − offset */
	offset = 0;
	errorId = 0;
	cmdRejected = false;
	done = false;
	inVelocity = false;
	#seq = 0;
	#target = 0;
	#vel = 0;
	#acc = 1000;
	#homePos = 0;
	#powerMs = 0;
	#resetWas = false;
	/** gripper */
	gripper = false;
	#gripMs = 0;
	holding = false;
	partAtPick = true;
	#feedMs = 0;
	delivered = 0;
	dropped = 0;
	lastEvent: string | null = null;
	readonly broken = new Set<string>();

	get axisX() {
		return this.x - this.offset;
	}

	#error(id: number) {
		this.mode = 'ErrorStop';
		this.errorId = id;
		this.done = false;
		this.lastEvent = `ErrorStop: ${AXIS_ERRORS[id]}`;
	}

	#accept(io: ProcessIO) {
		const seq = io.word('QW68');
		if (seq === this.#seq) return;
		this.#seq = seq;
		this.cmdRejected = false;
		this.done = false;
		const cmd = io.word('QW66');
		const pos = io.word('QD70') / 1000;
		const vel = io.word('QD74') / 1000;
		const acc = io.word('QD78') / 1000;
		const reject = (id: number) => {
			this.cmdRejected = true;
			this.errorId = id;
		};
		if (this.mode === 'Disabled') return reject(1);
		if (this.mode === 'ErrorStop') return reject(7);
		if (Math.abs(vel) > AxisProcess.V_MAX || acc > AxisProcess.A_MAX) return reject(8);
		this.#acc = Math.max(100, acc || 1000);
		switch (cmd) {
			case 1:
				this.#homePos = pos;
				this.homed = false;
				this.mode = 'Homing';
				return;
			case 2:
			case 3: {
				if (cmd === 2 && !this.homed) return reject(2);
				const target =
					cmd === 2 ? pos : (this.mode === 'DiscreteMotion' ? this.#target : this.axisX) + pos;
				if (this.homed && (target < AxisProcess.SW_MIN || target > AxisProcess.SW_MAX))
					return reject(3);
				this.#target = target;
				this.#vel = Math.max(1, Math.abs(vel || 100));
				this.mode = 'DiscreteMotion';
				return;
			}
			case 4:
				this.#vel = vel;
				this.mode = 'ContinuousMotion';
				this.inVelocity = false;
				return;
			case 5:
				this.mode = 'Stopping';
				return;
			default:
				return reject(9);
		}
	}

	/** v toward `target` velocity, limited by the acceleration */
	#ramp(target: number, acc: number, s: number) {
		const dv = acc * s;
		this.v = this.v < target ? Math.min(target, this.v + dv) : Math.max(target, this.v - dv);
	}

	step(dtMs: number, io: ProcessIO): void {
		const s = dtMs / 1000;
		const enable = io.output('Q64.0');
		const reset = io.output('Q64.1');

		// power
		if (!enable) {
			if (this.mode !== 'ErrorStop') this.mode = 'Disabled';
			this.#powerMs = 0;
			this.v = 0;
		} else if (this.mode === 'Disabled') {
			this.#powerMs += dtMs;
			if (this.#powerMs >= 100) this.mode = 'Standstill';
		}
		// reset of an error
		if (reset && !this.#resetWas && this.mode === 'ErrorStop' && Math.abs(this.v) < 0.01) {
			this.errorId = 0;
			this.mode = enable ? 'Standstill' : 'Disabled';
			this.lastEvent = 'Reset';
		}
		this.#resetWas = reset;

		if (enable) this.#accept(io);

		// motion profile
		const a = this.#acc;
		switch (this.mode) {
			case 'Homing': {
				if (this.x <= AxisProcess.REF) {
					// the reference switch: this point is the home position
					this.offset = AxisProcess.REF - this.#homePos;
					this.homed = true;
					this.sp = this.x;
					this.#target = this.axisX;
					this.mode = 'Stopping';
					this.lastEvent = `Bazowanie: ${this.#homePos} mm na wyłączniku referencyjnym`;
				} else this.#ramp(-AxisProcess.HOMING_V, a, s);
				break;
			}
			case 'DiscreteMotion': {
				const dist = this.#target + this.offset - this.sp;
				const vDes = Math.sign(dist) * Math.min(this.#vel, Math.sqrt(2 * a * Math.abs(dist)));
				this.#ramp(vDes, a, s);
				if (
					Math.abs(dist) < 0.0005 ||
					(Math.sign(dist) !== Math.sign(this.v) && Math.abs(dist) < 0.5)
				) {
					this.sp = this.#target + this.offset;
					this.v = 0;
					this.mode = 'Standstill';
					this.done = true;
				}
				break;
			}
			case 'ContinuousMotion':
				this.#ramp(this.#vel, a, s);
				this.inVelocity = Math.abs(this.v - this.#vel) < 0.5;
				break;
			case 'Stopping':
			case 'ErrorStop':
				this.#ramp(0, this.mode === 'ErrorStop' ? AxisProcess.A_MAX : a, s);
				if (this.v === 0 && this.mode === 'Stopping') {
					this.mode = 'Standstill';
					this.done = true;
				}
				break;
		}
		if (this.mode !== 'DiscreteMotion' || this.v !== 0) {
			// a discrete move snaps onto its target above; elsewhere the setpoint integrates v
			if (this.mode !== 'Standstill') this.sp += this.v * s;
		}

		// the servo follows the setpoint — unless the carriage is blocked
		if (this.broken.has('blocked')) {
			if (Math.abs(this.sp - this.x) > AxisProcess.FOLLOW_MAX && this.mode !== 'ErrorStop') {
				this.#error(5);
				this.sp = this.x;
			}
		} else this.x = this.sp;
		if (this.broken.has('overload') && Math.abs(this.v) > 1 && this.mode !== 'ErrorStop')
			this.#error(6);

		// hardware limits and software limits
		const limNeg = this.x <= AxisProcess.HW_MIN;
		const limPos = this.x >= AxisProcess.HW_MAX;
		if ((limNeg && this.v < 0) || (limPos && this.v > 0)) {
			this.v = 0;
			this.sp = this.x = Math.min(Math.max(this.x, AxisProcess.HW_MIN), AxisProcess.HW_MAX);
			if (this.mode !== 'ErrorStop') this.#error(4);
		}
		if (
			this.homed &&
			this.mode === 'ContinuousMotion' &&
			(this.axisX < AxisProcess.SW_MIN || this.axisX > AxisProcess.SW_MAX)
		)
			this.#error(3);

		// gripper and parts
		this.#gripMs = this.gripper === io.output('Q0.0') ? this.#gripMs + dtMs : 0;
		const wants = io.output('Q0.0');
		if (wants !== this.gripper) {
			this.gripper = wants;
			const here = (p: number) =>
				this.homed && Math.abs(this.axisX - p) <= 1 && Math.abs(this.v) < 0.01;
			if (wants && here(AxisProcess.PICK) && this.partAtPick) {
				this.holding = true;
				this.partAtPick = false;
				this.#feedMs = 0;
			} else if (!wants && this.holding) {
				this.holding = false;
				if (here(AxisProcess.PLACE)) {
					this.delivered++;
					this.lastEvent = 'Detal odłożony';
				} else {
					this.dropped++;
					this.lastEvent = `Detal upuszczony przy ${this.axisX.toFixed(1)} mm`;
				}
			}
		}
		if (this.holding && Math.abs(this.v) > 0 && !this.gripper) this.holding = false;
		if (!this.partAtPick) {
			this.#feedMs += dtMs;
			if (this.#feedMs >= 3000 && !(this.holding && Math.abs(this.axisX - AxisProcess.PICK) < 1))
				this.partAtPick = true;
		}

		const errorStop = this.mode === 'ErrorStop';
		io.input('I0.0', this.partAtPick);
		io.input('I0.1', this.gripper && this.#gripMs >= 300);
		io.input('I64.0', this.mode !== 'Disabled' && !(errorStop && !enable));
		io.input('I64.1', this.homed);
		io.input('I64.2', errorStop);
		io.input('I64.3', this.mode === 'Standstill');
		io.input('I64.4', this.mode === 'ContinuousMotion' && this.inVelocity);
		io.input('I64.5', this.done);
		io.input(
			'I64.6',
			['Homing', 'DiscreteMotion', 'ContinuousMotion', 'Stopping'].includes(this.mode)
		);
		io.input('I65.0', !limNeg);
		io.input('I65.1', !limPos);
		io.input('I65.2', this.cmdRejected);
		io.setWord('IW66', this.#seq);
		io.setWord('IW68', this.errorId);
		io.setWord('ID70', Math.round(this.axisX * 1000));
		io.setWord('ID74', Math.round(this.v * 1000));
	}

	command(name: string, value?: unknown): void {
		const f = name === 'fault' ? faultCommand(value) : null;
		if (f) {
			if (f.on) this.broken.add(f.id);
			else this.broken.delete(f.id);
		}
		if (name === 'clear') {
			this.delivered = this.dropped = 0;
			this.lastEvent = null;
		}
	}

	state(): AxisState {
		return {
			kind: 'axis',
			position: this.axisX,
			physical: this.x,
			velocity: this.v,
			mode: this.mode,
			homed: this.homed,
			errorId: this.errorId,
			rejected: this.cmdRejected,
			gripper: this.gripper,
			holding: this.holding,
			partAtPick: this.partAtPick,
			delivered: this.delivered,
			dropped: this.dropped,
			lastEvent: this.lastEvent
		};
	}
}
