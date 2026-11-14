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
	}
];

export const plantInfo = (kind: ProcessKind | undefined | null) =>
	PLANTS.find((p) => p.kind === kind) ?? null;
