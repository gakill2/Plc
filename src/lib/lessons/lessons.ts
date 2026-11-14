import { device, DEVICES, type Circuit, type Device, type DeviceType } from '#lib/circuit/model.js';
import {
	coil,
	compare,
	contact,
	counterBox,
	newId,
	parallel,
	rung,
	timer,
	type LadderProgram
} from '#lib/ladder/model.js';
import { watchEntry } from '#lib/monitor/watch.js';
import type { Project } from '#lib/project/project.js';
import type { SymbolEntry } from '#lib/symbols/symbols.js';
import type { ConveyorState, ProcessKind, TankState } from '#lib/processes/types.js';
import type { Lesson, LessonStep } from './types.js';

/* ---------- helpers to build lesson projects ---------- */

type Wiring = [type: DeviceType, label: string, terminal: string, extra?: Partial<Device>];

function circuitOf(wiring: Wiring[]): Circuit {
	const circuit: Circuit = { plc: { x: 300, y: 0 }, devices: [], wires: [] };
	const rows = { input: 0, output: 0 };
	for (const [type, label, terminal, extra] of wiring) {
		const io = DEVICES[type].io;
		const d = device(type, label, io === 'input' ? 0 : 720, 30 + rows[io]++ * 170, extra);
		circuit.devices.push(d);
		circuit.wires.push({ id: newId('w'), device: d.id, terminal });
	}
	return circuit;
}

const symbol = (name: string, address: string, comment = ''): SymbolEntry => ({
	id: newId('y'),
	name,
	address,
	comment
});

function starter(
	slug: string,
	wiring: Wiring[],
	options: {
		scenario?: ProcessKind;
		symbols?: SymbolEntry[];
		watch?: string[];
		ladder?: LadderProgram;
	} = {}
): () => Project {
	return () => ({
		version: 2,
		lesson: slug,
		scenario: options.scenario,
		ladder: options.ladder ?? { version: 1, rungs: [] },
		circuit: circuitOf(wiring),
		symbols: options.symbols ?? [],
		watch: (options.watch ?? []).map((w) => watchEntry(w, undefined, true))
	});
}

const program = (...rungs: ReturnType<typeof rung>[]): LadderProgram => ({ version: 1, rungs });
const settle = (
	label: string,
	set: Record<string, boolean>,
	expect: Record<string, boolean>
): LessonStep => ({
	label,
	set,
	wait: 50,
	expect
});

/* ---------- lessons ---------- */

export const LESSONS: Lesson[] = [
	{
		slug: 'first-rung',
		title: 'Your first rung',
		level: 'basics',
		summary: 'A button lights a lamp — contacts, coils and the scan cycle.',
		instructions: [
			'A push button `Button` is wired to input `I0.0` and a lamp `Lamp` to output `Q0.0`.',
			'Make the lamp light while the button is held, and go dark when it is released.',
			'Add a network with “+ Network”, set the contact to `I0.0` (or `Button`) and the coil to `Q0.0` (or `Lamp`). Run it and press the button in the Circuit view.'
		],
		hints: [
			'A normally-open contact `┤ ├` conducts while its bit is 1.',
			'A coil `( )` writes the power reaching it into its bit on every scan.'
		],
		starter: starter('first-rung', [
			['pushbutton', 'Button', 'I0.0', { color: 'green' }],
			['lamp', 'Lamp', 'Q0.0', { color: 'amber' }]
		]),
		solution: () => program(rung([contact('NO', 'Button')], [coil('COIL', 'Lamp')])),
		tests: [
			{
				name: 'Lamp follows the button',
				steps: [
					settle('nothing pressed', {}, { 'Q0.0': false }),
					settle('press Button', { 'I0.0': true }, { 'Q0.0': true }),
					settle('release Button', { 'I0.0': false }, { 'Q0.0': false })
				]
			}
		]
	},
	{
		slug: 'and-or',
		title: 'AND and OR',
		level: 'logic',
		summary: 'Contacts in series are AND, in parallel are OR.',
		instructions: [
			'A press needs both hands on its buttons: `Left` (`I0.0`) and `Right` (`I0.1`).',
			'`Press` (`Q0.0`) may run only while BOTH buttons are held.',
			'`Warning` (`Q0.1`) must light while EITHER button is held.'
		],
		hints: [
			'Two contacts one after another in a network = AND.',
			'Select a contact and use “⑂ Branch” to put another contact in parallel = OR.'
		],
		starter: starter('and-or', [
			['pushbutton', 'Left', 'I0.0'],
			['pushbutton', 'Right', 'I0.1'],
			['motor', 'Press', 'Q0.0'],
			['lamp', 'Warning', 'Q0.1', { color: 'amber' }]
		]),
		solution: () =>
			program(
				rung([contact('NO', 'Left'), contact('NO', 'Right')], [coil('COIL', 'Press')]),
				rung(
					[parallel([[contact('NO', 'Left')], [contact('NO', 'Right')]])],
					[coil('COIL', 'Warning')]
				)
			),
		tests: [
			{
				name: 'Truth table',
				steps: [
					settle('no button', { 'I0.0': false, 'I0.1': false }, { 'Q0.0': false, 'Q0.1': false }),
					settle('Left only', { 'I0.0': true, 'I0.1': false }, { 'Q0.0': false, 'Q0.1': true }),
					settle('Right only', { 'I0.0': false, 'I0.1': true }, { 'Q0.0': false, 'Q0.1': true }),
					settle('both buttons', { 'I0.0': true, 'I0.1': true }, { 'Q0.0': true, 'Q0.1': true })
				]
			}
		]
	},
	{
		slug: 'self-holding',
		title: 'Start / stop with self-holding',
		level: 'logic',
		summary: 'The most common circuit in industry: a motor that stays on.',
		instructions: [
			'`Start` (`I0.0`) and `Stop` (`I0.1`) are both normally-open push buttons. `Motor` is on `Q0.0`.',
			'A short press of Start must start the motor and keep it running after Start is released.',
			'Stop must switch it off — and Stop wins if both buttons are pressed at once.'
		],
		hints: [
			'Put a contact of the motor itself (`Q0.0`) in parallel with Start — that is the “holding” contact.',
			'Stop must break the circuit: a normally-closed contact `┤/├` of `I0.1` in series.'
		],
		starter: starter('self-holding', [
			['pushbutton', 'Start', 'I0.0', { color: 'green' }],
			['pushbutton', 'Stop', 'I0.1', { color: 'red' }],
			['motor', 'Motor', 'Q0.0']
		]),
		solution: () =>
			program(
				rung(
					[parallel([[contact('NO', 'Start')], [contact('NO', 'Motor')]]), contact('NC', 'Stop')],
					[coil('COIL', 'Motor')]
				)
			),
		tests: [
			{
				name: 'Starts and keeps running',
				steps: [
					settle('nothing pressed', {}, { 'Q0.0': false }),
					settle('press Start', { 'I0.0': true }, { 'Q0.0': true }),
					settle('release Start', { 'I0.0': false }, { 'Q0.0': true })
				]
			},
			{
				name: 'Stops and stays stopped',
				steps: [
					settle('press and release Start', { 'I0.0': true }, {}),
					settle('release Start', { 'I0.0': false }, { 'Q0.0': true }),
					settle('press Stop', { 'I0.1': true }, { 'Q0.0': false }),
					settle('release Stop', { 'I0.1': false }, { 'Q0.0': false })
				]
			},
			{
				name: 'Stop has priority',
				steps: [settle('press both', { 'I0.0': true, 'I0.1': true }, { 'Q0.0': false })]
			}
		]
	},
	{
		slug: 'toggle',
		title: 'Edges: one button, on and off',
		level: 'logic',
		summary: 'Detect a rising edge so a held button counts once.',
		instructions: [
			'One push button `Button` (`I0.0`) controls a lamp `Lamp` (`Q0.0`).',
			'Each press toggles the lamp: press → on, press again → off.',
			'Holding the button must not make the lamp flicker.'
		],
		hints: [
			'A rising-edge contact `┤P├` is true for exactly one scan when its bit goes 0 → 1. Store it in a marker such as `M0.0`.',
			'Lamp = pulse XOR Lamp: (`M0.0` AND NOT `Q0.0`) OR (NOT `M0.0` AND `Q0.0`).'
		],
		starter: starter(
			'toggle',
			[
				['pushbutton', 'Button', 'I0.0'],
				['lamp', 'Lamp', 'Q0.0', { color: 'amber' }]
			],
			{ symbols: [symbol('Pulse', 'M0.0', 'One-scan pulse on press')] }
		),
		solution: () =>
			program(
				rung([contact('P', 'Button')], [coil('COIL', 'Pulse')]),
				rung(
					[
						parallel([
							[contact('NO', 'Pulse'), contact('NC', 'Lamp')],
							[contact('NC', 'Pulse'), contact('NO', 'Lamp')]
						])
					],
					[coil('COIL', 'Lamp')]
				)
			),
		tests: [
			{
				name: 'Toggles on each press',
				steps: [
					settle('nothing pressed', {}, { 'Q0.0': false }),
					settle('press', { 'I0.0': true }, { 'Q0.0': true }),
					{ label: 'hold the button for 1 s', wait: 1000, expect: { 'Q0.0': true } },
					settle('release', { 'I0.0': false }, { 'Q0.0': true }),
					settle('press again', { 'I0.0': true }, { 'Q0.0': false }),
					settle('release again', { 'I0.0': false }, { 'Q0.0': false })
				]
			}
		]
	},
	{
		slug: 'traffic-light',
		title: 'Timers: a traffic light',
		level: 'timers',
		summary: 'Build a timed sequence with a TON timer and comparisons.',
		instructions: [
			'Lamps: `Red` `Q0.0`, `Yellow` `Q0.1`, `Green` `Q0.2`. Watch them in the Process view.',
			'Run this 8-second cycle forever: red 3 s → red + yellow 1 s → green 3 s → yellow 1 s → red …',
			'The light starts with red as soon as the PLC runs.'
		],
		hints: [
			'A timer that restarts itself: `┤/├ M0.0` → `TON T0 PT T#8s` → coil `M0.0`. When ET reaches 8 s, M0.0 is on for one scan and resets the timer.',
			'Then use CMP boxes on `T0` (its ET in ms): red while `T0 < 4000`, green while `T0 >= 4000` and `T0 < 7000` …'
		],
		scenario: 'traffic',
		starter: starter(
			'traffic-light',
			[
				['lamp', 'Red', 'Q0.0', { color: 'red' }],
				['lamp', 'Yellow', 'Q0.1', { color: 'amber' }],
				['lamp', 'Green', 'Q0.2', { color: 'green' }]
			],
			{
				scenario: 'traffic',
				symbols: [
					symbol('Cycle', 'T0', 'Cycle timer'),
					symbol('CycleDone', 'M0.0', 'Restarts the cycle')
				],
				watch: ['Cycle', 'Red', 'Yellow', 'Green']
			}
		),
		solution: () =>
			program(
				rung(
					[contact('NC', 'CycleDone'), timer('TON', 'Cycle', 'T#8s')],
					[coil('COIL', 'CycleDone')]
				),
				rung([compare('<', 'Cycle', '4000')], [coil('COIL', 'Red')]),
				rung(
					[
						parallel([
							[compare('>=', 'Cycle', '3000'), compare('<', 'Cycle', '4000')],
							[compare('>=', 'Cycle', '7000')]
						])
					],
					[coil('COIL', 'Yellow')]
				),
				rung(
					[compare('>=', 'Cycle', '4000'), compare('<', 'Cycle', '7000')],
					[coil('COIL', 'Green')]
				)
			),
		tests: [
			{
				name: 'Runs the 8 s cycle',
				steps: [
					{ label: '1.5 s', wait: 1500, expect: { 'Q0.0': true, 'Q0.1': false, 'Q0.2': false } },
					{ label: '3.5 s', wait: 2000, expect: { 'Q0.0': true, 'Q0.1': true, 'Q0.2': false } },
					{ label: '5.5 s', wait: 2000, expect: { 'Q0.0': false, 'Q0.1': false, 'Q0.2': true } },
					{ label: '7.5 s', wait: 2000, expect: { 'Q0.0': false, 'Q0.1': true, 'Q0.2': false } },
					{
						label: '9.5 s (second cycle)',
						wait: 2000,
						expect: { 'Q0.0': true, 'Q0.1': false, 'Q0.2': false }
					}
				],
				always: ({ out }) =>
					out('Q0.2') && (out('Q0.0') || out('Q0.1'))
						? 'green must never be on together with red or yellow'
						: null
			}
		]
	},
	{
		slug: 'tank-level',
		title: 'Process: tank level control',
		level: 'process',
		summary: 'Two-point control with SET / RESET keeps a tank between sensors.',
		instructions: [
			'A tank is drained by a consumer. `Pump` (`Q0.0`) fills it faster than it drains.',
			'Sensors: `Low` (`I0.0`) is on while the level is at least 20 %, `High` (`I0.1`) while it is at least 80 %.',
			'Start the pump when the level drops below Low and stop it at High. The tank must never overflow or run dry.'
		],
		hints: [
			'Use a SET coil to switch the pump on and a RESET coil to switch it off — the pump keeps its state in between.',
			'Low is a “level reached” sensor: below 20 % it reads 0, so use a normally-closed contact to start the pump.'
		],
		scenario: 'tank',
		starter: starter('tank-level', [['motor', 'Pump', 'Q0.0']], {
			scenario: 'tank',
			symbols: [symbol('Low', 'I0.0', 'Level ≥ 20 %'), symbol('High', 'I0.1', 'Level ≥ 80 %')],
			watch: ['Low', 'High', 'Pump']
		}),
		solution: () =>
			program(
				rung([contact('NC', 'Low')], [coil('SET', 'Pump')]),
				rung([contact('NO', 'High')], [coil('RESET', 'Pump')])
			),
		tests: [
			{
				name: 'Keeps the level between Low and High for 90 s',
				steps: [
					{
						label: '90 s of operation',
						wait: 90_000,
						check: ({ process }) => {
							const s = process?.state() as TankState;
							if (s.pumpStarts < 2)
								return `the pump started only ${s.pumpStarts}× — it should cycle`;
							if (s.maxLevel > 85)
								return `level rose to ${s.maxLevel.toFixed(0)} % — stop the pump at High`;
							return null;
						}
					}
				],
				always: ({ process }) => {
					const s = process?.state() as TankState;
					if (s.overflowed) return 'the tank overflowed';
					if (s.level < 10) return `the tank ran almost dry (${s.level.toFixed(0)} %)`;
					return null;
				}
			}
		]
	},
	{
		slug: 'sorting-conveyor',
		title: 'Process: sorting conveyor',
		level: 'process',
		summary: 'Pulse timers and counters on a real-ish production line.',
		instructions: [
			'`Run` (`I0.3`) is a selector switch. While it is on, the belt motor `Belt` (`Q0.0`) runs.',
			'Tall boxes must be pushed off the belt: `TallBox` (`I0.2`) sees a tall box in front of the pusher `Pusher` (`Q0.1`). Short boxes must pass.',
			'Count the boxes arriving at the end (`EndSensor`, `I0.1`) and light `Full` (`Q0.2`) once 3 boxes have been delivered.',
			'In the Process view, feed boxes by hand or switch on automatic feeding.'
		],
		hints: [
			'A pulse timer `TP` with PT around `T#600ms` turns a short sensor signal into a full push stroke.',
			'Counter: contact `EndSensor` → `CTU C0` with PV `3` → coil `Full`.'
		],
		scenario: 'conveyor',
		starter: starter(
			'sorting-conveyor',
			[
				['switch', 'Run', 'I0.3'],
				['motor', 'Belt', 'Q0.0'],
				['lamp', 'Full', 'Q0.2', { color: 'blue' }]
			],
			{
				scenario: 'conveyor',
				symbols: [
					symbol('EntrySensor', 'I0.0', 'Box at the start of the belt'),
					symbol('EndSensor', 'I0.1', 'Box at the end of the belt'),
					symbol('TallBox', 'I0.2', 'Tall box in front of the pusher'),
					symbol('Pusher', 'Q0.1', 'Pushes boxes off the belt')
				],
				watch: ['Run', 'Belt', 'TallBox', 'Pusher', 'EndSensor']
			}
		),
		solution: () =>
			program(
				rung([contact('NO', 'Run')], [coil('COIL', 'Belt')]),
				rung([contact('NO', 'TallBox'), timer('TP', 'T0', 'T#600ms')], [coil('COIL', 'Pusher')]),
				rung([contact('NO', 'EndSensor'), counterBox('CTU', 'C0', '3', '')], [coil('COIL', 'Full')])
			),
		tests: [
			{
				name: 'Sorts five boxes',
				steps: [
					{
						label: 'feed tall, short, short, tall, short',
						set: { 'I0.3': true },
						commands: [['feed', { pattern: [true, false, false, true, false], interval: 4000 }]],
						wait: 40_000,
						expect: { 'Q0.2': true },
						check: ({ process }) => {
							const s = process?.state() as ConveyorState;
							if (s.wrongRejected) return `${s.wrongRejected} short box(es) were pushed off`;
							if (s.missedTall) return `${s.missedTall} tall box(es) reached the end`;
							if (s.delivered !== 3) return `${s.delivered} boxes delivered, expected 3`;
							return null;
						}
					}
				]
			},
			{
				name: 'The belt follows the Run switch',
				steps: [
					settle('Run off', { 'I0.3': false }, { 'Q0.0': false }),
					settle('Run on', { 'I0.3': true }, { 'Q0.0': true })
				]
			}
		]
	}
];

export const getLesson = (slug: string) => LESSONS.find((l) => l.slug === slug) ?? null;

export const LESSON_PREFIX = 'lesson-';
export const lessonProjectId = (slug: string) => `${LESSON_PREFIX}${slug}`;
