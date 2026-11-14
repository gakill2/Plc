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
	}
];

export const plantInfo = (kind: ProcessKind | undefined | null) =>
	PLANTS.find((p) => p.kind === kind) ?? null;
