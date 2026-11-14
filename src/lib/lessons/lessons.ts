import { widget } from '#lib/hmi/model.js';
import { device, DEVICES, type Circuit, type Device, type DeviceType } from '#lib/circuit/model.js';
import {
	coil,
	compare,
	contact,
	counterBox,
	moveBox,
	newId,
	parallel,
	rung,
	timer,
	type LadderProgram
} from '#lib/ladder/model.js';
import { watchEntry } from '#lib/monitor/watch.js';
import type { Project } from '#lib/project/project.js';
import type { SymbolEntry } from '#lib/symbols/symbols.js';
import type { ConveyorState, LineState, ProcessKind, TankState } from '#lib/processes/types.js';
import { plantInfo } from '#lib/processes/plants.js';
import type { Check, Lesson, LessonStep } from './types.js';

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

/** Checks the inverter U1 runs at about this frequency (negative = reverse). */
const hz =
	(target: number): Check =>
	({ device }) => {
		const f = device('U1')?.hz ?? 0;
		return Math.abs(f - target) < 0.6
			? null
			: `falownik U1 pracuje z ${f.toFixed(1)} Hz, a powinien ${target} Hz`;
	};

/** Mistakes on the production line fail a test immediately. */
const lineSafety = ({ process }: { process: { state(): unknown } | null }): string | null => {
	const s = process?.state() as LineState;
	if (s.crashes) return 'detal przesunął się pod opuszczonym wiertłem';
	if (s.toolBreaks) return 'wiertło weszło w detal bez włączonego wrzeciona';
	if (s.wrongRejected) return 'zepchnięto dobry detal';
	if (s.badDelivered) return 'wadliwy detal dojechał do końca linii';
	return null;
};

/* ---------- commissioning lessons: machines with wiring faults ---------- */

interface FieldDevice {
	type: DeviceType;
	label: string;
	x: number;
	y: number;
	extra?: Partial<Device>;
	/** port → terminal; `main` is the device's main port */
	wires: Record<string, string>;
}

function field(list: FieldDevice[]): Circuit {
	const circuit: Circuit = { plc: { x: 300, y: 0 }, devices: [], wires: [] };
	for (const f of list) {
		const d = device(f.type, f.label, f.x, f.y, f.extra);
		circuit.devices.push(d);
		for (const [port, terminal] of Object.entries(f.wires)) {
			circuit.wires.push({
				id: newId('w'),
				device: d.id,
				terminal,
				...(port === 'main' ? {} : { port })
			});
		}
	}
	return circuit;
}

const conveyorProgram = () =>
	program(
		rung(
			[
				parallel([[contact('NO', 'Start')], [contact('NO', 'Run')]]),
				contact('NO', 'Stop'),
				contact('NC', 'Fault')
			],
			[coil('COIL', 'Run')],
			'Praca: Start / Stop (NC) z podtrzymaniem, awaria zatrzymuje'
		),
		rung(
			[contact('NO', 'Run'), contact('NC', 'PartAtEnd')],
			[coil('COIL', 'Belt')],
			'Taśma stoi, gdy detal jest na końcu'
		),
		rung([contact('NO', 'Run')], [coil('COIL', 'LampRun')], 'Lampka praca'),
		rung([contact('NC', 'Stop')], [coil('RESET', 'Fault')], 'Stop kasuje awarię'),
		rung(
			[contact('NO', 'Belt'), contact('NC', 'BeltFeedback'), timer('TON', 'T0', 'T#2s')],
			[coil('SET', 'Fault')],
			'Stycznik wysterowany, a brak potwierdzenia przez 2 s = awaria'
		),
		rung([contact('NO', 'Fault')], [coil('COIL', 'LampFault')], 'Lampka awaria')
	);

function commissioningConveyor(faulty: boolean): Project {
	const f = faulty;
	return {
		version: 2,
		ladder: conveyorProgram(),
		circuit: field([
			{
				type: 'pushbutton',
				label: 'S1',
				x: 0,
				y: 30,
				extra: { color: 'green' },
				wires: { main: f ? 'I0.1' : 'I0.0' }
			},
			{
				type: 'pushbutton',
				label: 'S2',
				x: 0,
				y: 200,
				extra: { color: 'red', nc: true },
				wires: { main: f ? 'I0.0' : 'I0.1' }
			},
			{ type: 'sensor', label: 'B1', x: 0, y: 370, extra: { nc: f }, wires: { main: 'I0.2' } },
			{
				type: 'contactor',
				label: 'K1',
				x: 720,
				y: 20,
				wires: { main: 'Q0.0', aux: f ? 'I0.4' : 'I0.3' }
			},
			{
				type: 'lamp',
				label: 'H1',
				x: 720,
				y: 230,
				extra: { color: 'green' },
				wires: { main: f ? 'Q0.2' : 'Q0.1' }
			},
			{
				type: 'lamp',
				label: 'H2',
				x: 720,
				y: 390,
				extra: { color: 'red' },
				wires: { main: f ? 'Q0.1' : 'Q0.2' }
			}
		]),
		symbols: [
			symbol('Start', 'I0.0', 'S1 — przycisk Start (NO)'),
			symbol('Stop', 'I0.1', 'S2 — przycisk Stop (NC: puszczony = 1)'),
			symbol('PartAtEnd', 'I0.2', 'B1 — czujnik końca taśmy (NO: 1 = detal)'),
			symbol('BeltFeedback', 'I0.3', 'K1 — styk pomocniczy (1 = stycznik załączony)'),
			symbol('Belt', 'Q0.0', 'K1 — cewka stycznika taśmy'),
			symbol('LampRun', 'Q0.1', 'H1 — lampka „praca” (zielona)'),
			symbol('LampFault', 'Q0.2', 'H2 — lampka „awaria” (czerwona)'),
			symbol('Run', 'M0.0', 'Linia w pracy'),
			symbol('Fault', 'M0.1', 'Awaria: brak potwierdzenia K1')
		],
		watch: ['Start', 'Stop', 'PartAtEnd', 'BeltFeedback', 'Run', 'Fault'].map((w) =>
			watchEntry(w, undefined, true)
		),
		lesson: 'commissioning-conveyor'
	};
}

const vfdProgram = () =>
	program(
		rung(
			[
				parallel([[contact('NO', 'Start')], [contact('NO', 'Run')]]),
				contact('NO', 'Stop'),
				contact('NC', 'VfdFault')
			],
			[coil('COIL', 'Run')],
			'Praca pompy: Start / Stop (NC), awaria falownika zatrzymuje'
		),
		rung(
			[contact('NO', 'Run'), moveBox('19354', 'SpeedSetpoint')],
			[coil('COIL', 'PumpRun')],
			'RUN falownika i prędkość zadana 70 % = 35 Hz (27648 = 50 Hz)'
		),
		rung([contact('NO', 'Ack')], [coil('COIL', 'VfdReset')], 'Kwitowanie awarii falownika'),
		rung([contact('NO', 'VfdAtSpeed')], [coil('COIL', 'LampAtSpeed')], 'Lampka: pompa na obrotach'),
		rung([contact('NO', 'VfdFault')], [coil('COIL', 'LampFault')], 'Lampka: awaria falownika')
	);

function commissioningVfd(faulty: boolean): Project {
	const f = faulty;
	return {
		version: 2,
		ladder: vfdProgram(),
		circuit: field([
			{
				type: 'pushbutton',
				label: 'S1',
				x: 0,
				y: 30,
				extra: { color: 'green' },
				wires: { main: 'I0.0' }
			},
			{
				type: 'pushbutton',
				label: 'S2',
				x: 0,
				y: 200,
				extra: { color: 'red', nc: true },
				wires: { main: 'I0.1' }
			},
			{
				type: 'pushbutton',
				label: 'S3',
				x: 0,
				y: 370,
				extra: { color: 'blue' },
				wires: { main: 'I0.2' }
			},
			{
				type: 'vfd',
				label: 'U1',
				x: 720,
				y: 0,
				extra: { aiWord: f ? 'QW6' : 'QW4', aoWord: 'IW4' },
				wires: {
					main: f ? 'Q0.4' : 'Q0.0',
					reset: 'Q0.1',
					ready: 'I0.3',
					fault: f ? 'I0.6' : 'I0.4',
					atSpeed: 'I0.5'
				}
			},
			{
				type: 'lamp',
				label: 'H1',
				x: 720,
				y: 290,
				extra: { color: 'green' },
				wires: { main: 'Q0.2' }
			},
			{
				type: 'lamp',
				label: 'H2',
				x: 720,
				y: 440,
				extra: { color: 'red' },
				wires: { main: 'Q0.3' }
			}
		]),
		symbols: [
			symbol('Start', 'I0.0', 'S1 — przycisk Start (NO)'),
			symbol('Stop', 'I0.1', 'S2 — przycisk Stop (NC)'),
			symbol('Ack', 'I0.2', 'S3 — kwitowanie awarii'),
			symbol('VfdReady', 'I0.3', 'U1 — przekaźnik READY'),
			symbol('VfdFault', 'I0.4', 'U1 — przekaźnik FAULT (1 = awaria)'),
			symbol('VfdAtSpeed', 'I0.5', 'U1 — przekaźnik AT SPEED'),
			symbol('PumpRun', 'Q0.0', 'U1 — wejście RUN falownika'),
			symbol('VfdReset', 'Q0.1', 'U1 — wejście RESET falownika'),
			symbol('LampAtSpeed', 'Q0.2', 'H1 — lampka „pompa na obrotach”'),
			symbol('LampFault', 'Q0.3', 'H2 — lampka „awaria falownika”'),
			symbol('SpeedSetpoint', 'QW4', 'U1 AI1 — prędkość zadana (27648 = 50 Hz)'),
			symbol('ActualSpeed', 'IW4', 'U1 AO1 — prędkość rzeczywista (27648 = 50 Hz)'),
			symbol('Run', 'M0.0', 'Pompa w pracy')
		],
		watch: ['Run', 'PumpRun', 'SpeedSetpoint', 'ActualSpeed', 'VfdFault'].map((w) =>
			watchEntry(w, undefined, true)
		),
		lesson: 'commissioning-vfd'
	};
}

/* ---------- lessons ---------- */

export const LESSONS: Lesson[] = [
	{
		slug: 'first-rung',
		title: 'Pierwszy szczebel',
		level: 'basics',
		summary: 'Przycisk zapala lampkę — styki, cewki i cykl skanowania.',
		instructions: [
			'Przycisk `Button` jest podłączony do wejścia `I0.0`, a lampka `Lamp` do wyjścia `Q0.0`.',
			'Lampka ma świecić, dopóki przycisk jest wciśnięty, i zgasnąć po jego puszczeniu.',
			'Dodaj network przyciskiem „+ Network”, ustaw styk na `I0.0` (albo `Button`), a cewkę na `Q0.0` (albo `Lamp`). Uruchom PLC i wciśnij przycisk w widoku Circuit.'
		],
		hints: [
			'Styk zwierny (NO) `┤ ├` przewodzi, gdy jego bit = 1.',
			'Cewka `( )` w każdym cyklu zapisuje do swojego bitu to, czy dochodzi do niej zasilanie.'
		],
		starter: starter('first-rung', [
			['pushbutton', 'Button', 'I0.0', { color: 'green' }],
			['lamp', 'Lamp', 'Q0.0', { color: 'amber' }]
		]),
		solution: () => program(rung([contact('NO', 'Button')], [coil('COIL', 'Lamp')])),
		tests: [
			{
				name: 'Lampka podąża za przyciskiem',
				steps: [
					settle('nic nie wciśnięte', {}, { 'Q0.0': false }),
					settle('wciśnij Button', { 'I0.0': true }, { 'Q0.0': true }),
					settle('puść Button', { 'I0.0': false }, { 'Q0.0': false })
				]
			}
		]
	},
	{
		slug: 'and-or',
		title: 'AND i OR',
		level: 'logic',
		summary: 'Styki szeregowo to AND, równolegle to OR.',
		instructions: [
			'Prasa wymaga obu rąk na przyciskach: `Left` (`I0.0`) i `Right` (`I0.1`).',
			'`Press` (`Q0.0`) może pracować tylko wtedy, gdy OBA przyciski są wciśnięte.',
			'`Warning` (`Q0.1`) ma świecić, gdy wciśnięty jest KTÓRYKOLWIEK przycisk.'
		],
		hints: [
			'Dwa styki jeden za drugim w networku = AND.',
			'Zaznacz styk i użyj „⑂ Branch”, żeby dodać drugi styk równolegle = OR.'
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
				name: 'Tabela prawdy',
				steps: [
					settle(
						'żaden przycisk',
						{ 'I0.0': false, 'I0.1': false },
						{ 'Q0.0': false, 'Q0.1': false }
					),
					settle('tylko Left', { 'I0.0': true, 'I0.1': false }, { 'Q0.0': false, 'Q0.1': true }),
					settle('tylko Right', { 'I0.0': false, 'I0.1': true }, { 'Q0.0': false, 'Q0.1': true }),
					settle('oba przyciski', { 'I0.0': true, 'I0.1': true }, { 'Q0.0': true, 'Q0.1': true })
				]
			}
		]
	},
	{
		slug: 'self-holding',
		title: 'Start / stop z podtrzymaniem',
		level: 'logic',
		summary: 'Najczęstszy układ w przemyśle: silnik, który sam się podtrzymuje.',
		instructions: [
			'`Start` (`I0.0`) i `Stop` (`I0.1`) to przyciski zwierne (NO). `Motor` jest na `Q0.0`.',
			'Krótkie wciśnięcie Start ma uruchomić silnik, który pracuje dalej po puszczeniu przycisku.',
			'Stop ma go wyłączyć — i Stop wygrywa, gdy oba przyciski są wciśnięte naraz.'
		],
		hints: [
			'Równolegle do Start daj styk samego silnika (`Q0.0`) — to styk „podtrzymania”.',
			'Stop ma przerywać obwód: styk rozwierny (NC) `┤/├` na `I0.1` szeregowo.'
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
				name: 'Rusza i pracuje dalej',
				steps: [
					settle('nic nie wciśnięte', {}, { 'Q0.0': false }),
					settle('wciśnij Start', { 'I0.0': true }, { 'Q0.0': true }),
					settle('puść Start', { 'I0.0': false }, { 'Q0.0': true })
				]
			},
			{
				name: 'Zatrzymuje się i stoi',
				steps: [
					settle('wciśnij i puść Start', { 'I0.0': true }, {}),
					settle('puść Start', { 'I0.0': false }, { 'Q0.0': true }),
					settle('wciśnij Stop', { 'I0.1': true }, { 'Q0.0': false }),
					settle('puść Stop', { 'I0.1': false }, { 'Q0.0': false })
				]
			},
			{
				name: 'Stop ma pierwszeństwo',
				steps: [settle('wciśnij oba', { 'I0.0': true, 'I0.1': true }, { 'Q0.0': false })]
			}
		]
	},
	{
		slug: 'toggle',
		title: 'Zbocza: jeden przycisk, włącz i wyłącz',
		level: 'logic',
		summary: 'Wykryj zbocze narastające, żeby przytrzymany przycisk liczył się raz.',
		instructions: [
			'Jeden przycisk `Button` (`I0.0`) steruje lampką `Lamp` (`Q0.0`).',
			'Każde wciśnięcie przełącza lampkę: wciśnięcie → świeci, kolejne → gaśnie.',
			'Przytrzymanie przycisku nie może powodować migania.'
		],
		hints: [
			'Styk zbocza narastającego `┤P├` daje 1 przez dokładnie jeden cykl, gdy bit zmienia się 0 → 1. Zapisz to w markerze, np. `M0.0`.',
			'Lamp = impuls XOR Lamp: (`M0.0` AND NOT `Q0.0`) OR (NOT `M0.0` AND `Q0.0`).'
		],
		starter: starter(
			'toggle',
			[
				['pushbutton', 'Button', 'I0.0'],
				['lamp', 'Lamp', 'Q0.0', { color: 'amber' }]
			],
			{ symbols: [symbol('Pulse', 'M0.0', 'Impuls na jeden cykl po wciśnięciu')] }
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
				name: 'Przełącza przy każdym wciśnięciu',
				steps: [
					settle('nic nie wciśnięte', {}, { 'Q0.0': false }),
					settle('wciśnij', { 'I0.0': true }, { 'Q0.0': true }),
					{ label: 'trzymaj przycisk 1 s', wait: 1010, expect: { 'Q0.0': true } },
					settle('puść', { 'I0.0': false }, { 'Q0.0': true }),
					settle('wciśnij ponownie', { 'I0.0': true }, { 'Q0.0': false }),
					settle('puść ponownie', { 'I0.0': false }, { 'Q0.0': false })
				]
			}
		]
	},
	{
		slug: 'traffic-light',
		title: 'Timery: sygnalizacja świetlna',
		level: 'timers',
		summary: 'Zbuduj sekwencję czasową z timerem TON i porównaniami.',
		instructions: [
			'Lampy: `Red` `Q0.0`, `Yellow` `Q0.1`, `Green` `Q0.2`. Obserwuj je w widoku Process.',
			'Powtarzaj w kółko 8-sekundowy cykl: czerwone 3 s → czerwone + żółte 1 s → zielone 3 s → żółte 1 s → czerwone …',
			'Po uruchomieniu PLC sygnalizacja zaczyna od czerwonego.'
		],
		hints: [
			'Timer, który sam się restartuje: `┤/├ M0.0` → `TON T0 PT T#8s` → cewka `M0.0`. Gdy ET dojdzie do 8 s, M0.0 = 1 przez jeden cykl i zeruje timer.',
			'Potem użyj bloków CMP na `T0` (jego ET w ms): czerwone, gdy `T0 < 4000`, zielone, gdy `T0 >= 4000` i `T0 < 7000` …'
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
					symbol('Cycle', 'T0', 'Timer cyklu'),
					symbol('CycleDone', 'M0.0', 'Restartuje cykl')
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
				name: 'Wykonuje cykl 8 s',
				steps: [
					{ label: '1.5 s', wait: 1500, expect: { 'Q0.0': true, 'Q0.1': false, 'Q0.2': false } },
					{ label: '3.5 s', wait: 2000, expect: { 'Q0.0': true, 'Q0.1': true, 'Q0.2': false } },
					{ label: '5.5 s', wait: 2000, expect: { 'Q0.0': false, 'Q0.1': false, 'Q0.2': true } },
					{ label: '7.5 s', wait: 2000, expect: { 'Q0.0': false, 'Q0.1': true, 'Q0.2': false } },
					{
						label: '9.5 s (drugi cykl)',
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
		title: 'Proces: regulacja poziomu w zbiorniku',
		level: 'process',
		summary: 'Regulacja dwustawna z SET / RESET utrzymuje poziom między czujnikami.',
		instructions: [
			'Zbiornik opróżnia odbiorca. Pompa `Pump` (`Q0.0`) napełnia go szybciej, niż ubywa wody.',
			'Czujniki: `Low` (`I0.0`) = 1, gdy poziom wynosi co najmniej 20 %, `High` (`I0.1`) = 1 od 80 %.',
			'Włącz pompę, gdy poziom spadnie poniżej Low, i wyłącz ją przy High. Zbiornik nie może się przelać ani opróżnić.'
		],
		hints: [
			'Użyj cewki SET do włączenia pompy i RESET do wyłączenia — pomiędzy pompa pamięta swój stan.',
			'Low to czujnik „poziom osiągnięty”: poniżej 20 % daje 0, więc do startu pompy użyj styku rozwiernego (NC).'
		],
		scenario: 'tank',
		starter: starter('tank-level', [['motor', 'Pump', 'Q0.0']], {
			scenario: 'tank',
			symbols: [symbol('Low', 'I0.0', 'Poziom ≥ 20 %'), symbol('High', 'I0.1', 'Poziom ≥ 80 %')],
			watch: ['Low', 'High', 'Pump']
		}),
		solution: () =>
			program(
				rung([contact('NC', 'Low')], [coil('SET', 'Pump')]),
				rung([contact('NO', 'High')], [coil('RESET', 'Pump')])
			),
		tests: [
			{
				name: 'Utrzymuje poziom między Low i High przez 90 s',
				steps: [
					{
						label: '90 s pracy',
						wait: 90_000,
						check: ({ process }) => {
							const s = process?.state() as TankState;
							if (s.pumpStarts < 2)
								return `pompa ruszyła tylko ${s.pumpStarts}× — powinna pracować cyklicznie`;
							if (s.maxLevel > 85)
								return `poziom doszedł do ${s.maxLevel.toFixed(0)} % — wyłącz pompę przy High`;
							return null;
						}
					}
				],
				always: ({ process }) => {
					const s = process?.state() as TankState;
					if (s.overflowed) return 'zbiornik się przelał';
					if (s.level < 10) return `zbiornik prawie się opróżnił (${s.level.toFixed(0)} %)`;
					return null;
				}
			}
		]
	},
	{
		slug: 'sorting-conveyor',
		title: 'Proces: taśmociąg sortujący',
		level: 'process',
		summary: 'Timery impulsowe i liczniki na prawie prawdziwej linii.',
		instructions: [
			'`Run` (`I0.3`) to przełącznik. Gdy jest włączony, pracuje silnik taśmy `Belt` (`Q0.0`).',
			'Wysokie pudełka trzeba zepchnąć z taśmy: `TallBox` (`I0.2`) widzi wysokie pudełko przed spychaczem `Pusher` (`Q0.1`). Niskie mają przejechać.',
			'Licz pudełka na końcu taśmy (`EndSensor`, `I0.1`) i zapal `Full` (`Q0.2`) po 3 dostarczonych.',
			'W widoku Process dokładaj pudełka ręcznie albo włącz automatyczne podawanie.'
		],
		hints: [
			'Timer impulsowy `TP` z PT około `T#600ms` zamienia krótki sygnał czujnika w pełny ruch spychacza.',
			'Licznik: styk `EndSensor` → `CTU C0` z PV `3` → cewka `Full`.'
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
					symbol('EntrySensor', 'I0.0', 'Pudełko na początku taśmy'),
					symbol('EndSensor', 'I0.1', 'Pudełko na końcu taśmy'),
					symbol('TallBox', 'I0.2', 'Wysokie pudełko przed spychaczem'),
					symbol('Pusher', 'Q0.1', 'Spycha pudełka z taśmy')
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
				name: 'Sortuje pięć pudełek',
				steps: [
					{
						label: 'podaj: wysokie, niskie, niskie, wysokie, niskie',
						set: { 'I0.3': true },
						commands: [['feed', { pattern: [true, false, false, true, false], interval: 4000 }]],
						wait: 40_000,
						expect: { 'Q0.2': true },
						check: ({ process }) => {
							const s = process?.state() as ConveyorState;
							if (s.wrongRejected) return `zepchnięto niskie pudełka: ${s.wrongRejected}`;
							if (s.missedTall) return `wysokie pudełka na końcu taśmy: ${s.missedTall}`;
							if (s.delivered !== 3) return `dostarczono ${s.delivered} pudełek, a powinno 3`;
							return null;
						}
					}
				]
			},
			{
				name: 'Taśma słucha przełącznika Run',
				steps: [
					settle('Run wyłączony', { 'I0.3': false }, { 'Q0.0': false }),
					settle('Run włączony', { 'I0.3': true }, { 'Q0.0': true })
				]
			}
		]
	},

	{
		slug: 'drilling-station',
		title: 'Proces: stacja wiercenia (sekwencja)',
		level: 'process',
		summary: 'Prawdziwa sekwencja maszyny: zatrzymaj detal, wierć, wypuść, sprawdź, odrzuć.',
		instructions: [
			'`Start` (`I1.0`) i `Stop` (`I1.1`, podłączony jako NC) włączają i wyłączają linię: stan trzymaj w markerze `Run` (`M1.0`). Gdy `Run` = 1, jedzie taśma `Belt`.',
			'Zatrzymywacz `Stopper` (`Q0.1`) jest normalnie wysunięty, więc każdy detal czeka pod wiertarką. Widzi go `PartAtDrill` (`I0.0`).',
			'Wierć: opuść wiertło (`DrillLower`) przy kręcącym się wrzecionie (`Spindle`). Po dojściu do `DrillBottom` wierć jeszcze co najmniej 1 s, potem pozwól wiertłu wrócić do góry.',
			'Gdy wiertło jest z powrotem w `DrillTop`, schowaj na chwilę zatrzymywacz (ok. 0,6 s), żeby wywiercony detal odjechał — a następny znów się zatrzymał.',
			'Na stanowisku kontroli `PartAtCheck` widzi detal, a `QualityOK` mówi, czy jest dobry. Wadliwe (pęknięte) zepchnij krótkim ruchem `Ejector`.',
			'Nigdy nie przesuwaj detalu pod opuszczonym wiertłem i nie opuszczaj wiertła na detal bez wrzeciona — widok Process liczy te błędy.'
		],
		hints: [
			'Myśl krokami i trzymaj każdy krok w markerze: `Lowering` (`M0.0`) i `Drilled` (`M0.1`). SET krok, gdy jego warunek jest spełniony, RESET, gdy zaczyna się następny.',
			'`┤PartAtDrill├ ┤DrillTop├ ┤/Drilled├ ┤Run├` → `(S) Lowering`; `┤Lowering├` → `(DrillLower)` and `(Spindle)`.',
			'`┤DrillBottom├` → `TON T0 PT T#1200ms` → `(S) Drilled`, `(R) Lowering`.',
			'`┤Drilled├ ┤DrillTop├` → `TP T1 PT T#600ms` → `(Release)`; `┤/Release├` → `(Stopper)`; gdy detal odjedzie (`┤Drilled├ ┤/PartAtDrill├`) → `(R) Drilled`.',
			'Spychacz: `┤PartAtCheck├ ┤/QualityOK├` → `TP T2 PT T#400ms` → `(Ejector)`.'
		],
		scenario: 'line',
		starter: starter(
			'drilling-station',
			[
				['pushbutton', 'Start', 'I1.0', { color: 'green' }],
				['pushbutton', 'Stop', 'I1.1', { color: 'red', nc: true }]
			],
			{
				scenario: 'line',
				symbols: [
					...(plantInfo('line')?.io ?? []).map((io) => symbol(io.name, io.address, io.comment)),
					symbol('Run', 'M1.0', 'Linia włączona'),
					symbol('Lowering', 'M0.0', 'Krok: wiercenie'),
					symbol('Drilled', 'M0.1', 'Krok: detal wywiercony'),
					symbol('Release', 'M0.2', 'Zatrzymywacz schowany na chwilę')
				],
				watch: ['Run', 'PartAtDrill', 'Lowering', 'DrillBottom', 'Drilled', 'Stopper', 'Ejector']
			}
		),
		solution: () =>
			program(
				rung(
					[parallel([[contact('NO', 'Start')], [contact('NO', 'Run')]]), contact('NO', 'Stop')],
					[coil('COIL', 'Run')]
				),
				rung([contact('NO', 'Run')], [coil('COIL', 'Belt')]),
				rung(
					[
						contact('NO', 'PartAtDrill'),
						contact('NO', 'DrillTop'),
						contact('NC', 'Drilled'),
						contact('NO', 'Run')
					],
					[coil('SET', 'Lowering')]
				),
				rung([contact('NO', 'Lowering')], [coil('COIL', 'DrillLower'), coil('COIL', 'Spindle')]),
				rung(
					[contact('NO', 'DrillBottom'), timer('TON', 'T0', 'T#1200ms')],
					[coil('SET', 'Drilled'), coil('RESET', 'Lowering')]
				),
				rung(
					[contact('NO', 'Drilled'), contact('NO', 'DrillTop'), timer('TP', 'T1', 'T#600ms')],
					[coil('COIL', 'Release')]
				),
				rung([contact('NC', 'Release')], [coil('COIL', 'Stopper')]),
				rung([contact('NO', 'Drilled'), contact('NC', 'PartAtDrill')], [coil('RESET', 'Drilled')]),
				rung(
					[contact('NO', 'PartAtCheck'), contact('NC', 'QualityOK'), timer('TP', 'T2', 'T#400ms')],
					[coil('COIL', 'Ejector')]
				)
			),
		tests: [
			{
				name: 'Wierci i dostarcza cztery detale',
				steps: [
					{ label: 'wciśnij Start', set: { 'I1.1': true, 'I1.0': true }, wait: 100 },
					{
						label: 'cztery detale, co 5 s',
						set: { 'I1.0': false },
						commands: [['feed', { pattern: [false, false, false, false], interval: 5000 }]],
						wait: 45_000,
						check: ({ process }) => {
							const s = process?.state() as LineState;
							if (s.good !== 4) return `dobrych detali: ${s.good}, a powinno 4`;
							return null;
						}
					}
				],
				always: lineSafety
			},
			{
				name: 'Odrzuca pęknięty detal',
				steps: [
					{ label: 'wciśnij Start', set: { 'I1.1': true, 'I1.0': true }, wait: 100 },
					{
						label: 'dobry, pęknięty, dobry',
						set: { 'I1.0': false },
						commands: [['feed', { pattern: [false, true, false], interval: 5000 }]],
						wait: 40_000,
						check: ({ process }) => {
							const s = process?.state() as LineState;
							if (s.rejected !== 1) return `zepchnięto ${s.rejected} detali, a powinno 1`;
							if (s.good !== 2) return `dobrych detali: ${s.good}, a powinno 2`;
							return null;
						}
					}
				],
				always: lineSafety
			},
			{
				name: 'Stop wyłącza linię',
				steps: [
					settle('wciśnij Start', { 'I1.1': true, 'I1.0': true }, { 'Q0.0': true }),
					settle('puść Start', { 'I1.0': false }, { 'Q0.0': true }),
					settle('wciśnij Stop', { 'I1.1': false }, { 'Q0.0': false }),
					settle('puść Stop', { 'I1.1': true }, { 'Q0.0': false })
				]
			}
		]
	},
	/* ---------- find the bug ---------- */
	{
		slug: 'bug-double-coil',
		kind: 'debug',
		title: 'Znajdź błąd: lampka z dwóch miejsc',
		level: 'logic',
		summary: 'Dwa przyciski, jedna lampka — a działa tylko jeden przycisk.',
		instructions: [
			'Lampka `Lamp` (`Q0.0`) w korytarzu ma się zapalać od dowolnego z dwóch przycisków: `Button1` (`I0.0`) albo `Button2` (`I0.1`).',
			'**Objaw:** `Button2` działa, a `Button1` nic nie robi — choć w networku 1 wszystko wygląda dobrze.',
			'Znajdź przyczynę i popraw program tak, żeby oba przyciski działały.'
		],
		hints: [
			'Uruchom PLC, wciśnij `Button1` i zajrzyj do zakładki Debug: co dzieje się z `Q0.0` w networku 1, a co w networku 2 tego samego cyklu?',
			'Na jedno wyjście tylko jedna cewka. Wygrywa ostatnia zapisana — połącz oba warunki gałęzią LUB przed jedną cewką.'
		],
		starter: starter(
			'bug-double-coil',
			[
				['pushbutton', 'Button1', 'I0.0'],
				['pushbutton', 'Button2', 'I0.1'],
				['lamp', 'Lamp', 'Q0.0', { color: 'amber' }]
			],
			{
				ladder: program(
					rung([contact('NO', 'Button1')], [coil('COIL', 'Lamp')], 'Przycisk przy wejściu'),
					rung([contact('NO', 'Button2')], [coil('COIL', 'Lamp')], 'Przycisk przy schodach')
				)
			}
		),
		solution: () =>
			program(
				rung(
					[parallel([[contact('NO', 'Button1')], [contact('NO', 'Button2')]])],
					[coil('COIL', 'Lamp')]
				)
			),
		tests: [
			{
				name: 'Każdy przycisk zapala lampkę',
				steps: [
					settle('nic nie wciśnięte', {}, { 'Q0.0': false }),
					settle('tylko Button1', { 'I0.0': true }, { 'Q0.0': true }),
					settle('tylko Button2', { 'I0.0': false, 'I0.1': true }, { 'Q0.0': true }),
					settle('puść oba', { 'I0.1': false }, { 'Q0.0': false })
				]
			}
		]
	},
	{
		slug: 'bug-set-reset-order',
		kind: 'debug',
		title: 'Znajdź błąd: Stop, który przegrywa',
		level: 'logic',
		summary: 'Kolejność networków ma znaczenie — kto pisze ostatni, ten wygrywa.',
		instructions: [
			'Silnik `Motor` (`Q0.0`) włącza `Start` (`I0.0`) cewką SET, a wyłącza `Stop` (`I0.1`) cewką RESET.',
			'**Objaw:** gdy operator trzyma Start, a ktoś w tym czasie wciśnie Stop, silnik dalej pracuje. Stop musi mieć pierwszeństwo.',
			'Popraw program, nie zmieniając przycisków.'
		],
		hints: [
			'PLC wykonuje networki po kolei, od góry. Gdy oba warunki są spełnione, który zapis do `Motor` jest ostatni?',
			'Zamień networki kolejnością (zaznacz network i użyj ↑ / ↓) albo dodaj styk NC `Stop` przed `(S) Motor`.'
		],
		starter: starter(
			'bug-set-reset-order',
			[
				['pushbutton', 'Start', 'I0.0', { color: 'green' }],
				['pushbutton', 'Stop', 'I0.1', { color: 'red' }],
				['motor', 'Motor', 'Q0.0']
			],
			{
				ladder: program(
					rung([contact('NO', 'Stop')], [coil('RESET', 'Motor')], 'Stop'),
					rung([contact('NO', 'Start')], [coil('SET', 'Motor')], 'Start')
				)
			}
		),
		solution: () =>
			program(
				rung([contact('NO', 'Start')], [coil('SET', 'Motor')]),
				rung([contact('NO', 'Stop')], [coil('RESET', 'Motor')])
			),
		tests: [
			{
				name: 'Start i Stop działają',
				steps: [
					settle('wciśnij Start', { 'I0.0': true }, { 'Q0.0': true }),
					settle('puść Start', { 'I0.0': false }, { 'Q0.0': true }),
					settle('wciśnij Stop', { 'I0.1': true }, { 'Q0.0': false }),
					settle('puść Stop', { 'I0.1': false }, { 'Q0.0': false })
				]
			},
			{
				name: 'Stop ma pierwszeństwo',
				steps: [
					settle('trzymaj Start', { 'I0.0': true }, { 'Q0.0': true }),
					settle('wciśnij też Stop', { 'I0.1': true }, { 'Q0.0': false })
				]
			}
		]
	},
	{
		slug: 'bug-flicker',
		kind: 'debug',
		title: 'Znajdź błąd: migająca lampka',
		level: 'logic',
		summary: 'Przełącznik jednym przyciskiem, który działa „losowo”.',
		instructions: [
			'Przycisk `Button` (`I0.0`) ma przełączać lampkę `Lamp` (`Q0.0`): wciśnięcie — świeci, kolejne — gaśnie.',
			'**Objaw:** po krótkim kliknięciu lampka raz zostaje zapalona, raz nie, a gdy przytrzymasz przycisk, miga.',
			'Znajdź przyczynę i popraw jeden element.'
		],
		hints: [
			'Ile cykli PLC trwa jedno wciśnięcie przycisku? Sprawdź na wykresie `Pulse` przy trzymanym przycisku.',
			'`Pulse` ma być 1 przez jeden cykl — potrzebny jest styk zbocza `┤P├`, a nie zwykły styk.'
		],
		starter: starter(
			'bug-flicker',
			[
				['pushbutton', 'Button', 'I0.0'],
				['lamp', 'Lamp', 'Q0.0', { color: 'amber' }]
			],
			{
				symbols: [symbol('Pulse', 'M0.0', 'Ma być impulsem na jeden cykl')],
				watch: ['Button', 'Pulse', 'Lamp'],
				ladder: program(
					rung([contact('NO', 'Button')], [coil('COIL', 'Pulse')], 'Impuls po wciśnięciu'),
					rung(
						[
							parallel([
								[contact('NO', 'Pulse'), contact('NC', 'Lamp')],
								[contact('NC', 'Pulse'), contact('NO', 'Lamp')]
							])
						],
						[coil('COIL', 'Lamp')],
						'Lamp := Pulse XOR Lamp'
					)
				)
			}
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
				name: 'Przełącza przy każdym wciśnięciu, bez migania',
				steps: [
					settle('wciśnij', { 'I0.0': true }, { 'Q0.0': true }),
					{ label: 'trzymaj przycisk 1 s', wait: 1010, expect: { 'Q0.0': true } },
					settle('puść', { 'I0.0': false }, { 'Q0.0': true }),
					settle('wciśnij ponownie', { 'I0.0': true }, { 'Q0.0': false }),
					{ label: 'trzymaj 1 s', wait: 1010, expect: { 'Q0.0': false } }
				]
			}
		]
	},
	{
		slug: 'bug-timer-edge',
		kind: 'debug',
		title: 'Znajdź błąd: timer, który nie odlicza',
		level: 'timers',
		summary: 'Lampka miała się zapalić po 3 s — i nigdy się nie zapala.',
		instructions: [
			'`Start` (`I0.0`) i `Stop` (`I0.1`) sterują silnikiem `Motor` (`Q0.0`) z podtrzymaniem — to działa.',
			'Lampka `Running` (`Q0.1`) ma się zapalić 3 s po starcie silnika i zgasnąć po jego zatrzymaniu.',
			'**Objaw:** silnik pracuje, a `Running` nigdy się nie zapala. Popraw network 2.'
		],
		hints: [
			'Uruchom PLC i obserwuj ET timera `T0` w bloku (albo w Watch). Ile trwa jego wejście IN?',
			'TON liczy tylko, dopóki IN = 1. Styk zbocza daje 1 przez jeden cykl, więc timer od razu się zeruje — potrzebny jest zwykły styk NO.'
		],
		starter: starter(
			'bug-timer-edge',
			[
				['pushbutton', 'Start', 'I0.0', { color: 'green' }],
				['pushbutton', 'Stop', 'I0.1', { color: 'red' }],
				['motor', 'Motor', 'Q0.0'],
				['lamp', 'Running', 'Q0.1', { color: 'green' }]
			],
			{
				watch: ['Motor', 'T0', 'Running'],
				ladder: program(
					rung(
						[parallel([[contact('NO', 'Start')], [contact('NO', 'Motor')]]), contact('NC', 'Stop')],
						[coil('COIL', 'Motor')],
						'Silnik z podtrzymaniem'
					),
					rung(
						[contact('P', 'Motor'), timer('TON', 'T0', 'T#3s')],
						[coil('COIL', 'Running')],
						'Running 3 s po starcie'
					)
				)
			}
		),
		solution: () =>
			program(
				rung(
					[parallel([[contact('NO', 'Start')], [contact('NO', 'Motor')]]), contact('NC', 'Stop')],
					[coil('COIL', 'Motor')]
				),
				rung([contact('NO', 'Motor'), timer('TON', 'T0', 'T#3s')], [coil('COIL', 'Running')])
			),
		tests: [
			{
				name: 'Running zapala się po 3 s pracy silnika',
				steps: [
					settle('wciśnij Start', { 'I0.0': true }, { 'Q0.0': true, 'Q0.1': false }),
					settle('puść Start', { 'I0.0': false }, { 'Q0.0': true }),
					{ label: 'po 2 s', wait: 2000, expect: { 'Q0.1': false } },
					{ label: 'po 3,5 s', wait: 1500, expect: { 'Q0.1': true } },
					settle('wciśnij Stop', { 'I0.1': true }, { 'Q0.0': false, 'Q0.1': false })
				]
			}
		]
	},
	{
		slug: 'bug-stop-nc',
		kind: 'debug',
		title: 'Znajdź błąd: silnik nie rusza',
		level: 'logic',
		summary: 'Program wygląda podręcznikowo, a maszyna stoi. Winne jest okablowanie… albo nie.',
		instructions: [
			'Silnik `Motor` (`Q0.0`) z podtrzymaniem: `Start` (`I0.0`), `Stop` (`I0.1`).',
			'Zgodnie z zasadą fail-safe przycisk Stop jest **podłączony stykiem NC** — gdy nikt go nie wciska, na `I0.1` jest 1 (zobacz w widoku Circuit i w panelu I/O).',
			'**Objaw:** silnik w ogóle nie rusza. Popraw program — okablowanie jest dobre.'
		],
		hints: [
			'Zaznacz network i otwórz „Wyjaśnij”: które styki blokują zasilanie, gdy nic nie jest wciśnięte?',
			'Puszczony Stop daje 1. Styk w programie ma przewodzić, gdy sygnał = 1, czyli ma to być styk NO.'
		],
		starter: starter(
			'bug-stop-nc',
			[
				['pushbutton', 'Start', 'I0.0', { color: 'green' }],
				['pushbutton', 'Stop', 'I0.1', { color: 'red', nc: true }],
				['motor', 'Motor', 'Q0.0']
			],
			{
				ladder: program(
					rung(
						[parallel([[contact('NO', 'Start')], [contact('NO', 'Motor')]]), contact('NC', 'Stop')],
						[coil('COIL', 'Motor')],
						'Start / stop z podtrzymaniem'
					)
				)
			}
		),
		solution: () =>
			program(
				rung(
					[parallel([[contact('NO', 'Start')], [contact('NO', 'Motor')]]), contact('NO', 'Stop')],
					[coil('COIL', 'Motor')]
				)
			),
		tests: [
			{
				name: 'Rusza i zatrzymuje się (Stop podłączony jako NC)',
				steps: [
					settle('Stop puszczony (sygnał 1)', { 'I0.1': true }, { 'Q0.0': false }),
					settle('wciśnij Start', { 'I0.0': true }, { 'Q0.0': true }),
					settle('puść Start', { 'I0.0': false }, { 'Q0.0': true }),
					settle('wciśnij Stop (sygnał 0)', { 'I0.1': false }, { 'Q0.0': false }),
					settle('puść Stop', { 'I0.1': true }, { 'Q0.0': false })
				]
			},
			{
				name: 'Zerwany przewód Stop zatrzymuje maszynę',
				steps: [
					settle('uruchom', { 'I0.1': true, 'I0.0': true }, { 'Q0.0': true }),
					settle('puść Start', { 'I0.0': false }, { 'Q0.0': true }),
					settle('przewód Stop przerwany', { 'I0.1': false }, { 'Q0.0': false })
				]
			}
		]
	},
	/* ---------- commissioning: the program is right, the wiring is not ---------- */
	{
		slug: 'commissioning-conveyor',
		kind: 'commissioning',
		title: 'Uruchomienie: przenośnik z czujnikiem',
		level: 'process',
		summary: 'Program jest sprawdzony — ale elektryk się pomylił. Znajdź usterki okablowania.',
		instructions: [
			'Jesteś na uruchomieniu maszyny. **Program jest poprawny** (nie zmieniaj go), a dokumentacja to **tablica symboli** (widok Symbols): który element ma być na którym zacisku.',
			'Maszyna: `S1` Start, `S2` Stop (podłączony NC), `B1` czujnik końca taśmy (1 = detal na końcu, taśma staje), `K1` stycznik taśmy ze stykiem pomocniczym, lampki `H1` praca (zielona) i `H2` awaria (czerwona). Brak potwierdzenia z `K1` przez 2 s = awaria, kasowana przyciskiem Stop.',
			'**Objaw:** nic nie działa. Zrób test sygnałów (zakładka **Test I/O**): uruchom PLC, naciskaj urządzenia po kolei i porównuj z dokumentacją. Popraw okablowanie w widoku Circuit (przeciągnij przewód na właściwy zacisk, zmień NC).'
		],
		hints: [
			'Na uruchomieniu zawsze zaczyna się od **testu sygnałów** (loop check): każde wejście i wyjście po kolei, zanim uruchomisz program w automacie.',
			'Usterek jest cztery: przyciski, czujnik, styk pomocniczy, lampki. Zwróć uwagę, co pokazuje dioda wejścia, gdy NIC nie jest wciśnięte.'
		],
		starter: () => ({
			...commissioningConveyor(true),
			lesson: 'commissioning-conveyor'
		}),
		solution: conveyorProgram,
		solutionCircuit: () => commissioningConveyor(false).circuit,
		tests: [
			{
				name: 'Start i Stop sterują taśmą',
				steps: [
					{
						label: 'nic nie wciśnięte',
						wait: 100,
						expectDevices: { K1: false, H1: false, H2: false }
					},
					{
						label: 'wciśnij S1',
						actuate: { S1: true },
						wait: 100,
						expectDevices: { K1: true, H1: true }
					},
					{
						label: 'puść S1',
						actuate: { S1: false },
						wait: 100,
						expectDevices: { K1: true, H2: false }
					},
					{
						label: 'wciśnij S2',
						actuate: { S2: true },
						wait: 100,
						expectDevices: { K1: false, H1: false }
					},
					{ label: 'puść S2', actuate: { S2: false }, wait: 100, expectDevices: { K1: false } }
				]
			},
			{
				name: 'Czujnik B1 zatrzymuje taśmę',
				steps: [
					{ label: 'start', actuate: { S1: true }, wait: 100 },
					{ label: 'puść S1', actuate: { S1: false }, wait: 100, expectDevices: { K1: true } },
					{
						label: 'detal przed B1',
						actuate: { B1: true },
						wait: 100,
						expectDevices: { K1: false, H1: true }
					},
					{ label: 'detal zabrany', actuate: { B1: false }, wait: 100, expectDevices: { K1: true } }
				]
			},
			{
				name: 'Brak potwierdzenia K1 to awaria',
				steps: [
					{ label: 'start', actuate: { S1: true }, wait: 100 },
					{ label: 'puść S1', actuate: { S1: false }, wait: 1000, expectDevices: { H2: false } },
					{
						label: 'zadziałał termik K1',
						actuate: { K1: true },
						wait: 2500,
						expectDevices: { H2: true, K1: false, H1: false }
					},
					{
						label: 'naprawa i Stop (kasowanie)',
						actuate: { K1: false, S2: true },
						wait: 100,
						expectDevices: { H2: false }
					}
				]
			}
		]
	},
	{
		slug: 'commissioning-vfd',
		kind: 'commissioning',
		title: 'Uruchomienie: pompa z falownikiem',
		level: 'process',
		summary: 'Pompa ma ruszyć na 35 Hz, a stoi. Szukasz błędów w podłączeniu falownika.',
		instructions: [
			'Pompa jest napędzana przez **falownik** `U1`. Sterownik daje mu sygnał RUN (`Q0.0`), kasowanie błędu RESET (`Q0.1`) i prędkość zadaną w słowie analogowym `QW4` (70 % = 19354 = 35 Hz). Falownik odsyła READY (`I0.3`), FAULT (`I0.4`), AT SPEED (`I0.5`) i prędkość rzeczywistą w `IW4`.',
			'`S1` Start, `S2` Stop (NC), `S3` kwitowanie awarii, `H1` lampka „pompa na obrotach”, `H2` lampka „awaria falownika”. **Program jest poprawny.**',
			'**Objaw:** po Start pompa nie rusza, a awaria falownika nie jest sygnalizowana. Znajdź usterki: sprawdź przewody falownika i adresy słów analogowych (pola AI1/AO1 na falowniku w widoku Circuit). Awarię wywołasz przyciskiem **Trip**.'
		],
		hints: [
			'W zakładce Test I/O i w Watch zobaczysz `SpeedSetpoint` (QW4): program wpisuje tam 19354. Czy falownik czyta to samo słowo?',
			'Trzy usterki: przewód RUN, słowo prędkości zadanej, wyjście FAULT falownika.'
		],
		starter: () => ({ ...commissioningVfd(true), lesson: 'commissioning-vfd' }),
		solution: vfdProgram,
		solutionCircuit: () => commissioningVfd(false).circuit,
		tests: [
			{
				name: 'Pompa rusza i osiąga 35 Hz',
				steps: [
					{ label: 'wciśnij S1', actuate: { S1: true }, wait: 100 },
					{
						label: 'puść S1',
						actuate: { S1: false },
						wait: 4000,
						expectDevices: { U1: true, H1: true },
						check: ({ device }) => {
							const hz = device('U1')?.hz ?? 0;
							return Math.abs(hz - 35) < 0.6
								? null
								: `falownik pracuje z ${hz.toFixed(1)} Hz, a powinien 35 Hz`;
						}
					},
					{
						label: 'wciśnij S2',
						actuate: { S2: true },
						wait: 4000,
						expectDevices: { U1: false, H1: false }
					}
				]
			},
			{
				name: 'Awaria falownika: lampka i kwitowanie',
				steps: [
					{ label: 'start', actuate: { S1: true }, wait: 100 },
					{ label: 'puść S1', actuate: { S1: false }, wait: 2000 },
					{
						label: 'awaria U1 (Trip)',
						actuate: { U1: true },
						wait: 300,
						expectDevices: { H2: true }
					},
					{ label: 'S3 — kwitowanie', actuate: { S3: true }, wait: 100 },
					{ label: 'puść S3', actuate: { S3: false }, wait: 100, expectDevices: { H2: false } }
				]
			}
		]
	},
	/* ---------- field skills: drives and the operator panel ---------- */
	{
		slug: 'vfd-fan',
		title: 'Falownik: wentylator z dwiema prędkościami',
		level: 'process',
		fieldTests: true,
		summary: 'Sterujesz napędem: RUN / REV, prędkość zadana w słowie analogowym, kasowanie awarii.',
		instructions: [
			'Wentylator hali napędza falownik `U1` (widok Circuit). `Start` (`I0.0`) i `Stop` (`I0.1`, podłączony NC) włączają go z podtrzymaniem w markerze `Run` (`M0.0`).',
			'Przełącznik `Fast` (`I0.2`): wyłączony = **20 Hz**, włączony = **45 Hz**. Prędkość zadaną wpisz blokiem MOVE do `U1_Setpoint` (`QW4`): 27648 = 50 Hz, więc 20 Hz = `11059`, 45 Hz = `24883`.',
			'Przełącznik `Reverse` (`I0.3`) wybiera kierunek: wtedy zamiast `U1_Run` włącz `U1_Rev`. Nigdy obu naraz — falownik zgłosi błąd.',
			'Awaria falownika (`U1_Fault`) ma zatrzymać wentylator. Wciśnięcie `Stop` kasuje błąd przez `U1_Reset`. Awarię wywołasz przyciskiem **Trip** na falowniku.'
		],
		hints: [
			'Network z podtrzymaniem jak zawsze: `(Start ⑂ Run)`, `┤Stop├`, `┤/U1_Fault├` → `(Run)`.',
			'Dwa networki z MOVE: `┤/Fast├ → MOVE 11059 → U1_Setpoint` i `┤Fast├ → MOVE 24883 → U1_Setpoint`. Każdy network potrzebuje cewki — daj np. markery `SpeedLow` (`M0.1`) i `SpeedHigh` (`M0.2`).',
			'`┤Run├ ┤/Reverse├ → (U1_Run)`, `┤Run├ ┤Reverse├ → (U1_Rev)`, `┤/Stop├ → (U1_Reset)`.'
		],
		starter: () => ({
			version: 2,
			lesson: 'vfd-fan',
			ladder: { version: 1, rungs: [] },
			circuit: field([
				{
					type: 'pushbutton',
					label: 'Start',
					x: 0,
					y: 30,
					extra: { color: 'green' },
					wires: { main: 'I0.0' }
				},
				{
					type: 'pushbutton',
					label: 'Stop',
					x: 0,
					y: 200,
					extra: { color: 'red', nc: true },
					wires: { main: 'I0.1' }
				},
				{ type: 'switch', label: 'Fast', x: 0, y: 370, wires: { main: 'I0.2' } },
				{ type: 'switch', label: 'Reverse', x: 0, y: 530, wires: { main: 'I0.3' } },
				{
					type: 'vfd',
					label: 'U1',
					x: 720,
					y: 20,
					extra: { aiWord: 'QW4', aoWord: 'IW4' },
					wires: {
						main: 'Q0.0',
						rev: 'Q0.1',
						reset: 'Q0.2',
						ready: 'I0.4',
						fault: 'I0.5',
						atSpeed: 'I0.6'
					}
				}
			]),
			symbols: [
				symbol('Run', 'M0.0', 'Wentylator włączony'),
				symbol('SpeedLow', 'M0.1', 'Wybrana prędkość 20 Hz'),
				symbol('SpeedHigh', 'M0.2', 'Wybrana prędkość 45 Hz')
			],
			watch: ['Run', 'U1_Setpoint', 'U1_Speed', 'U1_Fault'].map((w) =>
				watchEntry(w, undefined, true)
			)
		}),
		solution: () =>
			program(
				rung(
					[
						parallel([[contact('NO', 'Start')], [contact('NO', 'Run')]]),
						contact('NO', 'Stop'),
						contact('NC', 'U1_Fault')
					],
					[coil('COIL', 'Run')]
				),
				rung([contact('NC', 'Fast'), moveBox('11059', 'U1_Setpoint')], [coil('COIL', 'SpeedLow')]),
				rung([contact('NO', 'Fast'), moveBox('24883', 'U1_Setpoint')], [coil('COIL', 'SpeedHigh')]),
				rung([contact('NO', 'Run'), contact('NC', 'Reverse')], [coil('COIL', 'U1_Run')]),
				rung([contact('NO', 'Run'), contact('NO', 'Reverse')], [coil('COIL', 'U1_Rev')]),
				rung([contact('NC', 'Stop')], [coil('COIL', 'U1_Reset')])
			),
		tests: [
			{
				name: 'Rusza na 20 Hz, Fast daje 45 Hz, Stop zatrzymuje',
				steps: [
					{ label: 'wciśnij Start', actuate: { Start: true }, wait: 100 },
					{ label: 'puść Start, 2,5 s', actuate: { Start: false }, wait: 2500, check: hz(20) },
					{ label: 'Fast, 3 s', actuate: { Fast: true }, wait: 3000, check: hz(45) },
					{
						label: 'wciśnij Stop, 3,5 s',
						actuate: { Stop: true },
						wait: 3500,
						expectDevices: { U1: false }
					}
				]
			},
			{
				name: 'Reverse kręci w drugą stronę',
				steps: [
					{ label: 'Reverse i Start', actuate: { Reverse: true, Start: true }, wait: 100 },
					{ label: 'puść Start, 2,5 s', actuate: { Start: false }, wait: 2500, check: hz(-20) }
				]
			},
			{
				name: 'Awaria zatrzymuje, Stop kasuje błąd',
				steps: [
					{ label: 'start', actuate: { Start: true }, wait: 100 },
					{ label: 'puść Start', actuate: { Start: false }, wait: 1000 },
					{
						label: 'awaria U1 (Trip)',
						actuate: { U1: true },
						wait: 500,
						expectDevices: { U1: false }
					},
					{ label: 'wciśnij Stop (kasowanie)', actuate: { Stop: true }, wait: 100 },
					{ label: 'puść Stop', actuate: { Stop: false }, wait: 100 },
					{ label: 'Start ponownie', actuate: { Start: true }, wait: 100 },
					{ label: 'puść Start, 2,5 s', actuate: { Start: false }, wait: 2500, check: hz(20) }
				]
			}
		]
	},
	{
		slug: 'hmi-start',
		solutionHmi: () => ({
			widgets: [
				widget('button', 40, 40, { tag: 'HMI_Start', text: 'Start', color: 'green' }),
				widget('button', 180, 40, { tag: 'HMI_Stop', text: 'Stop', color: 'red' }),
				widget('lamp', 320, 40, { tag: 'Motor', text: 'Silnik' })
			],
			alarms: [],
			ackTag: ''
		}),
		title: 'Panel HMI: start i stop z ekranu',
		level: 'process',
		summary: 'Operatorzy chcą sterować silnikiem z panelu — bez psucia przycisków na szafie.',
		instructions: [
			'Silnik `Motor` (`Q0.0`) już działa z przycisków na szafie: `Start` (`I0.0`) i `Stop` (`I0.1`, podłączony NC).',
			'Dodaj na **panelu HMI** (zakładka HMI): przycisk „Start” zapisujący `HMI_Start` (`M10.0`), przycisk „Stop” zapisujący `HMI_Stop` (`M10.1`) i lampkę pokazującą `Motor`.',
			'Zmień program: start z panelu działa **tak jak** przycisk na szafie (LUB), a stop z panelu zatrzymuje silnik **tak jak** Stop na szafie. Stop na szafie musi dalej działać zawsze.'
		],
		hints: [
			'Panel nie pisze do wejść I, tylko do markerów M — program łączy je z przyciskami: `Start ⑂ HMI_Start ⑂ Motor`.',
			'Stop z panelu to dodatkowy styk w szeregu: `┤/HMI_Stop├` obok `┤Stop├`.'
		],
		starter: starter(
			'hmi-start',
			[
				['pushbutton', 'Start', 'I0.0', { color: 'green' }],
				['pushbutton', 'Stop', 'I0.1', { color: 'red', nc: true }],
				['motor', 'Motor', 'Q0.0']
			],
			{
				symbols: [
					symbol('HMI_Start', 'M10.0', 'Przycisk Start na panelu'),
					symbol('HMI_Stop', 'M10.1', 'Przycisk Stop na panelu')
				],
				ladder: program(
					rung(
						[parallel([[contact('NO', 'Start')], [contact('NO', 'Motor')]]), contact('NO', 'Stop')],
						[coil('COIL', 'Motor')],
						'Silnik z podtrzymaniem (przyciski na szafie)'
					)
				)
			}
		),
		solution: () =>
			program(
				rung(
					[
						parallel([
							[contact('NO', 'Start')],
							[contact('NO', 'HMI_Start')],
							[contact('NO', 'Motor')]
						]),
						contact('NO', 'Stop'),
						contact('NC', 'HMI_Stop')
					],
					[coil('COIL', 'Motor')]
				)
			),
		tests: [
			{
				name: 'Start i Stop z panelu',
				steps: [
					settle('Stop na szafie puszczony', { 'I0.1': true }, { 'Q0.0': false }),
					{ label: 'Start na panelu', hmi: { 'M10.0': 1 }, wait: 50, expect: { 'Q0.0': true } },
					{
						label: 'puść Start na panelu',
						hmi: { 'M10.0': 0 },
						wait: 50,
						expect: { 'Q0.0': true }
					},
					{ label: 'Stop na panelu', hmi: { 'M10.1': 1 }, wait: 50, expect: { 'Q0.0': false } },
					{ label: 'puść Stop na panelu', hmi: { 'M10.1': 0 }, wait: 50, expect: { 'Q0.0': false } }
				]
			},
			{
				name: 'Przyciski na szafie działają dalej, Stop na szafie wygrywa',
				steps: [
					settle('Start na szafie', { 'I0.1': true, 'I0.0': true }, { 'Q0.0': true }),
					settle('puść Start', { 'I0.0': false }, { 'Q0.0': true }),
					{
						label: 'Stop na szafie i Start na panelu',
						set: { 'I0.1': false },
						hmi: { 'M10.0': 1 },
						wait: 50,
						expect: { 'Q0.0': false }
					}
				]
			}
		]
	}
];

export const getLesson = (slug: string) => LESSONS.find((l) => l.slug === slug) ?? null;

export const LESSON_PREFIX = 'lesson-';
export const lessonProjectId = (slug: string) => `${LESSON_PREFIX}${slug}`;
