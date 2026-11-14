/*
 * Simulated plants. A process model runs in the PLC worker right after every scan:
 * it reads the PLC outputs (actuators), advances its physics by the scan time and
 * writes the PLC inputs (sensors) that the next scan will read.
 */

export type ProcessKind = 'traffic' | 'tank' | 'conveyor';

export interface ProcessIO {
	output(terminal: string): boolean;
	input(terminal: string, value: boolean): void;
}

export interface TrafficState {
	kind: 'traffic';
	red: boolean;
	yellow: boolean;
	green: boolean;
}

export interface TankState {
	kind: 'tank';
	/** 0 … 100 % */
	level: number;
	pump: boolean;
	drain: boolean;
	low: boolean;
	high: boolean;
	overflowed: boolean;
	pumpStarts: number;
	minLevel: number;
	maxLevel: number;
}

export interface Box {
	id: number;
	/** position along the belt in metres */
	x: number;
	tall: boolean;
}

export interface ConveyorState {
	kind: 'conveyor';
	belt: boolean;
	/** 0 = retracted, 1 = fully extended */
	pusher: number;
	boxes: Box[];
	delivered: number;
	rejected: number;
	/** short boxes that were pushed off — a sorting mistake */
	wrongRejected: number;
	/** tall boxes that reached the end — a sorting mistake */
	missedTall: number;
	autoFeed: boolean;
	sensors: { entry: boolean; tall: boolean; end: boolean };
}

export type ProcessState = TrafficState | TankState | ConveyorState;

export interface ProcessModel {
	readonly kind: ProcessKind;
	/** Input terminals driven by this process (the I/O panel shows them as read-only). */
	readonly sensors: readonly string[];
	step(dtMs: number, io: ProcessIO): void;
	command(name: string, value?: unknown): void;
	state(): ProcessState;
}
