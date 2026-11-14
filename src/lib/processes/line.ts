import type { LineState, ProcessIO, ProcessModel, Workpiece } from './types.js';

/*
 * A drilling station on a production line — the classic sequence-control exercise.
 *
 *   entry ──▶ stopper + drill ──▶ inspection + ejector ──▶ end
 *   0 m        1.2 m               2.0 m                   3.0 m
 *
 * Outputs: Q0.0 belt, Q0.1 stopper (extended = parts wait at the drill), Q0.2 lower the drill
 * (single-acting cylinder: off = it goes up), Q0.3 spindle, Q0.4 ejector.
 * Inputs: I0.0 part at the drill, I0.1 drill at the top, I0.2 drill at the bottom,
 * I0.3 part at the entry, I0.4 part at the inspection, I0.5 that part is OK (drilled, no crack).
 *
 * Mistakes are counted, not hidden: moving a part under a lowered drill crashes it, lowering a
 * drill onto a part without the spindle running breaks the tool.
 */
export class LineProcess implements ProcessModel {
	static readonly LENGTH = 3;
	static readonly SPEED = 0.25; // m/s
	static readonly GAP = 0.25; // parts queue up with this spacing
	static readonly STOP_AT = 1.2;
	static readonly DRILL_ZONE = [1.0, 1.4] as const;
	static readonly AT_DRILL = [1.17, 1.21] as const;
	static readonly ENTRY = [0, 0.25] as const;
	static readonly CHECK = [1.95, 2.1] as const;
	static readonly EJECT = [1.9, 2.25] as const;
	static readonly STROKE_MS = 1200;
	static readonly DRILL_MS = 1000;
	static readonly CYLINDER_MS = 200;

	readonly kind = 'line';
	readonly sensors = ['I0.0', 'I0.1', 'I0.2', 'I0.3', 'I0.4', 'I0.5'] as const;

	parts: Workpiece[] = [];
	belt = false;
	stopper = 0;
	drill = 0;
	spindle = false;
	ejector = 0;
	progress = 0;
	good = 0;
	rejected = 0;
	wrongRejected = 0;
	badDelivered = 0;
	crashes = 0;
	toolBreaks = 0;
	autoFeed = false;
	lastFault: string | null = null;

	#nextId = 1;
	#queue: boolean[] = [];
	#interval = 5000;
	#feedTimer = 0;
	#broke = false; // tool broke during the current stroke

	step(dtMs: number, io: ProcessIO): void {
		const L = LineProcess;
		this.belt = io.output('Q0.0');
		const stop = io.output('Q0.1');
		const lower = io.output('Q0.2');
		this.spindle = io.output('Q0.3');
		const eject = io.output('Q0.4');

		// feeding: one part at a time onto a free entry
		this.#feedTimer -= dtMs;
		if (this.#feedTimer <= 0) {
			if (this.#queue.length === 0 && this.autoFeed) this.#queue.push(this.#nextId % 5 === 0);
			if (this.#queue.length > 0 && this.#spawn(this.#queue[0])) {
				this.#queue.shift();
				this.#feedTimer = this.#interval;
			}
		}

		const ramp = (v: number, on: boolean, ms: number) =>
			Math.min(1, Math.max(0, v + ((on ? 1 : -1) * dtMs) / ms));
		this.stopper = ramp(this.stopper, stop, L.CYLINDER_MS);
		this.ejector = ramp(this.ejector, eject, L.CYLINDER_MS);
		const before = this.drill;
		this.drill = ramp(this.drill, lower, L.STROKE_MS);
		if (before === 0 && this.drill > 0) this.#broke = false;

		// the belt moves the parts, front to back, keeping a gap and respecting the stopper
		const moved = new Set<number>();
		if (this.belt) {
			const ordered = [...this.parts].sort((a, b) => b.x - a.x);
			let limit = Infinity;
			for (const p of ordered) {
				let target = p.x + (L.SPEED * dtMs) / 1000;
				if (this.stopper >= 0.5 && p.x <= L.STOP_AT) target = Math.min(target, L.STOP_AT);
				target = Math.min(target, limit);
				if (target > p.x + 1e-9) moved.add(p.id);
				p.x = Math.max(p.x, target);
				limit = p.x - L.GAP;
			}
		}

		const inZone = (p: Workpiece, [a, b]: readonly [number, number]) => p.x >= a && p.x < b;
		const fault = (text: string) => (this.lastFault = text);

		// the drill
		const under = this.parts.find((p) => inZone(p, L.DRILL_ZONE));
		if (under && this.drill > 0.4) {
			if (moved.has(under.id) && !under.damaged) {
				under.damaged = true;
				this.crashes++;
				fault('A part moved under the lowered drill');
			} else if (!this.spindle && !this.#broke && !under.drilled) {
				this.#broke = true;
				under.damaged = true;
				this.toolBreaks++;
				fault('The drill went into a part without the spindle running');
			}
		}
		const held = this.parts.find((p) => inZone(p, L.AT_DRILL) && !moved.has(p.id));
		if (held && this.drill >= 0.98 && this.spindle && !held.damaged) {
			this.progress = Math.min(1, this.progress + dtMs / L.DRILL_MS);
			if (this.progress >= 1) held.drilled = true;
		} else if (!held || this.drill < 0.5) {
			this.progress = held?.drilled ? 1 : 0;
		}

		// ejector and the end of the line
		this.parts = this.parts.filter((p) => {
			if (this.ejector >= 0.8 && inZone(p, L.EJECT)) {
				this.rejected++;
				if (this.#ok(p)) {
					this.wrongRejected++;
					fault('A good part was rejected');
				}
				return false;
			}
			if (p.x >= L.LENGTH) {
				if (this.#ok(p)) this.good++;
				else {
					this.badDelivered++;
					fault('A bad part reached the end of the line');
				}
				return false;
			}
			return true;
		});

		const s = this.state().sensors;
		io.input('I0.0', s.atDrill);
		io.input('I0.1', s.drillTop);
		io.input('I0.2', s.drillBottom);
		io.input('I0.3', s.atEntry);
		io.input('I0.4', s.atCheck);
		io.input('I0.5', s.qualityOk);
	}

	#ok = (p: Workpiece) => p.drilled && !p.cracked && !p.damaged;

	command(name: string, value?: unknown): void {
		if (name === 'spawn') this.#queue.push(Boolean((value as { cracked?: boolean })?.cracked));
		if (name === 'feed') {
			const v = value as { pattern: boolean[]; interval?: number };
			this.#queue.push(...v.pattern);
			this.#interval = v.interval ?? 5000;
		}
		if (name === 'autoFeed') this.autoFeed = Boolean(value);
		if (name === 'clear') {
			this.parts = [];
			this.#queue = [];
			this.good = this.rejected = this.wrongRejected = this.badDelivered = 0;
			this.crashes = this.toolBreaks = 0;
			this.lastFault = null;
		}
	}

	#spawn(cracked: boolean): boolean {
		if (this.parts.some((p) => p.x < LineProcess.GAP)) return false;
		this.parts.push({ id: this.#nextId++, x: 0, drilled: false, cracked, damaged: false });
		return true;
	}

	state(): LineState {
		const L = LineProcess;
		const inZone = (p: Workpiece, [a, b]: readonly [number, number]) => p.x >= a && p.x < b;
		const atCheck = this.parts.find((p) => inZone(p, L.CHECK));
		return {
			kind: 'line',
			belt: this.belt,
			stopper: this.stopper,
			drill: this.drill,
			spindle: this.spindle,
			ejector: this.ejector,
			parts: this.parts.map((p) => ({ ...p })),
			progress: this.progress,
			good: this.good,
			rejected: this.rejected,
			wrongRejected: this.wrongRejected,
			badDelivered: this.badDelivered,
			crashes: this.crashes,
			toolBreaks: this.toolBreaks,
			autoFeed: this.autoFeed,
			lastFault: this.lastFault,
			sensors: {
				atEntry: this.parts.some((p) => inZone(p, L.ENTRY)),
				atDrill: this.parts.some((p) => inZone(p, L.AT_DRILL)),
				drillTop: this.drill <= 0.02,
				drillBottom: this.drill >= 0.98,
				atCheck: atCheck !== undefined,
				qualityOk: atCheck !== undefined && this.#ok(atCheck)
			}
		};
	}
}
