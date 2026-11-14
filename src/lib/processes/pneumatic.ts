import { faultCommand, type PneumaticState, type ProcessIO, type ProcessModel } from './types.js';

/**
 * Pneumatic press station: a clamp cylinder A and a press cylinder B, each driven by a
 * monostable 5/2 valve (coil on = extend, coil off = the spring returns the spool and the
 * cylinder retracts). Reed switches on both end positions, a part sensor and a pressure switch.
 *
 * - Q0.0 1Y1 clamp A extend · Q0.1 2Y1 press B extend
 * - I0.0 1B1 A retracted · I0.1 1B2 A extended · I0.2 2B1 B retracted · I0.3 2B2 B extended
 * - I0.4 PartPresent · I0.5 AirOk (pressure switch, ≥ 4 bar)
 *
 * The right sequence is A+ B+ B− A−. Pressing an unclamped part damages it; releasing the clamp
 * before the press is back up too. A finished part is taken away and a new one arrives.
 */
export class PneumaticProcess implements ProcessModel {
	/** stroke times, ms */
	static readonly A_MS = 500;
	static readonly B_OUT_MS = 800;
	static readonly B_IN_MS = 600;
	static readonly FEED_MS = 1200;

	readonly kind = 'pneumatic';
	readonly sensors = ['I0.0', 'I0.1', 'I0.2', 'I0.3', 'I0.4', 'I0.5'] as const;
	/** 0 = retracted, 1 = extended */
	a = 0;
	b = 0;
	aCmd = false;
	bCmd = false;
	part: { pressed: boolean; damaged: boolean } | null = { pressed: false, damaged: false };
	good = 0;
	scrap = 0;
	emptyStrokes = 0;
	strokes = 0;
	lastFault: string | null = null;
	autoFeed = true;
	/** plant faults: no compressed air, a leaking press cylinder (three times slower) */
	readonly broken = new Set<string>();
	#feed = 0;
	#bWasOut = false;

	get air() {
		return !this.broken.has('noAir');
	}

	step(dtMs: number, io: ProcessIO): void {
		const P = PneumaticProcess;
		this.aCmd = io.output('Q0.0');
		this.bCmd = io.output('Q0.1');
		const move = (pos: number, out: boolean, outMs: number, inMs: number) =>
			this.air ? Math.min(1, Math.max(0, pos + (out ? dtMs / outMs : -dtMs / inMs))) : pos;
		this.a = move(this.a, this.aCmd, P.A_MS, P.A_MS);
		const slow = this.broken.has('leakB') ? 3 : 1;
		this.b = move(this.b, this.bCmd, P.B_OUT_MS * slow, P.B_IN_MS * slow);

		const fault = (text: string) => (this.lastFault = text);
		const clamped = this.a >= 0.97;
		if (this.part && !this.part.damaged) {
			if (this.b > 0.2 && !clamped) {
				this.part.damaged = true;
				fault('Prasa zjechała na niezamocowany detal — detal zniszczony');
			} else if (this.b > 0.05 && this.a < 0.97 && this.part.pressed) {
				this.part.damaged = true;
				fault('Docisk zwolniony, zanim prasa wróciła do góry');
			}
		}
		const bOut = this.b >= 0.97;
		if (bOut && !this.#bWasOut) {
			this.strokes++;
			if (!this.part) {
				this.emptyStrokes++;
				fault('Pusty skok prasy — brak detalu');
			} else if (clamped && !this.part.damaged) this.part.pressed = true;
		}
		this.#bWasOut = bOut;

		// the finished part is taken away when both cylinders are back
		if (this.part?.pressed && this.a <= 0.03 && this.b <= 0.03) {
			if (this.part.damaged) this.scrap++;
			else this.good++;
			this.part = null;
			this.#feed = P.FEED_MS;
		} else if (this.part?.damaged && this.a <= 0.03 && this.b <= 0.03) {
			this.scrap++;
			this.part = null;
			this.#feed = P.FEED_MS;
		}
		if (!this.part && this.autoFeed) {
			this.#feed -= dtMs;
			if (this.#feed <= 0) this.part = { pressed: false, damaged: false };
		}

		const s = this.state().sensors;
		io.input('I0.0', s.aIn);
		io.input('I0.1', s.aOut);
		io.input('I0.2', s.bIn);
		io.input('I0.3', s.bOut);
		io.input('I0.4', s.part);
		io.input('I0.5', s.air);
	}

	command(name: string, value?: unknown): void {
		const f = name === 'fault' ? faultCommand(value) : null;
		if (f) {
			if (f.on) this.broken.add(f.id);
			else this.broken.delete(f.id);
		}
		if (name === 'autoFeed') this.autoFeed = Boolean(value);
		if (name === 'part' && !this.part) this.part = { pressed: false, damaged: false };
		if (name === 'clear') {
			this.good = this.scrap = this.emptyStrokes = this.strokes = 0;
			this.lastFault = null;
		}
	}

	state(): PneumaticState {
		return {
			kind: 'pneumatic',
			a: this.a,
			b: this.b,
			aCmd: this.aCmd,
			bCmd: this.bCmd,
			part: this.part ? { ...this.part } : null,
			good: this.good,
			scrap: this.scrap,
			emptyStrokes: this.emptyStrokes,
			strokes: this.strokes,
			autoFeed: this.autoFeed,
			lastFault: this.lastFault,
			sensors: {
				aIn: this.a <= 0.03,
				aOut: this.a >= 0.97,
				bIn: this.b <= 0.03,
				bOut: this.b >= 0.97,
				part: this.part !== null,
				air: this.air
			}
		};
	}
}
