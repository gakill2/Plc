import { formatAddress, parseAddress, type MemAddress } from '#lib/engine/index.js';
import { newId } from '#lib/ladder/model.js';
import { SYMBOL_NAME_RE, type SymbolEntry } from '#lib/symbols/symbols.js';

/*
 * The physical side of the project: field devices wired to the PLC's I/O terminals.
 * Input devices drive input terminals; output terminals drive output devices.
 */

export type DeviceType = 'pushbutton' | 'switch' | 'limit' | 'sensor' | 'lamp' | 'motor' | 'buzzer';
export type LampColor = 'green' | 'red' | 'amber' | 'blue';

export interface DeviceSpec {
	type: DeviceType;
	name: string;
	io: 'input' | 'output';
	/** Momentary devices are active only while held. */
	momentary: boolean;
	defaultLabel: string;
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
}

export interface Wire {
	id: string;
	device: string;
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

/** Electrical signal an input device puts on its terminal. */
export function deviceSignal(d: Device, actuated: boolean): boolean {
	return d.nc ? !actuated : actuated;
}

export function wireOf(circuit: Circuit, deviceId: string): Wire | undefined {
	return circuit.wires.find((w) => w.device === deviceId);
}

/**
 * Input terminal values produced by the devices. Several devices on one terminal are wired in
 * parallel, so their signals are OR-ed — exactly like two buttons on one input in real life.
 */
export function inputDrive(
	circuit: Circuit,
	actuated: Readonly<Record<string, boolean>>
): Map<string, boolean> {
	const drive = new Map<string, boolean>();
	for (const w of circuit.wires) {
		const d = circuit.devices.find((x) => x.id === w.device);
		if (!d || DEVICES[d.type].io !== 'input') continue;
		const terminal = normalizeTerminal(w.terminal);
		if (!terminal) continue;
		drive.set(terminal, (drive.get(terminal) ?? false) || deviceSignal(d, actuated[d.id] ?? false));
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

/** Connects a device to a terminal, replacing its previous wire (one wire per device). */
export function connect(circuit: Circuit, deviceId: string, terminal: string): Wire {
	circuit.wires = circuit.wires.filter((w) => w.device !== deviceId);
	const wire = { id: newId('w'), device: deviceId, terminal };
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
		const t = normalizeTerminal(w.terminal);
		const area = spec.io === 'input' ? 'I' : 'Q';
		const bytes = spec.io === 'input' ? terminals.inputBytes : terminals.outputBytes;
		const a = t ? (parseAddress(t) as MemAddress) : null;
		if (!a || a.area !== area || a.byte >= bytes) {
			issues.push({
				id: d.id,
				message: `${d.label}: ${spec.name.toLowerCase()} must be wired to an ${spec.io} terminal (${area}…)`
			});
		}
	}
	for (const d of circuit.devices) {
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
	return circuit.wires.flatMap((w) => {
		const d = circuit.devices.find((x) => x.id === w.device);
		if (!d || !SYMBOL_NAME_RE.test(d.label)) return [];
		return [
			{
				id: d.id,
				name: d.label,
				address: w.terminal,
				comment: DEVICES[d.type].name + (d.nc ? ' (NC)' : '')
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
