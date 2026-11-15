import type { DriveParams, DriveState } from '#lib/drive/drive.js';
/*
 * Simulated plants. A process model runs in the PLC worker right after every scan:
 * it reads the PLC outputs (actuators), advances its physics by the scan time and
 * writes the PLC inputs (sensors) that the next scan will read.
 */

export type ProcessKind =
	| 'traffic'
	| 'tank'
	| 'conveyor'
	| 'line'
	| 'oven'
	| 'crane'
	| 'remote'
	| 'drive'
	| 'pneumatic'
	| 'mixer'
	| 'axis';

export interface ProcessIO {
	output(terminal: string): boolean;
	input(terminal: string, value: boolean): void;
	/** Output word written by the program, e.g. QW4 (analog output). */
	word(address: string): number;
	/** Sets an input word, e.g. IW4 (analog input, encoder). */
	setWord(address: string, value: number): void;
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

export interface Workpiece {
	id: number;
	/** position of the front edge along the belt, in metres */
	x: number;
	drilled: boolean;
	/** a crack the inspection station finds — must be rejected */
	cracked: boolean;
	/** hit by the drill or crushed — always scrap */
	damaged: boolean;
}

export interface LineState {
	kind: 'line';
	belt: boolean;
	stopper: number;
	/** drill stroke: 0 = top, 1 = bottom */
	drill: number;
	spindle: boolean;
	ejector: number;
	parts: Workpiece[];
	/** drilling progress of the part under the drill, 0 … 1 */
	progress: number;
	good: number;
	rejected: number;
	/** good parts pushed off by mistake */
	wrongRejected: number;
	/** bad (undrilled, cracked or damaged) parts that reached the end */
	badDelivered: number;
	crashes: number;
	toolBreaks: number;
	autoFeed: boolean;
	sensors: {
		atEntry: boolean;
		atDrill: boolean;
		drillTop: boolean;
		drillBottom: boolean;
		atCheck: boolean;
		qualityOk: boolean;
	};
	/** last thing that went wrong, for the view */
	lastFault: string | null;
}

export interface OvenState {
	kind: 'oven';
	/** °C */
	temp: number;
	maxTemp: number;
	doorClosed: boolean;
	overTemp: boolean;
	heater: boolean;
	/** requested power 0 … 1 */
	demand: number;
	/** power reaching the elements 0 … 1 */
	power: number;
}

export interface CraneState {
	kind: 'crane';
	/** trolley position, mm */
	x: number;
	/** mm/s */
	v: number;
	/** 0 = top, 1 = bottom */
	hook: number;
	left: boolean;
	right: boolean;
	fast: boolean;
	up: boolean;
	down: boolean;
	crashes: number;
	swings: number;
	shorts: number;
	lastFault: string | null;
}

export interface RemoteState {
	kind: 'remote';
	link: boolean;
	pumpRunning: boolean;
	pumpFault: boolean;
	/** the station's watchdog put its outputs in the safe state */
	stationTripped: boolean;
	/** heartbeat counter in the station */
	heartbeat: number;
	/** heartbeat as the PLC last received it */
	plcHeartbeat: number;
	telegrams: number;
	runCmd: boolean;
}

export interface DrivePlantState {
	kind: 'drive';
	drive: DriveState;
	stw: number;
	nsoll: number;
	zsw: number;
	nist: number;
	params: DriveParams;
}

export interface PneumaticState {
	kind: 'pneumatic';
	/** cylinder positions, 0 = retracted, 1 = extended */
	a: number;
	b: number;
	aCmd: boolean;
	bCmd: boolean;
	part: { pressed: boolean; damaged: boolean } | null;
	good: number;
	scrap: number;
	emptyStrokes: number;
	strokes: number;
	autoFeed: boolean;
	lastFault: string | null;
	sensors: {
		aIn: boolean;
		aOut: boolean;
		bIn: boolean;
		bOut: boolean;
		part: boolean;
		air: boolean;
	};
}

export interface MixerState {
	kind: 'mixer';
	/** % */
	level: number;
	/** share of component A in the tank, 0 … 1 */
	ratioA: number;
	/** °C */
	temp: number;
	valveA: boolean;
	valveB: boolean;
	stirrer: boolean;
	heater: boolean;
	outlet: boolean;
	good: number;
	bad: number;
	overflows: number;
	dryHeating: number;
	lastFault: string | null;
	lastBatch: string | null;
}

export interface AxisState {
	kind: 'axis';
	/** mm, in the axis coordinates (meaningful once homed) */
	position: number;
	/** mm on the rail */
	physical: number;
	/** mm/s */
	velocity: number;
	mode: string;
	homed: boolean;
	errorId: number;
	rejected: boolean;
	gripper: boolean;
	holding: boolean;
	partAtPick: boolean;
	delivered: number;
	dropped: number;
	lastEvent: string | null;
}

export type ProcessState =
	| AxisState
	| PneumaticState
	| MixerState
	| TrafficState
	| TankState
	| ConveyorState
	| LineState
	| OvenState
	| CraneState
	| RemoteState
	| DrivePlantState;

/** Faults of a plant that can be switched on in the Process view, lessons and on call. */
export interface PlantFault {
	id: string;
	label: string;
}

/** Parses the value of the `fault` command: `{ id, on }`. */
export const faultCommand = (value: unknown): { id: string; on: boolean } | null => {
	const v = value as { id?: unknown; on?: unknown } | null;
	return v && typeof v.id === 'string' ? { id: v.id, on: Boolean(v.on) } : null;
};

export interface ProcessModel {
	readonly kind: ProcessKind;
	/** Input terminals driven by this process (the I/O panel shows them as read-only). */
	readonly sensors: readonly string[];
	step(dtMs: number, io: ProcessIO): void;
	command(name: string, value?: unknown): void;
	state(): ProcessState;
}
