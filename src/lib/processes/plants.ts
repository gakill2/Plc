import type { PlantFault, ProcessKind } from './types.js';

/** What a simulated plant is and how it is wired to the PLC — for choosing one in any project. */
export interface PlantInfo {
	kind: ProcessKind;
	name: string;
	description: string;
	io: { address: string; name: string; comment: string; noise?: number }[];
	/** faults of the plant itself (signal faults work on every input) */
	faults?: PlantFault[];
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
		],
		faults: [
			{ id: 'pumpWorn', label: 'Zużyta pompa (⅓ wydajności)' },
			{ id: 'drainBlocked', label: 'Zatkany odpływ' }
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
		],
		faults: [
			{ id: 'jam', label: 'Zakleszczona taśma (silnik kręci, nic nie jedzie)' },
			{ id: 'noAir', label: 'Brak powietrza w spychaczu' }
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
			{
				address: 'IW4',
				name: 'Temperature',
				comment: 'Thermocouple, °C × 10 (200.0 °C = 2000)',
				noise: 4
			},
			{ address: 'Q0.0', name: 'Heater', comment: 'Heater contactor' },
			{ address: 'QW4', name: 'HeaterPower', comment: 'Power 0 … 27648 = 0 … 100 %' }
		],
		faults: [{ id: 'heaterHalf', label: 'Spalona połowa grzałek' }]
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
		],
		faults: [{ id: 'brakeWorn', label: 'Zużyty hamulec (4× dłuższa droga hamowania)' }]
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
	},
	{
		kind: 'drive',
		name: 'Frequency inverter on Profinet (PROFIdrive)',
		description:
			'A drive with standard telegram 1: control word and speed setpoint out, status word and actual speed back. PROFIdrive state machine, ramps, DC link and motor overload.',
		io: [
			{ address: 'IW4', name: 'ZSW1', comment: 'Status word from the drive' },
			{ address: 'IW6', name: 'NIST_A', comment: 'Actual speed, 16#4000 = 100 % = 50 Hz' },
			{ address: 'QW4', name: 'STW1', comment: 'Control word to the drive' },
			{ address: 'QW6', name: 'NSOLL_A', comment: 'Speed setpoint, 16#4000 = 100 % = 50 Hz' }
		]
	},
	{
		kind: 'pneumatic',
		name: 'Pneumatic press',
		description:
			'A clamp cylinder A and a press cylinder B with monostable 5/2 valves and reed switches. The classic sequence A+ B+ B− A−, with motion time monitoring.',
		io: [
			{ address: 'I0.0', name: 'A_Retracted', comment: '1B1 — clamp A retracted' },
			{ address: 'I0.1', name: 'A_Extended', comment: '1B2 — clamp A extended (part clamped)' },
			{ address: 'I0.2', name: 'B_Retracted', comment: '2B1 — press B at the top' },
			{ address: 'I0.3', name: 'B_Extended', comment: '2B2 — press B at the bottom (pressed)' },
			{ address: 'I0.4', name: 'PartPresent', comment: 'A part in the fixture' },
			{ address: 'I0.5', name: 'AirOk', comment: 'Pressure switch, ≥ 4 bar' },
			{ address: 'Q0.0', name: 'Clamp', comment: '1Y1 — valve of A (on = extend)' },
			{ address: 'Q0.1', name: 'Press', comment: '2Y1 — valve of B (on = extend)' }
		],
		faults: [
			{ id: 'noAir', label: 'Brak sprężonego powietrza' },
			{ id: 'leakB', label: 'Nieszczelny siłownik B (3× wolniej)' }
		]
	},
	{
		kind: 'mixer',
		name: 'Batch mixer',
		description:
			'Two components dosed by level, stirred and heated to 50 °C, then drained. Analog level and temperature transmitters — a classic for SFC.',
		io: [
			{ address: 'I0.0', name: 'LevelOk', comment: 'High-high level switch, NC (1 = below 95 %)' },
			{
				address: 'IW4',
				name: 'Level',
				comment: 'Level 0 … 27648 = 0 … 100 % (4–20 mA)',
				noise: 40
			},
			{ address: 'IW6', name: 'Temperature', comment: 'PT100, °C × 10', noise: 3 },
			{ address: 'Q0.0', name: 'ValveA', comment: 'Inlet of component A' },
			{ address: 'Q0.1', name: 'ValveB', comment: 'Inlet of component B' },
			{ address: 'Q0.2', name: 'Stirrer', comment: 'Stirrer motor' },
			{ address: 'Q0.3', name: 'Heater', comment: 'Heater (only with the elements covered!)' },
			{ address: 'Q0.4', name: 'Outlet', comment: 'Outlet valve' }
		],
		faults: [
			{ id: 'leakA', label: 'Zawór A nie domyka (przeciek)' },
			{ id: 'heaterDead', label: 'Uszkodzona grzałka' },
			{ id: 'stirrerTrip', label: 'Zadziałało zabezpieczenie silnika mieszadła' }
		]
	}
];

export const plantInfo = (kind: ProcessKind | undefined | null) =>
	PLANTS.find((p) => p.kind === kind) ?? null;
