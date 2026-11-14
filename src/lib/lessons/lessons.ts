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
import type { ConveyorState, LineState, ProcessKind, TankState } from '#lib/processes/types.js';
import { plantInfo } from '#lib/processes/plants.js';
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

/** Mistakes on the production line fail a test immediately. */
const lineSafety = ({ process }: { process: { state(): unknown } | null }): string | null => {
	const s = process?.state() as LineState;
	if (s.crashes) return 'detal przesunął się pod opuszczonym wiertłem';
	if (s.toolBreaks) return 'wiertło weszło w detal bez włączonego wrzeciona';
	if (s.wrongRejected) return 'zepchnięto dobry detal';
	if (s.badDelivered) return 'wadliwy detal dojechał do końca linii';
	return null;
};

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
	}
];

export const getLesson = (slug: string) => LESSONS.find((l) => l.slug === slug) ?? null;

export const LESSON_PREFIX = 'lesson-';
export const lessonProjectId = (slug: string) => `${LESSON_PREFIX}${slug}`;
