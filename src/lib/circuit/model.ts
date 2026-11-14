import { formatAddress, parseAddress, type MemAddress } from '#lib/engine/index.js';
import { newId } from '#lib/ladder/model.js';
import { SYMBOL_NAME_RE, type SymbolEntry } from '#lib/symbols/symbols.js';

/*
 * The physical side of the project: field devices wired to the PLC's I/O terminals.
 * Input devices drive input terminals; output terminals drive output devices.
 */

export type DeviceType =
	| 'pushbutton'
	| 'switch'
	| 'selector'
	| 'estop'
	| 'limit'
	| 'sensor'
	| 'lamp'
	| 'motor'
	| 'contactor'
	| 'vfd'
	| 'buzzer';

/**
 * A connection point of a device. Most devices have one (`main`); a 3-position selector has two
 * contacts and a contactor has a coil (output) plus an auxiliary feedback contact (input).
 */
export interface PortSpec {
	id: string;
	io: 'input' | 'output';
	/** Appended to the device name for the automatic symbol, e.g. Mode_Hand. */
	suffix: string;
	/** Short label shown at the port. */
	label: string;
}
export type LampColor = 'green' | 'red' | 'amber' | 'blue';

export interface DeviceSpec {
	type: DeviceType;
	name: string;
	io: 'input' | 'output';
	/** Momentary devices are active only while held. */
	momentary: boolean;
	defaultLabel: string;
	/** Extra ports besides the main one. */
	extraPorts?: PortSpec[];
	/** Input devices: offer the "wired NC" option. */
	ncOption?: boolean;
	/** Created wired through the NC contact (e-stops are, for fail-safety). */
	defaultNc?: boolean;
}

export const DEVICES: Record<DeviceType, DeviceSpec> = {
	pushbutton: {
		type: 'pushbutton',
		name: 'Push button',
		io: 'input',
		momentary: true,
		defaultLabel: 'Button'
	},
	switch: {
		type: 'switch',
		name: 'Selector switch',
		io: 'input',
		momentary: false,
		defaultLabel: 'Switch'
	},
	selector: {
		type: 'selector',
		name: '3-position selector',
		io: 'input',
		momentary: false,
		defaultLabel: 'Mode',
		extraPorts: [{ id: 'auto', io: 'input', suffix: '_Auto', label: 'AUTO' }]
	},
	estop: {
		type: 'estop',
		name: 'Emergency stop',
		io: 'input',
		momentary: false,
		defaultLabel: 'EStop',
		defaultNc: true
	},
	limit: {
		type: 'limit',
		name: 'Limit switch',
		io: 'input',
		momentary: false,
		defaultLabel: 'Limit'
	},
	sensor: {
		type: 'sensor',
		name: 'Proximity sensor',
		io: 'input',
		momentary: false,
		defaultLabel: 'Sensor'
	},
	lamp: {
		type: 'lamp',
		name: 'Indicator lamp',
		io: 'output',
		momentary: false,
		defaultLabel: 'Lamp'
	},
	motor: {
		type: 'motor',
		name: 'Motor (contactor)',
		io: 'output',
		momentary: false,
		defaultLabel: 'Motor'
	},
	contactor: {
		type: 'contactor',
		name: 'Contactor + feedback',
		io: 'output',
		momentary: false,
		defaultLabel: 'K',
		extraPorts: [{ id: 'aux', io: 'input', suffix: '_FB', label: 'FB' }]
	},
	vfd: {
		type: 'vfd',
		name: 'Frequency inverter (VFD)',
		io: 'output',
		momentary: false,
		defaultLabel: 'U',
		extraPorts: [
			{ id: 'rev', io: 'output', suffix: '_Rev', label: 'REV' },
			{ id: 'reset', io: 'output', suffix: '_Reset', label: 'RESET' },
			{ id: 'ready', io: 'input', suffix: '_Ready', label: 'READY' },
			{ id: 'fault', io: 'input', suffix: '_Fault', label: 'FAULT' },
			{ id: 'atSpeed', io: 'input', suffix: '_AtSpeed', label: 'AT SPEED' }
		]
	},
	buzzer: { type: 'buzzer', name: 'Buzzer', io: 'output', momentary: false, defaultLabel: 'Horn' }
};

export interface Device {
	id: string;
	type: DeviceType;
	label: string;
	x: number;
	y: number;
	/** Input devices: wired through the normally-closed contact (signal is on when NOT actuated). */
	nc?: boolean;
	color?: LampColor;
	/** VFD: output word with the speed setpoint (AI1 of the drive), e.g. QW4 */
	aiWord?: string;
	/** VFD: input word with the actual speed (AO1 of the drive), e.g. IW4 */
	aoWord?: string;
}

export interface Wire {
	id: string;
	device: string;
	/** Port of the device; missing = the main port. */
	port?: string;
	/** PLC terminal, e.g. I0.0 or Q0.1 */
	terminal: string;
}

export interface Circuit {
	plc: { x: number; y: number };
	devices: Device[];
	wires: Wire[];
}

export interface CircuitIssue {
	id: string;
	message: string;
}

export const device = (
	type: DeviceType,
	label: string,
	x: number,
	y: number,
	extra: Partial<Device> = {}
): Device => ({
	id: newId('d'),
	type,
	label,
	x,
	y,
	...extra
});

export const emptyCircuit = (): Circuit => ({ plc: { x: 320, y: 0 }, devices: [], wires: [] });

/** The main port: a 3-position selector's main contact is its HAND position. */
export function mainPort(type: DeviceType): PortSpec {
	const spec = DEVICES[type];
	if (type === 'selector') return { id: MAIN, io: 'input', suffix: '_Hand', label: 'HAND' };
	if (type === 'vfd') return { id: MAIN, io: 'output', suffix: '_Run', label: 'RUN' };
	return { id: MAIN, io: spec.io, suffix: '', label: spec.io === 'input' ? 'OUT' : 'IN' };
}

export const MAIN = 'main';

export function portsOf(type: DeviceType): PortSpec[] {
	return [mainPort(type), ...(DEVICES[type].extraPorts ?? [])];
}

export function portOf(type: DeviceType, id: string | undefined): PortSpec | undefined {
	return portsOf(type).find((p) => p.id === (id ?? MAIN));
}

/** Physical state of the devices that is not a plain on/off "actuated" flag. */
/* ---------- faults (on-call mode): things that break in a working machine ---------- */

export type FaultKind =
	/** the wire of a port is broken: an input reads 0, an output never reaches the device */
	| 'wire-break'
	/** a sensor or limit switch is stuck: it always reports 1 */
	| 'stuck-on'
	/** the contactor's overload relay has tripped: the motor stops, feedback drops */
	| 'overload'
	/** the contactor's auxiliary contact is burnt: feedback never closes */
	| 'aux-contact'
	/** the inverter trips (overcurrent) every time it speeds up */
	| 'vfd-trip'
	/** the lamp's bulb is burnt */
	| 'lamp-burnt';

/** A fault on a device, by its label (stable across project copies). */
export interface Fault {
	kind: FaultKind;
	device: string;
	/** port for wire faults; main when absent */
	port?: string;
}

export const hasFault = (
	faults: readonly Fault[] | undefined,
	label: string,
	kind: FaultKind,
	port?: string
) =>
	!!faults?.some(
		(f) =>
			f.kind === kind &&
			f.device.toUpperCase() === label.toUpperCase() &&
			(port === undefined || (f.port ?? MAIN) === port)
	);

/** Does an output terminal's signal actually reach the device (wire intact, bulb alive)? */
export const outputReaches = (d: Device, port: string, faults: readonly Fault[] | undefined) =>
	!hasFault(faults, d.label, 'wire-break', port) &&
	!(port === MAIN && hasFault(faults, d.label, 'lamp-burnt'));

export interface DeviceState {
	/** Active faults (on-call mode). */
	faults?: readonly Fault[];
	/** 3-position selectors: -1 = HAND, 0 = OFF, 1 = AUTO */
	positions?: Readonly<Record<string, number>>;
	/** PLC output terminals — drive coils whose feedback contacts are read back. */
	output?: (terminal: string) => boolean;
	/** Relay outputs of frequency inverters (by device id). */
	vfd?: (deviceId: string) => { ready: boolean; fault: boolean; atSpeed: boolean } | undefined;
}

/** Electrical signal an input device puts on its terminal. */
export function deviceSignal(d: Device, actuated: boolean): boolean {
	return d.nc ? !actuated : actuated;
}

/** Signal on one input port of a device. */
export function portSignal(
	circuit: Circuit,
	d: Device,
	port: string | undefined,
	actuated: Readonly<Record<string, boolean>>,
	state: DeviceState = {}
): boolean {
	const on = actuated[d.id] ?? false;
	const faults = state.faults;
	if (hasFault(faults, d.label, 'wire-break', port ?? MAIN)) return false;
	if (hasFault(faults, d.label, 'stuck-on', port ?? MAIN)) return true;
	switch (d.type) {
		case 'selector': {
			const pos = state.positions?.[d.id] ?? 0;
			return (port ?? MAIN) === MAIN ? pos === -1 : pos === 1;
		}
		case 'vfd': {
			const o = state.vfd?.(d.id);
			if (port === 'ready') return o?.ready ?? true;
			if (port === 'fault') return o?.fault ?? false;
			return o?.atSpeed ?? false;
		}
		case 'contactor': {
			// auxiliary NO contact: closed when the coil is energised and the overload has not tripped
			if (hasFault(faults, d.label, 'aux-contact')) return false;
			const tripped = on || hasFault(faults, d.label, 'overload');
			const coil = wireOf(circuit, d.id);
			const t = coil ? normalizeTerminal(coil.terminal) : null;
			return (
				!tripped && t !== null && (state.output?.(t) ?? false) && outputReaches(d, MAIN, faults)
			);
		}
		default:
			return deviceSignal(d, on);
	}
}

export function wireOf(circuit: Circuit, deviceId: string, port: string = MAIN): Wire | undefined {
	return circuit.wires.find((w) => w.device === deviceId && (w.port ?? MAIN) === port);
}

/**
 * Input terminal values produced by the devices. Several devices on one terminal are wired in
 * parallel, so their signals are OR-ed — exactly like two buttons on one input in real life.
 */
export function inputDrive(
	circuit: Circuit,
	actuated: Readonly<Record<string, boolean>>,
	state: DeviceState = {}
): Map<string, boolean> {
	const drive = new Map<string, boolean>();
	for (const w of circuit.wires) {
		const d = circuit.devices.find((x) => x.id === w.device);
		if (!d || portOf(d.type, w.port)?.io !== 'input') continue;
		const terminal = normalizeTerminal(w.terminal);
		if (!terminal) continue;
		const signal = portSignal(circuit, d, w.port, actuated, state);
		drive.set(terminal, (drive.get(terminal) ?? false) || signal);
	}
	return drive;
}

export function normalizeTerminal(text: string): string | null {
	try {
		const a = parseAddress(text);
		return a.area !== 'T' && a.area !== 'C' && a.size === 'X' ? formatAddress(a) : null;
	} catch {
		return null;
	}
}

/** Connects a device port to a terminal, replacing its previous wire (one wire per port). */
export function connect(
	circuit: Circuit,
	deviceId: string,
	terminal: string,
	port: string = MAIN
): Wire {
	circuit.wires = circuit.wires.filter(
		(w) => !(w.device === deviceId && (w.port ?? MAIN) === port)
	);
	const wire: Wire = { id: newId('w'), device: deviceId, terminal };
	if (port !== MAIN) wire.port = port;
	circuit.wires.push(wire);
	return wire;
}

export function removeWire(circuit: Circuit, wireId: string): void {
	circuit.wires = circuit.wires.filter((w) => w.id !== wireId);
}

export function removeDevice(circuit: Circuit, deviceId: string): void {
	circuit.devices = circuit.devices.filter((d) => d.id !== deviceId);
	circuit.wires = circuit.wires.filter((w) => w.device !== deviceId);
}

/** A label that is not used yet, e.g. Button3. */
export function nextLabel(circuit: Circuit, type: DeviceType): string {
	const base = DEVICES[type].defaultLabel;
	const used = new Set(circuit.devices.map((d) => d.label.toUpperCase()));
	for (let n = 1; ; n++) if (!used.has(`${base}${n}`.toUpperCase())) return `${base}${n}`;
}

export function checkCircuit(
	circuit: Circuit,
	terminals: { inputBytes: number; outputBytes: number }
): CircuitIssue[] {
	const issues: CircuitIssue[] = [];
	for (const w of circuit.wires) {
		const d = circuit.devices.find((x) => x.id === w.device);
		if (!d) continue;
		const spec = DEVICES[d.type];
		const port = portOf(d.type, w.port);
		if (!port) continue;
		const t = normalizeTerminal(w.terminal);
		const area = port.io === 'input' ? 'I' : 'Q';
		const bytes = port.io === 'input' ? terminals.inputBytes : terminals.outputBytes;
		const a = t ? (parseAddress(t) as MemAddress) : null;
		if (!a || a.area !== area || a.byte >= bytes) {
			const what = port.id === MAIN ? spec.name.toLowerCase() : `${port.label} contact`;
			issues.push({
				id: d.id,
				message: `${d.label}: ${what} must be wired to an ${port.io} terminal (${area}…)`
			});
		}
	}
	for (const d of circuit.devices) {
		if (d.type === 'vfd') {
			for (const [text, area, what] of [
				[d.aiWord, 'Q', 'setpoint (AI1)'],
				[d.aoWord, 'I', 'actual speed (AO1)']
			] as const) {
				if (!text?.trim()) continue;
				let ok: boolean;
				try {
					const a = parseAddress(text) as MemAddress;
					const bytes = area === 'I' ? terminals.inputBytes : terminals.outputBytes;
					ok = a.area === area && a.size === 'W' && a.byte + 1 < bytes;
				} catch {
					ok = false;
				}
				if (!ok)
					issues.push({
						id: d.id,
						message: `${d.label}: ${what} must be a word ${area}W… (e.g. ${area}W4)`
					});
			}
		}
		if (!SYMBOL_NAME_RE.test(d.label)) {
			issues.push({
				id: d.id,
				message: `"${d.label}": device names may contain letters, digits and _ only`
			});
		}
	}
	return issues;
}

/** Wired devices become symbols automatically: `Start → I0.0`. */
export function deviceSymbols(circuit: Circuit): SymbolEntry[] {
	return [...wireSymbols(circuit), ...wordSymbols(circuit)];
}

/** Analog words of frequency inverters: `U1_Setpoint → QW4`, `U1_Speed → IW4`. */
function wordSymbols(circuit: Circuit): SymbolEntry[] {
	return circuit.devices.flatMap((d) => {
		if (d.type !== 'vfd' || !SYMBOL_NAME_RE.test(d.label)) return [];
		const out: SymbolEntry[] = [];
		if (d.aiWord?.trim())
			out.push({
				id: `${d.id}:ai`,
				name: `${d.label}_Setpoint`,
				address: d.aiWord,
				comment: 'VFD speed setpoint AI1 (0 … 27648 = 0 … 50 Hz)'
			});
		if (d.aoWord?.trim())
			out.push({
				id: `${d.id}:ao`,
				name: `${d.label}_Speed`,
				address: d.aoWord,
				comment: 'VFD actual speed AO1 (0 … 27648 = 0 … 50 Hz)'
			});
		return out;
	});
}

function wireSymbols(circuit: Circuit): SymbolEntry[] {
	return circuit.wires.flatMap((w) => {
		const d = circuit.devices.find((x) => x.id === w.device);
		const port = d && portOf(d.type, w.port);
		if (!d || !port || !SYMBOL_NAME_RE.test(d.label)) return [];
		const extra = port.id === MAIN && d.type !== 'selector' ? '' : ` — ${port.label}`;
		return [
			{
				id: port.id === MAIN ? d.id : `${d.id}:${port.id}`,
				name: d.label + port.suffix,
				address: w.terminal,
				comment: DEVICES[d.type].name + extra + (d.nc ? ' (NC)' : '')
			}
		];
	});
}

/** The circuit that goes with the demo program. */
export function demoCircuit(): Circuit {
	const start = device('pushbutton', 'Start', 0, 30, { color: 'green' });
	const stop = device('pushbutton', 'Stop', 0, 190, { color: 'red' });
	const reset = device('pushbutton', 'ResetCount', 0, 350);
	const motor = device('motor', 'Motor', 720, 20);
	const running = device('lamp', 'Running', 720, 200, { color: 'green' });
	const service = device('lamp', 'Service', 720, 360, { color: 'amber' });
	const w = (d: Device, terminal: string): Wire => ({ id: newId('w'), device: d.id, terminal });
	return {
		plc: { x: 300, y: 0 },
		devices: [start, stop, reset, motor, running, service],
		wires: [
			w(start, 'I0.0'),
			w(stop, 'I0.1'),
			w(reset, 'I0.2'),
			w(motor, 'Q0.0'),
			w(running, 'Q0.1'),
			w(service, 'Q0.2')
		]
	};
}
