import type {
	Box,
	ConveyorState,
	ProcessIO,
	ProcessKind,
	ProcessModel,
	TankState,
	TrafficState
} from './types.js';
import { LineProcess } from './line.js';

/** Traffic light: no physics, the lamps simply show Q0.0 red, Q0.1 yellow, Q0.2 green. */
export class TrafficProcess implements ProcessModel {
	readonly kind = 'traffic';
	readonly sensors = [] as const;
	#lamps = { red: false, yellow: false, green: false };

	step(_dtMs: number, io: ProcessIO): void {
		this.#lamps = { red: io.output('Q0.0'), yellow: io.output('Q0.1'), green: io.output('Q0.2') };
	}

	command(): void {}

	state(): TrafficState {
		return { kind: 'traffic', ...this.#lamps };
	}
}

/**
 * Water tank. Pump Q0.0 fills at 8 %/s, the consumer drains 4 %/s.
 * Sensors: I0.0 LOW (level ≥ 20 %), I0.1 HIGH (level ≥ 80 %).
 */
export class TankProcess implements ProcessModel {
	static readonly FILL = 8;
	static readonly DRAIN = 4;
	static readonly LOW = 20;
	static readonly HIGH = 80;

	readonly kind = 'tank';
	readonly sensors = ['I0.0', 'I0.1'] as const;
	level = 50;
	drain = true;
	pump = false;
	overflowed = false;
	pumpStarts = 0;
	minLevel = 50;
	maxLevel = 50;

	step(dtMs: number, io: ProcessIO): void {
		const pump = io.output('Q0.0');
		if (pump && !this.pump) this.pumpStarts++;
		this.pump = pump;

		const s = dtMs / 1000;
		this.level += (pump ? TankProcess.FILL : 0) * s - (this.drain ? TankProcess.DRAIN : 0) * s;
		if (this.level >= 100) this.overflowed = true;
		this.level = Math.min(100, Math.max(0, this.level));
		this.minLevel = Math.min(this.minLevel, this.level);
		this.maxLevel = Math.max(this.maxLevel, this.level);

		io.input('I0.0', this.level >= TankProcess.LOW);
		io.input('I0.1', this.level >= TankProcess.HIGH);
	}

	command(name: string, value?: unknown): void {
		if (name === 'drain') this.drain = Boolean(value);
		if (name === 'level' && typeof value === 'number') {
			this.level = Math.min(100, Math.max(0, value));
			this.minLevel = this.maxLevel = this.level;
			this.overflowed = false;
		}
	}

	state(): TankState {
		return {
			kind: 'tank',
			level: this.level,
			pump: this.pump,
			drain: this.drain,
			low: this.level >= TankProcess.LOW,
			high: this.level >= TankProcess.HIGH,
			overflowed: this.overflowed,
			pumpStarts: this.pumpStarts,
			minLevel: this.minLevel,
			maxLevel: this.maxLevel
		};
	}
}

/**
 * Sorting conveyor, 2 m long, belt Q0.0 moves boxes at 0.2 m/s. A pusher Q0.1 at 1.1–1.4 m
 * shoves boxes off the belt. Sensors: I0.0 entry, I0.1 end, I0.2 "tall box at the pusher".
 */
export class ConveyorProcess implements ProcessModel {
	static readonly LENGTH = 2;
	static readonly SPEED = 0.2;
	static readonly PUSH_ZONE = [1.1, 1.4] as const;
	static readonly ENTRY_ZONE = [0.1, 0.3] as const;
	static readonly END_ZONE = [1.8, 2] as const;
	static readonly PUSHER_MS = 250;

	readonly kind = 'conveyor';
	readonly sensors = ['I0.0', 'I0.1', 'I0.2'] as const;
	boxes: Box[] = [];
	belt = false;
	pusher = 0;
	delivered = 0;
	rejected = 0;
	wrongRejected = 0;
	missedTall = 0;
	autoFeed = false;

	#nextId = 1;
	#queue: boolean[] = [];
	#interval = 4000;
	#feedTimer = 0;

	step(dtMs: number, io: ProcessIO): void {
		const C = ConveyorProcess;
		this.belt = io.output('Q0.0');
		const push = io.output('Q0.1');

		// feeding
		this.#feedTimer -= dtMs;
		if (this.#feedTimer <= 0) {
			if (this.#queue.length === 0 && this.autoFeed) this.#queue.push(Math.random() < 0.4);
			if (this.#queue.length > 0 && this.#spawn(this.#queue[0])) {
				this.#queue.shift();
				this.#feedTimer = this.#interval;
			}
		}

		this.pusher = Math.min(1, Math.max(0, this.pusher + ((push ? 1 : -1) * dtMs) / C.PUSHER_MS));
		if (this.belt) for (const b of this.boxes) b.x += (C.SPEED * dtMs) / 1000;

		const inZone = (b: Box, [from, to]: readonly [number, number]) => b.x >= from && b.x < to;
		this.boxes = this.boxes.filter((b) => {
			if (this.pusher >= 0.8 && inZone(b, C.PUSH_ZONE)) {
				this.rejected++;
				if (!b.tall) this.wrongRejected++;
				return false;
			}
			if (b.x >= C.LENGTH) {
				this.delivered++;
				if (b.tall) this.missedTall++;
				return false;
			}
			return true;
		});

		io.input(
			'I0.0',
			this.boxes.some((b) => inZone(b, C.ENTRY_ZONE))
		);
		io.input(
			'I0.1',
			this.boxes.some((b) => inZone(b, C.END_ZONE))
		);
		io.input(
			'I0.2',
			this.boxes.some((b) => b.tall && inZone(b, C.PUSH_ZONE))
		);
	}

	command(name: string, value?: unknown): void {
		if (name === 'spawn') this.#queue.push(Boolean((value as { tall?: boolean })?.tall));
		if (name === 'feed') {
			const v = value as { pattern: boolean[]; interval?: number };
			this.#queue.push(...v.pattern);
			this.#interval = v.interval ?? 4000;
		}
		if (name === 'autoFeed') this.autoFeed = Boolean(value);
		if (name === 'clear') {
			this.boxes = [];
			this.#queue = [];
			this.delivered = this.rejected = this.wrongRejected = this.missedTall = 0;
		}
	}

	/** Places a box at the start of the belt if there is room. */
	#spawn(tall: boolean): boolean {
		if (this.boxes.some((b) => b.x < 0.25)) return false;
		this.boxes.push({ id: this.#nextId++, x: 0, tall });
		return true;
	}

	state(): ConveyorState {
		const C = ConveyorProcess;
		const inZone = (b: Box, [from, to]: readonly [number, number]) => b.x >= from && b.x < to;
		return {
			kind: 'conveyor',
			belt: this.belt,
			pusher: this.pusher,
			boxes: this.boxes.map((b) => ({ ...b })),
			delivered: this.delivered,
			rejected: this.rejected,
			wrongRejected: this.wrongRejected,
			missedTall: this.missedTall,
			autoFeed: this.autoFeed,
			sensors: {
				entry: this.boxes.some((b) => inZone(b, C.ENTRY_ZONE)),
				tall: this.boxes.some((b) => b.tall && inZone(b, C.PUSH_ZONE)),
				end: this.boxes.some((b) => inZone(b, C.END_ZONE))
			}
		};
	}
}

export function createProcess(kind: ProcessKind): ProcessModel {
	switch (kind) {
		case 'line':
			return new LineProcess();
		case 'traffic':
			return new TrafficProcess();
		case 'tank':
			return new TankProcess();
		case 'conveyor':
			return new ConveyorProcess();
	}
}

export const isProcessKind = (v: unknown): v is ProcessKind =>
	v === 'traffic' || v === 'tank' || v === 'conveyor' || v === 'line';
