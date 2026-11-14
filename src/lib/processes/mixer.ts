import { faultCommand, type MixerState, type ProcessIO, type ProcessModel } from './types.js';

/**
 * Batch mixer: two components A and B are dosed into a tank, mixed and heated, then drained.
 * A batch is good when A : B is about 1 : 1, the product reached 50 °C, it was stirred at least
 * 5 s and the heater never ran dry (level below 15 %).
 *
 * - Q0.0 ValveA (5 %/s) · Q0.1 ValveB (4 %/s) · Q0.2 Stirrer · Q0.3 Heater · Q0.4 Outlet (8 %/s)
 * - IW4 Level 0 … 27648 = 0 … 100 % (4–20 mA transmitter)
 * - IW6 Temperature °C × 10 (PT100)
 * - I0.0 LevelOk: high-high level switch, NC — 1 below 95 %, 0 above (overfill protection)
 */
export class MixerProcess implements ProcessModel {
	static readonly A_FLOW = 5;
	static readonly B_FLOW = 4;
	static readonly OUT_FLOW = 8;
	static readonly AMBIENT = 20;
	static readonly HH = 95;
	static readonly TARGET_C = 50;
	static readonly MIX_S = 5;
	static readonly DRY = 15;

	readonly kind = 'mixer';
	readonly sensors = ['I0.0', 'IW4', 'IW6'] as const;
	/** % of the tank */
	a = 0;
	b = 0;
	temp = MixerProcess.AMBIENT;
	valveA = false;
	valveB = false;
	stirrer = false;
	heater = false;
	outlet = false;
	good = 0;
	bad = 0;
	overflows = 0;
	dryHeating = 0;
	lastFault: string | null = null;
	lastBatch: string | null = null;
	/** the batch being made: what happened to it so far */
	#batch = { maxTemp: MixerProcess.AMBIENT, stirS: 0, dry: false, peak: 0, ratio: 0 };
	#dry = false;
	#over = false;
	/** plant faults: valve A does not close tight, the heater is dead, the stirrer motor tripped */
	readonly broken = new Set<string>();

	get level() {
		return this.a + this.b;
	}

	step(dtMs: number, io: ProcessIO): void {
		const M = MixerProcess;
		const s = dtMs / 1000;
		this.valveA = io.output('Q0.0');
		this.valveB = io.output('Q0.1');
		this.stirrer = io.output('Q0.2');
		this.heater = io.output('Q0.3');
		this.outlet = io.output('Q0.4');
		const fault = (text: string) => (this.lastFault = text);

		// dosing
		const inA = (this.valveA ? M.A_FLOW : 0) + (this.broken.has('leakA') ? 0.5 : 0);
		this.a += inA * s;
		this.b += (this.valveB ? M.B_FLOW : 0) * s;
		if (this.outlet && this.level > 0) {
			const out = Math.min(this.level, M.OUT_FLOW * s);
			const share = this.a / this.level;
			this.a -= out * share;
			this.b -= out * (1 - share);
		}
		if (this.level >= 100) {
			const k = 100 / this.level;
			this.a *= k;
			this.b *= k;
			if (!this.#over) {
				this.overflows++;
				fault('Zbiornik się przelał!');
			}
		}
		this.#over = this.level >= 99.9;
		if (this.level < 1e-6) this.a = this.b = 0;

		// heating: the less product, the faster it heats; losses to the room
		const heating = this.heater && !this.broken.has('heaterDead');
		const dry = heating && this.level < M.DRY;
		if (dry && !this.#dry) {
			this.dryHeating++;
			fault('Grzałka włączona przy niskim poziomie — praca na sucho!');
		}
		this.#dry = dry;
		const mass = Math.max(this.level, 10);
		this.temp += ((heating ? 1.5 * (60 / mass) : 0) - (this.temp - M.AMBIENT) / 400) * s;
		if (this.level < 1) this.temp += (M.AMBIENT - this.temp) * Math.min(1, s / 5);

		// the batch
		const b = this.#batch;
		const stirring = this.stirrer && !this.broken.has('stirrerTrip');
		if (stirring && this.level > 20) b.stirS += s;
		if (this.level > 20) b.maxTemp = Math.max(b.maxTemp, this.temp);
		if (dry) b.dry = true;
		if (this.level > b.peak) {
			b.peak = this.level;
			b.ratio = this.level > 0 ? this.a / this.level : 0;
		}
		// a batch ends when a full tank has been drained
		if (b.peak > 50 && this.level < 2 && this.outlet) {
			const problems = [
				Math.abs(b.ratio - 0.5) > 0.06
					? `proporcja A:B ${Math.round(b.ratio * 100)}:${100 - Math.round(b.ratio * 100)}`
					: '',
				b.maxTemp < M.TARGET_C - 1 ? `za zimno (${b.maxTemp.toFixed(1)} °C)` : '',
				b.stirS < M.MIX_S ? `mieszane tylko ${b.stirS.toFixed(1)} s` : '',
				b.dry ? 'grzałka pracowała na sucho' : ''
			].filter(Boolean);
			if (problems.length) {
				this.bad++;
				this.lastBatch = `Partia zła: ${problems.join(', ')}`;
			} else {
				this.good++;
				this.lastBatch = 'Partia dobra';
			}
			this.#batch = { maxTemp: this.temp, stirS: 0, dry: false, peak: 0, ratio: 0 };
		}

		io.input('I0.0', this.level < M.HH);
		io.setWord('IW4', Math.round((this.level / 100) * 27648));
		io.setWord('IW6', Math.round(this.temp * 10));
	}

	command(name: string, value?: unknown): void {
		const f = name === 'fault' ? faultCommand(value) : null;
		if (f) {
			if (f.on) this.broken.add(f.id);
			else this.broken.delete(f.id);
		}
		if (name === 'clear') {
			this.good = this.bad = this.overflows = this.dryHeating = 0;
			this.lastFault = this.lastBatch = null;
		}
		if (name === 'empty') {
			this.a = this.b = 0;
			this.temp = MixerProcess.AMBIENT;
			this.#batch = { maxTemp: this.temp, stirS: 0, dry: false, peak: 0, ratio: 0 };
		}
	}

	state(): MixerState {
		return {
			kind: 'mixer',
			level: this.level,
			ratioA: this.level > 0 ? this.a / this.level : 0,
			temp: this.temp,
			valveA: this.valveA,
			valveB: this.valveB,
			stirrer: this.stirrer && !this.broken.has('stirrerTrip'),
			heater: this.heater && !this.broken.has('heaterDead'),
			outlet: this.outlet,
			good: this.good,
			bad: this.bad,
			overflows: this.overflows,
			dryHeating: this.dryHeating,
			lastFault: this.lastFault,
			lastBatch: this.lastBatch
		};
	}
}
