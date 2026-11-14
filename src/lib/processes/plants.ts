import type { ProcessKind } from './types.js';

/** What a simulated plant is and how it is wired to the PLC — for choosing one in any project. */
export interface PlantInfo {
	kind: ProcessKind;
	name: string;
	description: string;
	io: { address: string; name: string; comment: string }[];
}

export const PLANTS: readonly PlantInfo[] = [
	{
		kind: 'traffic',
		name: 'Traffic light',
		description: 'Three lamps. Program the red → green → yellow sequence with timers.',
		io: [
			{ address: 'Q0.0', name: 'Red', comment: 'Red lamp' },
			{ address: 'Q0.1', name: 'Yellow', comment: 'Yellow lamp' },
			{ address: 'Q0.2', name: 'Green', comment: 'Green lamp' }
		]
	},
	{
		kind: 'tank',
		name: 'Water tank',
		description: 'A pump fills the tank, a valve drains it. Keep the level between the sensors.',
		io: [
			{ address: 'I0.0', name: 'Low', comment: 'Level ≥ 20 %' },
			{ address: 'I0.1', name: 'High', comment: 'Level ≥ 80 %' },
			{ address: 'Q0.0', name: 'Pump', comment: 'Fills the tank' }
		]
	},
	{
		kind: 'conveyor',
		name: 'Sorting conveyor',
		description: 'A belt carries short and tall boxes. Push the tall ones off, count the rest.',
		io: [
			{ address: 'I0.0', name: 'EntrySensor', comment: 'Box at the start of the belt' },
			{ address: 'I0.1', name: 'EndSensor', comment: 'Box at the end of the belt' },
			{ address: 'I0.2', name: 'TallBox', comment: 'Tall box in front of the pusher' },
			{ address: 'Q0.0', name: 'Belt', comment: 'Belt motor' },
			{ address: 'Q0.1', name: 'Pusher', comment: 'Pushes boxes off the belt' }
		]
	},
	{
		kind: 'line',
		name: 'Production line (drilling)',
		description:
			'Parts wait at a stopper, get drilled, pass an inspection and bad ones are ejected. A sequence to program step by step.',
		io: [
			{
				address: 'I0.0',
				name: 'PartAtDrill',
				comment: 'Part held at the stopper, under the drill'
			},
			{ address: 'I0.1', name: 'DrillTop', comment: 'Drill at the top end position' },
			{ address: 'I0.2', name: 'DrillBottom', comment: 'Drill at the bottom end position' },
			{ address: 'I0.3', name: 'PartAtEntry', comment: 'Part at the start of the belt' },
			{ address: 'I0.4', name: 'PartAtCheck', comment: 'Part at the inspection station' },
			{
				address: 'I0.5',
				name: 'QualityOK',
				comment: 'Part at the inspection is drilled and has no crack'
			},
			{ address: 'Q0.0', name: 'Belt', comment: 'Conveyor motor' },
			{ address: 'Q0.1', name: 'Stopper', comment: 'Extended = parts wait at the drill' },
			{ address: 'Q0.2', name: 'DrillLower', comment: 'Lowers the drill (off = it goes up)' },
			{ address: 'Q0.3', name: 'Spindle', comment: 'Drill motor' },
			{
				address: 'Q0.4',
				name: 'Ejector',
				comment: 'Pushes the part at the inspection off the line'
			}
		]
	},
	{
		kind: 'oven',
		name: 'Electric oven (PID)',
		description:
			'A heater with a power controller and a thermocouple. First-order process with dead time — tune a PI(D) loop in Structured Text.',
		io: [
			{ address: 'I0.0', name: 'DoorClosed', comment: 'Door switch (1 = closed)' },
			{ address: 'I0.1', name: 'OverTemp', comment: 'Safety thermostat, > 280 °C' },
			{ address: 'IW4', name: 'Temperature', comment: 'Thermocouple, °C × 10 (200.0 °C = 2000)' },
			{ address: 'Q0.0', name: 'Heater', comment: 'Heater contactor' },
			{ address: 'QW4', name: 'HeaterPower', comment: 'Power 0 … 27648 = 0 … 100 %' }
		]
	},
	{
		kind: 'crane',
		name: 'Overhead crane',
		description:
			'A trolley on a 10 m runway with an encoder and a hoist. Position it: slow down before the target, respect the limit switches and interlocks.',
		io: [
			{ address: 'I0.0', name: 'LimitLeft', comment: 'Left end limit, NC (1 = not reached)' },
			{ address: 'I0.1', name: 'LimitRight', comment: 'Right end limit, NC (1 = not reached)' },
			{ address: 'I0.2', name: 'HookTop', comment: 'Hook at the top' },
			{ address: 'I0.3', name: 'HookBottom', comment: 'Hook at the bottom' },
			{ address: 'IW4', name: 'Position', comment: 'Encoder, mm from the left end (0 … 10000)' },
			{ address: 'Q0.0', name: 'Left', comment: 'Travel left' },
			{ address: 'Q0.1', name: 'Right', comment: 'Travel right' },
			{ address: 'Q0.2', name: 'Fast', comment: 'Fast travel 1 m/s (off = 0.2 m/s)' },
			{ address: 'Q0.3', name: 'HookUp', comment: 'Hoist up' },
			{ address: 'Q0.4', name: 'HookDown', comment: 'Hoist down' }
		]
	},
	{
		kind: 'remote',
		name: 'Remote I/O station (fieldbus)',
		description:
			'A pump in a remote station on Profinet / Modbus TCP. Its status and a heartbeat counter arrive over the bus — break the cable and the data goes stale.',
		io: [
			{ address: 'I2.0', name: 'PumpRunning', comment: 'Station: pump running' },
			{ address: 'I2.1', name: 'PumpFault', comment: 'Station: pump fault' },
			{ address: 'I2.2', name: 'StationOk', comment: 'Station: outputs enabled (watchdog OK)' },
			{ address: 'IW6', name: 'Heartbeat', comment: 'Station counter, +1 every 100 ms' },
			{ address: 'Q2.0', name: 'RunCmd', comment: 'Command to the station: run the pump' },
			{ address: 'Q2.1', name: 'ResetCmd', comment: 'Command to the station: reset the fault' }
		]
	}
];

export const plantInfo = (kind: ProcessKind | undefined | null) =>
	PLANTS.find((p) => p.kind === kind) ?? null;
