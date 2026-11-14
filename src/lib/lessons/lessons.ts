import { sfcStep, sfcTransition, type Sfc } from '#lib/sfc/sfc.js';
import { widget } from '#lib/hmi/model.js';
import { device, DEVICES, type Circuit, type Device, type DeviceType } from '#lib/circuit/model.js';
import {
	coil,
	compare,
	contact,
	counterBox,
	mathBox,
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
import type {
	ConveyorState,
	CraneState,
	DrivePlantState,
	LineState,
	OvenState,
	ProcessKind,
	TankState
} from '#lib/processes/types.js';
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

/* ---------- plant helpers: crane and oven ---------- */

/** The crane never crashes, swings a load or gets Left + Right at once. */
const craneSafe: Check = ({ process }) => {
	const s = process?.state() as CraneState | undefined;
	if (!s) return null;
	if (s.shorts) return 'Left i Right załączone naraz';
	if (s.crashes) return 'wózek uderzył w odbojnik';
	if (s.swings) return 'jazda z opuszczonym hakiem';
	return null;
};

/** The trolley stands at this position (± 40 mm). */
const craneAt =
	(mm: number): Check =>
	({ process }) => {
		const s = process?.state() as CraneState;
		if (Math.abs(s.v) > 1) return `wózek jeszcze jedzie (${Math.round(s.x)} mm)`;
		return Math.abs(s.x - mm) <= 40
			? null
			: `wózek stanął na ${Math.round(s.x)} mm, a cel to ${mm} mm (±40)`;
	};

/** The oven holds this temperature within ± tol °C. */
const ovenNear =
	(sp: number, tol: number): Check =>
	({ process }) => {
		const t = (process?.state() as OvenState).temp;
		return Math.abs(t - sp) <= tol
			? null
			: `temperatura ${t.toFixed(1)} °C, a powinna być ${sp} ± ${tol} °C`;
	};

/** The oven's PI controller in Structured Text with the given tuning. */
const ovenSt = (kp: number, ti: number, heater: string) => `(* Regulator PI pieca.
   Temperature (IW4) = °C × 10, HeaterPower (QW4) = 0 … 27648 = 0 … 100 % *)
VAR
  Kp       : REAL := ${kp.toFixed(1)};   // wzmocnienie: % mocy na 1 °C uchybu
  Ti       : REAL := ${ti.toFixed(1)};   // czas zdwojenia, s
  Setpoint : REAL := 180.0;  // temperatura zadana, °C
  pv       : REAL;
  err      : REAL;
  integral : REAL;
  out      : REAL;
  tick     : TON;
END_VAR

// regulator liczy co 100 ms (stały okres próbkowania)
tick(IN := NOT tick.Q, PT := T#100ms);
IF tick.Q THEN
  pv := INT_TO_REAL(Temperature) / 10.0;
  err := Setpoint - pv;
  integral := integral + err * 0.1 / Ti;
  out := Kp * (err + integral);
  // anti-windup: przy nasyceniu całka nie rośnie dalej
  IF out > 100.0 THEN
    out := 100.0;
    integral := integral - err * 0.1 / Ti;
  ELSIF out < 0.0 THEN
    out := 0.0;
    integral := integral - err * 0.1 / Ti;
  END_IF;
END_IF;

Heater := ${heater};
HeaterPower := REAL_TO_INT(out * 276.48);
`;

/** The drilling station as an SFC chart; `full` adds the steps the student builds. */
function drillingSfc(full: boolean): Sfc {
	const steps = [
		sfcStep('Wait', true, [['N', 'Stopper']]),
		sfcStep('Drill', false, [
			['N', 'DrillLower'],
			['N', 'Spindle'],
			['N', 'Stopper']
		])
	];
	const transitions = [sfcTransition('Wait', 'Drill', 'Run AND PartAtDrill AND DrillTop')];
	if (full) {
		steps.push(
			sfcStep('Dwell', false, [
				['N', 'DrillLower'],
				['N', 'Spindle'],
				['N', 'Stopper']
			]),
			sfcStep('Raise', false, [['N', 'Stopper']]),
			sfcStep('Release'),
			sfcStep('Leave', false, [['N', 'Stopper']])
		);
		transitions.push(
			sfcTransition('Drill', 'Dwell', 'DrillBottom'),
			sfcTransition('Dwell', 'Raise', 'Dwell.T >= T#1200ms'),
			sfcTransition('Raise', 'Release', 'DrillTop'),
			sfcTransition('Release', 'Leave', 'Release.T >= T#600ms'),
			sfcTransition('Leave', 'Wait', 'NOT PartAtDrill')
		);
	}
	return {
		steps,
		transitions,
		logic: `VAR
  eject : TP;
END_VAR
// linia: Start / Stop (NC) z podtrzymaniem, taśma jedzie przy Run
Run := (Start OR Run) AND Stop;
Belt := Run;
// spychacz: krótki impuls na wadliwy detal
eject(IN := PartAtCheck AND NOT QualityOK, PT := T#400ms);
Ejector := eject.Q;
`
	};
}

/* ---------- PROFIdrive lesson ---------- */

/** The drive is in this state and runs at about this frequency. */
const driveAt =
	(state: string, hz: number): Check =>
	({ process }) => {
		const d = (process?.state() as DrivePlantState).drive;
		if (d.state !== state)
			return `napęd jest w stanie ${d.state}${d.fault ? ` (${d.fault})` : ''}, a powinien w ${state}`;
		return Math.abs(d.hz - hz) < 0.6
			? null
			: `napęd kręci ${d.hz.toFixed(1)} Hz, a powinien ${hz} Hz`;
	};

const DRIVE_ST_STARTER = `(* Napęd na Profinecie, telegram 1:
   STW1 (QW4) i NSOLL_A (QW6) do napędu, ZSW1 (IW4) i NIST_A (IW6) z napędu.
   16#4000 = 100 % = 50 Hz *)
VAR
  Run : BOOL;
END_VAR

Run := (Start OR Run) AND Stop;

IF Run THEN
  STW1 := 16#047F;
ELSE
  STW1 := 0;
END_IF;
NSOLL_A := 16#2000;

LampRun := Run;
`;

const DRIVE_ST_SOLUTION = `(* Napęd na Profinecie, telegram 1:
   STW1 (QW4) i NSOLL_A (QW6) do napędu, ZSW1 (IW4) i NIST_A (IW6) z napędu.
   16#4000 = 100 % = 50 Hz *)
VAR
  Run   : BOOL;
  Fault : BOOL;
END_VAR

Fault := (ZSW1 AND 16#0008) <> 0;      // ZSW1 bit 3: błąd napędu
Run := (Start OR Run) AND Stop AND NOT Fault;

IF Run THEN
  STW1 := 16#047F;                      // ON: S2 → S3 → S4 (praca)
ELSE
  STW1 := 16#047E;                      // OFF1: rampą do zera, potem gotowość (S2)
END_IF;
IF Ack THEN
  STW1 := STW1 OR 16#0080;              // bit 7: kwitowanie błędu (zbocze)
END_IF;

IF Fast THEN
  NSOLL_A := 16#4000;                   // 100 % = 50 Hz
ELSE
  NSOLL_A := 16#2000;                   // 50 % = 25 Hz
END_IF;

LampRun := (ZSW1 AND 16#0004) <> 0;     // ZSW1 bit 2: praca
LampFault := Fault;
`;

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
	},
	/* ---------- new plants: crane positioning and oven PID ---------- */
	{
		slug: 'crane-positioning',
		title: 'Suwnica: pozycjonowanie z enkoderem',
		level: 'process',
		scenario: 'crane',
		summary:
			'Dojedź wózkiem do stacji A lub B: szybko, potem wolno, zatrzymaj się dokładnie i bezpiecznie.',
		instructions: [
			'Wózek suwnicy jeździ po torze 10 m. Enkoder podaje pozycję w mm na `Position` (`IW4`). `Left` / `Right` (`Q0.0` / `Q0.1`) to kierunki jazdy, `Fast` (`Q0.2`) — szybki bieg 1 m/s (bez niego 0,2 m/s).',
			'Przyciski `GoA` (`I0.5`) i `GoB` (`I0.6`) wysyłają wózek do stacji A (**2000 mm**) i B (**8000 mm**). Zapamiętaj cel w `Target` (`MW10`) blokiem MOVE i ustaw `Moving` (`M0.0`).',
			'Licz uchyb `Error := Position − Target` (blok MATH SUB do `MW12`). Jedź w prawo, gdy `Error < −30`, w lewo, gdy `Error > 30`. Szybko tylko, gdy do celu jest ponad **600 mm** — wózek ma masę i hamuje ok. pół metra. W paśmie ±30 mm skasuj `Moving`.',
			'Bezpieczeństwo: jazda tylko z hakiem na górze (`HookTop`), krańcówki `LimitLeft` / `LimitRight` są NC (1 = wolne), `Stop` (`I0.7`, NC) zatrzymuje. **Nigdy** `Left` i `Right` naraz.'
		],
		hints: [
			'`┤P GoA├ → MOVE 2000 → Target → (S Moving)`, tak samo dla B z 8000. Każdy network z MOVE potrzebuje cewki — tu SET `Moving` pasuje idealnie.',
			'`┤Moving├ → SUB Position, Target → Error → (Calc)`. Potem: `┤Moving├ [Error > −30] [Error < 30] → (R Moving)` oraz `┤/Stop├ → (R Moving)`.',
			'`┤Moving├ ┤HookTop├ ┤LimitRight├ [Error < −30] ┤/Left├ → (Right)` i lustrzanie dla `Left`. `┤Moving├ ([Error < −600] ⑂ [Error > 600]) → (Fast)`.'
		],
		starter: starter(
			'crane-positioning',
			[
				['pushbutton', 'GoA', 'I0.5', { color: 'blue' }],
				['pushbutton', 'GoB', 'I0.6', { color: 'blue' }],
				['pushbutton', 'Stop', 'I0.7', { color: 'red', nc: true }]
			],
			{
				scenario: 'crane',
				symbols: [
					symbol('LimitLeft', 'I0.0', 'Krańcówka lewa, NC (1 = wolne)'),
					symbol('LimitRight', 'I0.1', 'Krańcówka prawa, NC (1 = wolne)'),
					symbol('HookTop', 'I0.2', 'Hak na górze'),
					symbol('HookBottom', 'I0.3', 'Hak na dole'),
					symbol('Position', 'IW4', 'Enkoder: pozycja wózka w mm'),
					symbol('Left', 'Q0.0', 'Jazda w lewo'),
					symbol('Right', 'Q0.1', 'Jazda w prawo'),
					symbol('Fast', 'Q0.2', 'Szybki bieg'),
					symbol('Moving', 'M0.0', 'Pozycjonowanie w toku'),
					symbol('Calc', 'M0.1', 'Uchyb policzony'),
					symbol('Target', 'MW10', 'Pozycja docelowa, mm'),
					symbol('Error', 'MW12', 'Uchyb: Position − Target, mm')
				],
				watch: ['Position', 'Target', 'Error', 'Moving', 'Fast']
			}
		),
		solution: () =>
			program(
				rung(
					[contact('P', 'GoA'), moveBox('2000', 'Target')],
					[coil('SET', 'Moving')],
					'Do stacji A'
				),
				rung(
					[contact('P', 'GoB'), moveBox('8000', 'Target')],
					[coil('SET', 'Moving')],
					'Do stacji B'
				),
				rung(
					[contact('NO', 'Moving'), mathBox('SUB', 'Position', 'Target', 'Error')],
					[coil('COIL', 'Calc')],
					'Uchyb pozycji'
				),
				rung(
					[contact('NO', 'Moving'), compare('>', 'Error', '-30'), compare('<', 'Error', '30')],
					[coil('RESET', 'Moving')],
					'Na miejscu (±30 mm)'
				),
				rung([contact('NC', 'Stop')], [coil('RESET', 'Moving')], 'Stop'),
				rung(
					[
						contact('NO', 'Moving'),
						contact('NO', 'HookTop'),
						contact('NO', 'LimitRight'),
						compare('<', 'Error', '-30'),
						contact('NC', 'Left')
					],
					[coil('COIL', 'Right')],
					'Jazda w prawo'
				),
				rung(
					[
						contact('NO', 'Moving'),
						contact('NO', 'HookTop'),
						contact('NO', 'LimitLeft'),
						compare('>', 'Error', '30'),
						contact('NC', 'Right')
					],
					[coil('COIL', 'Left')],
					'Jazda w lewo'
				),
				rung(
					[
						contact('NO', 'Moving'),
						parallel([[compare('<', 'Error', '-600')], [compare('>', 'Error', '600')]])
					],
					[coil('COIL', 'Fast')],
					'Szybko daleko od celu'
				)
			),
		tests: [
			{
				name: 'Do stacji B i z powrotem do A, dokładnie i bez uderzeń',
				always: craneSafe,
				steps: [
					{ label: 'Stop puszczony', set: { 'I0.7': true }, wait: 100 },
					{ label: 'GoB', set: { 'I0.6': true }, wait: 100 },
					{ label: 'puść GoB, 8 s', set: { 'I0.6': false }, wait: 8000, check: craneAt(8000) },
					{ label: 'GoA', set: { 'I0.5': true }, wait: 100 },
					{ label: 'puść GoA, 10 s', set: { 'I0.5': false }, wait: 10_000, check: craneAt(2000) }
				]
			},
			{
				name: 'Szybko daleko od celu, wolno przy celu',
				always: craneSafe,
				steps: [
					{ label: 'Stop puszczony', set: { 'I0.7': true }, wait: 100 },
					{ label: 'GoB', set: { 'I0.6': true }, wait: 100 },
					{
						label: 'puść GoB, 2 s',
						set: { 'I0.6': false },
						wait: 2000,
						expect: { 'Q0.2': true, 'Q0.1': true }
					},
					{ label: 'blisko celu', wait: 2500, expect: { 'Q0.2': false } }
				]
			},
			{
				name: 'Bez haka na górze nie jedzie, Stop zatrzymuje',
				steps: [
					{
						label: 'hak opuszczony, GoB',
						set: { 'I0.7': true, 'I0.6': true },
						commands: [['hook', 1]],
						wait: 100
					},
					{
						label: 'puść GoB, 2 s',
						set: { 'I0.6': false },
						wait: 2000,
						expect: { 'Q0.0': false, 'Q0.1': false }
					},
					{ label: 'hak w górę', commands: [['hook', 0]], wait: 1500, expect: { 'Q0.1': true } },
					{
						label: 'Stop',
						set: { 'I0.7': false },
						wait: 100,
						expect: { 'Q0.1': false, 'Q0.2': false }
					},
					{ label: 'puść Stop', set: { 'I0.7': true }, wait: 1000, expect: { 'Q0.1': false } }
				]
			}
		]
	},
	{
		slug: 'oven-pid',
		title: 'Piec: strojenie regulatora PI',
		level: 'process',
		scenario: 'oven',
		summary: 'Regulator PI w Structured Text oscyluje. Dostrój Kp i Ti i dodaj blokadę drzwi.',
		instructions: [
			'Piec ma grzałki z regulatorem mocy: `HeaterPower` (`QW4`, 0 … 27648 = 0 … 100 %) i stycznik `Heater` (`Q0.0`). Temperatura przychodzi z termopary na `Temperature` (`IW4`) w °C × 10.',
			'Program w **Structured Text** ma gotowy regulator PI, ale nastawy są złe: temperatura mocno przestrzeliwuje i się buja. Uruchom PLC, zobacz to na **trendzie** i w widoku Process.',
			'Dobierz `Kp` (wzmocnienie, % mocy na °C) i `Ti` (czas zdwojenia, s) tak, żeby piec doszedł do **180 °C** w mniej niż minutę, przestrzelił najwyżej o 8 °C i trzymał temperaturę ±1,5 °C — także po włożeniu zimnego wsadu.',
			'Bezpieczeństwo: przy otwartych drzwiach (`DoorClosed` = 0) albo zadziałaniu termostatu (`OverTemp`) stycznik grzałek ma być wyłączony.'
		],
		hints: [
			'Za duże `Kp` = oscylacje, za małe = powolne dochodzenie. Za małe `Ti` = całka „rozkręca się” i daje przeregulowanie. Zacznij od dużego `Ti` (np. 30 s), dobierz `Kp`, potem skracaj `Ti`.',
			'Proces: wzmocnienie ok. 2,8 °C na 1 % mocy, stała czasowa 25 s, martwy czas 1,5 s. Reguła SIMC daje Kp ≈ 3 i Ti ≈ 12 s.',
			'`Heater := DoorClosed AND NOT OverTemp;`'
		],
		starter: () => ({
			version: 2,
			lesson: 'oven-pid',
			scenario: 'oven',
			language: 'st',
			st: ovenSt(10, 2, 'TRUE'),
			ladder: { version: 1, rungs: [] },
			circuit: { plc: { x: 300, y: 0 }, devices: [], wires: [] },
			symbols: [
				symbol('DoorClosed', 'I0.0', 'Wyłącznik drzwi (1 = zamknięte)'),
				symbol('OverTemp', 'I0.1', 'Termostat bezpieczeństwa > 280 °C'),
				symbol('Temperature', 'IW4', 'Termopara, °C × 10'),
				symbol('Heater', 'Q0.0', 'Stycznik grzałek'),
				symbol('HeaterPower', 'QW4', 'Moc grzałek 0 … 27648')
			],
			watch: ['Temperature', 'HeaterPower', 'Heater'].map((w) => watchEntry(w, undefined, true))
		}),
		solution: () => ({ version: 1, rungs: [] }),
		solutionSt: ovenSt(3, 12, 'DoorClosed AND NOT OverTemp'),
		tests: [
			{
				name: 'Dochodzi do 180 °C bez dużego przeregulowania',
				steps: [
					{ label: '60 s grzania', wait: 60_000, check: ovenNear(180, 3) },
					{
						label: 'przeregulowanie',
						wait: 0,
						check: ({ process }) => {
							const max = (process?.state() as OvenState).maxTemp;
							return max <= 188 ? null : `temperatura doszła do ${max.toFixed(1)} °C (max 188 °C)`;
						}
					},
					{ label: 'kolejne 20 s', wait: 20_000, check: ovenNear(180, 1.5) }
				]
			},
			{
				name: 'Zimny wsad: wraca do 180 °C',
				steps: [
					{ label: 'rozgrzanie', wait: 60_000 },
					{
						label: 'zimny wsad, 40 s',
						commands: [['load', true]],
						wait: 40_000,
						check: ovenNear(180, 1.5)
					}
				]
			},
			{
				name: 'Otwarte drzwi wyłączają grzanie',
				steps: [
					{ label: 'grzanie', wait: 5000, expect: { 'Q0.0': true } },
					{
						label: 'otwórz drzwi',
						commands: [['door', true]],
						wait: 100,
						expect: { 'Q0.0': false }
					},
					{
						label: 'zamknij drzwi',
						commands: [['door', false]],
						wait: 100,
						expect: { 'Q0.0': true }
					}
				]
			}
		]
	},
	/* ---------- fieldbus ---------- */
	{
		slug: 'remote-pump',
		title: 'Sieć: pompa w zdalnej stacji i watchdog',
		level: 'process',
		scenario: 'remote',
		summary:
			'Pompa jest za siecią. Wykryj utratę komunikacji licznikiem życia i przejdź w stan bezpieczny.',
		instructions: [
			'Pompa stoi w odległej pompowni i jest podłączona do zdalnej stacji I/O na sieci (Profinet / Modbus TCP). Jej sygnały są w obrazie procesu: `RunCmd` (`Q2.0`) to rozkaz, `PumpRunning` (`I2.0`) — status. `Start` (`I0.0`) / `Stop` (`I0.1`, NC) z podtrzymaniem w `Run` (`M0.0`) już działają.',
			'Problem: gdy kabel zostanie przerwany, sterownik **dalej widzi ostatnie dane** — `PumpRunning` = 1, choć pompa stanęła. Sprawdź to w widoku Process („✂ Przerwij kabel”).',
			'Stacja co 100 ms zwiększa licznik `Heartbeat` (`IW6`). Zapamiętuj go w `LastBeat` (`MW20`). Jeśli przez **500 ms** się nie zmienił, ustaw `CommFault` (`M0.1`): zapal `CommLamp`, zdejmij `RunCmd` i skasuj `Run` — po powrocie sieci pompa ma czekać na nowy Start.',
			'Lampka `PumpLamp` (praca pompy) może świecić tylko wtedy, gdy dane są świeże.'
		],
		hints: [
			'Najpierw porównanie z poprzednim cyklem, potem zapamiętanie: `[Heartbeat == LastBeat] → TON T0 T#500ms → (CommFault)`, a niżej `MOVE Heartbeat → LastBeat` (z dowolną cewką, np. `BeatCopied`).',
			'W networku `Run` dodaj `┤/CommFault├` szeregowo — to kasuje podtrzymanie. `RunCmd` sterowany z `Run`, `PumpLamp` z `┤PumpRunning├ ┤/CommFault├`.'
		],
		starter: starter(
			'remote-pump',
			[
				['pushbutton', 'Start', 'I0.0', { color: 'green' }],
				['pushbutton', 'Stop', 'I0.1', { color: 'red', nc: true }],
				['lamp', 'CommLamp', 'Q0.0', { color: 'red' }],
				['lamp', 'PumpLamp', 'Q0.1', { color: 'green' }]
			],
			{
				scenario: 'remote',
				symbols: [
					...(plantInfo('remote')?.io ?? []).map((io) => symbol(io.name, io.address, io.comment)),
					symbol('Run', 'M0.0', 'Pompa włączona (podtrzymanie)'),
					symbol('CommFault', 'M0.1', 'Brak komunikacji ze stacją'),
					symbol('BeatCopied', 'M0.2', 'Licznik zapamiętany'),
					symbol('LastBeat', 'MW20', 'Licznik życia z poprzedniego cyklu')
				],
				watch: ['Heartbeat', 'LastBeat', 'CommFault', 'Run', 'RunCmd', 'PumpRunning'],
				ladder: program(
					rung(
						[parallel([[contact('NO', 'Start')], [contact('NO', 'Run')]]), contact('NO', 'Stop')],
						[coil('COIL', 'Run')],
						'Pompa: Start / Stop z podtrzymaniem'
					),
					rung([contact('NO', 'Run')], [coil('COIL', 'RunCmd')], 'Rozkaz do stacji zdalnej'),
					rung([contact('NO', 'PumpRunning')], [coil('COIL', 'PumpLamp')], 'Lampka: pompa pracuje')
				)
			}
		),
		solution: () =>
			program(
				rung(
					[compare('==', 'Heartbeat', 'LastBeat'), timer('TON', 'T0', 'T#500ms')],
					[coil('COIL', 'CommFault')],
					'Watchdog: licznik życia stoi 500 ms = brak komunikacji'
				),
				rung(
					[moveBox('Heartbeat', 'LastBeat')],
					[coil('COIL', 'BeatCopied')],
					'Zapamiętaj licznik'
				),
				rung(
					[
						parallel([[contact('NO', 'Start')], [contact('NO', 'Run')]]),
						contact('NO', 'Stop'),
						contact('NC', 'CommFault')
					],
					[coil('COIL', 'Run')],
					'Pompa: Start / Stop, brak sieci kasuje podtrzymanie'
				),
				rung([contact('NO', 'Run')], [coil('COIL', 'RunCmd')], 'Rozkaz do stacji zdalnej'),
				rung([contact('NO', 'CommFault')], [coil('COIL', 'CommLamp')], 'Lampka: brak komunikacji'),
				rung(
					[contact('NO', 'PumpRunning'), contact('NC', 'CommFault')],
					[coil('COIL', 'PumpLamp')],
					'Lampka: pompa pracuje (tylko ze świeżych danych)'
				)
			),
		tests: [
			{
				name: 'Start uruchamia pompę w stacji',
				steps: [
					settle('Stop puszczony', { 'I0.1': true }, { 'Q2.0': false }),
					{ label: 'Start', set: { 'I0.0': true }, wait: 100 },
					{
						label: 'puść Start, 1 s',
						set: { 'I0.0': false },
						wait: 1000,
						expect: { 'Q2.0': true, 'Q0.1': true, 'Q0.0': false }
					}
				]
			},
			{
				name: 'Zerwany kabel: alarm i stan bezpieczny, po naprawie czeka na Start',
				steps: [
					{ label: 'Start', set: { 'I0.1': true, 'I0.0': true }, wait: 100 },
					{ label: 'praca', set: { 'I0.0': false }, wait: 1000 },
					{
						label: 'przerwany kabel, 800 ms',
						commands: [['link', false]],
						wait: 800,
						expect: { 'Q0.0': true, 'Q2.0': false, 'Q0.1': false }
					},
					{
						label: 'kabel naprawiony, 500 ms',
						commands: [['link', true]],
						wait: 500,
						expect: { 'Q0.0': false, 'Q2.0': false }
					},
					{ label: 'Start ponownie', set: { 'I0.0': true }, wait: 100 },
					{
						label: 'puść Start, 1 s',
						set: { 'I0.0': false },
						wait: 1000,
						expect: { 'Q2.0': true, 'Q0.1': true }
					}
				]
			},
			{
				name: 'W normalnej pracy nie ma fałszywych alarmów',
				steps: [
					{ label: 'Start', set: { 'I0.1': true, 'I0.0': true }, wait: 100 },
					{
						label: '10 s pracy',
						set: { 'I0.0': false },
						wait: 10_000,
						expect: { 'Q0.0': false, 'Q2.0': true }
					}
				]
			}
		]
	},
	{
		slug: 'two-hand-press',
		title: 'Bezpieczeństwo: sterowanie oburęczne prasy',
		level: 'logic',
		summary:
			'Obie ręce w ciągu 0,5 s, puszczenie którejkolwiek zatrzymuje, nowy cykl po puszczeniu obu.',
		instructions: [
			'Prasa `Press` (`Q0.0`) jest sterowana przyciskami `Left` (`I0.0`) i `Right` (`I0.1`). Zwykłe AND (lekcja „AND i OR”) da się oszukać: jeden przycisk przyklejony taśmą i prasę uruchamia jedna ręka.',
			'Zasady typu III (PN-EN ISO 13851): prasa pracuje tylko, gdy oba przyciski są wciśnięte **i zostały wciśnięte w ciągu 0,5 s** od siebie. Puszczenie któregokolwiek zatrzymuje prasę. Nowy cykl jest możliwy dopiero po **puszczeniu obu**.',
			'Użyj markera blokady `Blocked` (`M0.0`): ustawiaj go, gdy tylko jeden przycisk jest wciśnięty dłużej niż 0,5 s albo gdy w trakcie pracy puszczono jeden przycisk; kasuj, gdy oba są puszczone. `WasPressing` (`M0.1`) zapamiętuje, że prasa pracowała w poprzednim cyklu.',
			'W prawdziwej maszynie tę logikę realizuje przekaźnik bezpieczeństwa z funkcją oburęczną — tu uczysz się, jak on działa.'
		],
		hints: [
			'„Tylko jeden”: gałęzie `┤Left├┤/Right├` ⑂ `┤/Left├┤Right├` → `TON T0 T#500ms` → `(S Blocked)`.',
			'`┤WasPressing├ (┤/Left├ ⑂ ┤/Right├)` → `(S Blocked)`; `┤/Left├ ┤/Right├` → `(R Blocked)`.',
			'`┤Left├ ┤Right├ ┤/Blocked├` → `(Press)` i `(WasPressing)` — dwie cewki w jednym networku.'
		],
		starter: starter(
			'two-hand-press',
			[
				['pushbutton', 'Left', 'I0.0', { color: 'green' }],
				['pushbutton', 'Right', 'I0.1', { color: 'green' }],
				['motor', 'Press', 'Q0.0']
			],
			{
				symbols: [
					symbol('Blocked', 'M0.0', 'Blokada: trzeba puścić oba przyciski'),
					symbol('WasPressing', 'M0.1', 'Prasa pracowała w poprzednim cyklu')
				],
				watch: ['Left', 'Right', 'Blocked', 'Press'],
				ladder: program(
					rung(
						[contact('NO', 'Left'), contact('NO', 'Right')],
						[coil('COIL', 'Press')],
						'Prasa: obie ręce (zwykłe AND)'
					)
				)
			}
		),
		solution: () =>
			program(
				rung(
					[
						parallel([
							[contact('NO', 'Left'), contact('NC', 'Right')],
							[contact('NC', 'Left'), contact('NO', 'Right')]
						]),
						timer('TON', 'T0', 'T#500ms')
					],
					[coil('SET', 'Blocked')],
					'Tylko jedna ręka dłużej niż 0,5 s'
				),
				rung(
					[
						contact('NO', 'WasPressing'),
						parallel([[contact('NC', 'Left')], [contact('NC', 'Right')]])
					],
					[coil('SET', 'Blocked')],
					'Puszczono jedną rękę w trakcie pracy'
				),
				rung(
					[contact('NC', 'Left'), contact('NC', 'Right')],
					[coil('RESET', 'Blocked')],
					'Obie puszczone: nowy cykl'
				),
				rung(
					[contact('NO', 'Left'), contact('NO', 'Right'), contact('NC', 'Blocked')],
					[coil('COIL', 'Press'), coil('COIL', 'WasPressing')],
					'Prasa'
				)
			),
		tests: [
			{
				name: 'Obie ręce razem uruchamiają prasę',
				steps: [
					{ label: 'Left', set: { 'I0.0': true }, wait: 200 },
					{ label: 'Right po 0,2 s', set: { 'I0.1': true }, wait: 100, expect: { 'Q0.0': true } },
					{
						label: 'puść obie',
						set: { 'I0.0': false, 'I0.1': false },
						wait: 100,
						expect: { 'Q0.0': false }
					}
				]
			},
			{
				name: 'Za późno druga ręka — nie rusza, dopóki nie puścisz obu',
				steps: [
					{ label: 'Left', set: { 'I0.0': true }, wait: 800 },
					{ label: 'Right po 0,8 s', set: { 'I0.1': true }, wait: 300, expect: { 'Q0.0': false } },
					{ label: 'puść obie', set: { 'I0.0': false, 'I0.1': false }, wait: 100 },
					{
						label: 'obie razem',
						set: { 'I0.0': true, 'I0.1': true },
						wait: 100,
						expect: { 'Q0.0': true }
					}
				]
			},
			{
				name: 'Puszczenie jednej zatrzymuje, ponowne wciśnięcie jej nie wznawia',
				steps: [
					{
						label: 'obie',
						set: { 'I0.0': true, 'I0.1': true },
						wait: 100,
						expect: { 'Q0.0': true }
					},
					{ label: 'puść Right', set: { 'I0.1': false }, wait: 100, expect: { 'Q0.0': false } },
					{
						label: 'Right znowu (Left cały czas)',
						set: { 'I0.1': true },
						wait: 300,
						expect: { 'Q0.0': false }
					},
					{ label: 'puść obie', set: { 'I0.0': false, 'I0.1': false }, wait: 100 },
					{
						label: 'obie razem',
						set: { 'I0.0': true, 'I0.1': true },
						wait: 100,
						expect: { 'Q0.0': true }
					}
				]
			},
			{
				name: 'Jedna ręka (druga „przyklejona”) nie uruchomi prasy',
				steps: [
					{ label: 'Right przyklejony', set: { 'I0.1': true }, wait: 2000 },
					{ label: 'Left', set: { 'I0.0': true }, wait: 300, expect: { 'Q0.0': false } }
				]
			}
		]
	},
	{
		slug: 'drive-profidrive',
		title: 'Falownik na Profinecie: słowo sterujące',
		level: 'process',
		scenario: 'drive',
		summary:
			'Sterujesz napędem jak SINAMICS: 047E, 047F, prędkość 16#4000, status z ZSW1 i kwitowanie błędu.',
		instructions: [
			'Napęd jest podłączony **przez sieć** (telegram 1): piszesz `STW1` (`QW4`) i `NSOLL_A` (`QW6`), czytasz `ZSW1` (`IW4`) i `NIST_A` (`IW6`). Program jest w **Structured Text**. Widok Process pokazuje stan napędu i bity obu słów.',
			'**Objaw:** po Start napęd nie rusza i stoi w „S1 · Blokada załączenia”. Napęd PROFIdrive wymaga sekwencji: najpierw `16#047E` (gotowy, OFF1), dopiero potem `16#047F` (ON). Gdy `Run` = 0, wysyłaj `16#047E` — to też jest zatrzymanie rampą.',
			'Prędkość: `Fast` (`I0.3`) = 100 % = `16#4000` (50 Hz), inaczej 50 % = `16#2000`.',
			'Status z napędu, nie z programu: `LampRun` gdy w `ZSW1` jest bit 2 (praca, maska `16#0004`), `LampFault` gdy bit 3 (błąd, `16#0008`). Błąd ma kasować `Run`, a przycisk `Ack` (`I0.2`) — dodawać do słowa bit 7 (`STW1 OR 16#0080`).'
		],
		hints: [
			'`IF Run THEN STW1 := 16#047F; ELSE STW1 := 16#047E; END_IF;`',
			'`Fault := (ZSW1 AND 16#0008) <> 0;` — liczysz to przed podtrzymaniem i dopisujesz `AND NOT Fault`.',
			'`IF Ack THEN STW1 := STW1 OR 16#0080; END_IF;` — kwitowanie działa na zboczu bitu 7.'
		],
		starter: () => ({
			version: 2,
			lesson: 'drive-profidrive',
			scenario: 'drive',
			language: 'st',
			st: DRIVE_ST_STARTER,
			ladder: { version: 1, rungs: [] },
			circuit: circuitOf([
				['pushbutton', 'Start', 'I0.0', { color: 'green' }],
				['pushbutton', 'Stop', 'I0.1', { color: 'red', nc: true }],
				['pushbutton', 'Ack', 'I0.2', { color: 'blue' }],
				['switch', 'Fast', 'I0.3'],
				['lamp', 'LampRun', 'Q0.0', { color: 'green' }],
				['lamp', 'LampFault', 'Q0.1', { color: 'red' }]
			]),
			symbols: (plantInfo('drive')?.io ?? []).map((io) => symbol(io.name, io.address, io.comment)),
			watch: [
				watchEntry('STW1', 'HEX', true),
				watchEntry('ZSW1', 'HEX', true),
				watchEntry('NSOLL_A', 'DEC', true),
				watchEntry('NIST_A', 'DEC', true)
			]
		}),
		solution: () => ({ version: 1, rungs: [] }),
		solutionSt: DRIVE_ST_SOLUTION,
		tests: [
			{
				name: 'Start: sekwencja 047E → 047F, napęd kręci 25 Hz',
				steps: [
					{ label: 'Stop puszczony', set: { 'I0.1': true }, wait: 200 },
					{ label: 'Start', set: { 'I0.0': true }, wait: 100 },
					{
						label: 'puść Start, 3 s',
						set: { 'I0.0': false },
						wait: 3000,
						check: driveAt('S4', 25),
						expect: { 'Q0.0': true }
					}
				]
			},
			{
				name: 'Fast: 100 % = 50 Hz, Stop: rampą do zera i gotowość',
				steps: [
					{ label: 'Stop puszczony', set: { 'I0.1': true }, wait: 200 },
					{ label: 'start', set: { 'I0.0': true }, wait: 100 },
					{
						label: 'Fast, 4 s',
						set: { 'I0.0': false, 'I0.3': true },
						wait: 4000,
						check: driveAt('S4', 50)
					},
					{
						label: 'Stop, 4 s',
						set: { 'I0.1': false },
						wait: 4000,
						check: driveAt('S2', 0),
						expect: { 'Q0.0': false }
					}
				]
			},
			{
				name: 'Błąd napędu: lampka, kwitowanie i ponowny start',
				steps: [
					{ label: 'Stop puszczony', set: { 'I0.1': true }, wait: 200 },
					{ label: 'start', set: { 'I0.0': true }, wait: 100 },
					{ label: 'praca', set: { 'I0.0': false }, wait: 2000 },
					{
						label: 'błąd napędu',
						commands: [['fault', true]],
						wait: 2000,
						expect: { 'Q0.1': true, 'Q0.0': false }
					},
					{ label: 'Ack', set: { 'I0.2': true }, wait: 200 },
					{ label: 'puść Ack', set: { 'I0.2': false }, wait: 200, expect: { 'Q0.1': false } },
					{ label: 'Start', set: { 'I0.0': true }, wait: 100 },
					{ label: 'puść Start, 3 s', set: { 'I0.0': false }, wait: 3000, check: driveAt('S4', 25) }
				]
			}
		]
	},
	/* ---------- SFC ---------- */
	{
		slug: 'sfc-drilling',
		title: 'SFC: stacja wiercenia krokami',
		level: 'process',
		scenario: 'line',
		summary: 'Ta sama stacja wiercenia, ale jako diagram SFC / GRAFCET: kroki, akcje i przejścia.',
		instructions: [
			'Program jest w języku **SFC** (przełącznik języka nad programem). Logika stała (Start/Stop, taśma, spychacz) jest już gotowa pod diagramem — zajmujesz się tylko **cyklem wiercenia**.',
			'Kroki `Wait` (czeka na detal, zatrzymywacz wysunięty) i `Drill` (wiertło w dół, wrzeciono) już są. Dokończ cykl krokami: `Dwell` (wiercenie jeszcze 1,2 s na dole), `Raise` (wiertło do góry), `Release` (zatrzymywacz schowany 0,6 s) i `Leave` (czekaj, aż detal odjedzie).',
			'Akcja **N** jest aktywna tylko w swoim kroku, więc `Stopper` dodaj w każdym kroku poza `Release`. Warunki przejść to wyrażenia ST; `Dwell.T` to czas, od kiedy krok `Dwell` jest aktywny, np. `Dwell.T >= T#1200ms`.',
			'Ostatnie przejście `Leave → Wait` zamyka pętlę: maszyna wraca do czekania na następny detal.'
		],
		hints: [
			'`Drill → Dwell`: `DrillBottom`. `Dwell` ma akcje N `DrillLower`, N `Spindle`, N `Stopper`.',
			'`Dwell → Raise`: `Dwell.T >= T#1200ms`. `Raise` (tylko N `Stopper`) → `Release` przy `DrillTop`.',
			'`Release` (bez akcji!) → `Leave` przy `Release.T >= T#600ms`; `Leave` (N `Stopper`) → `Wait` przy `NOT PartAtDrill`.'
		],
		starter: () => ({
			version: 2,
			lesson: 'sfc-drilling',
			scenario: 'line',
			language: 'sfc',
			sfc: drillingSfc(false),
			ladder: { version: 1, rungs: [] },
			circuit: circuitOf([
				['pushbutton', 'Start', 'I1.0', { color: 'green' }],
				['pushbutton', 'Stop', 'I1.1', { color: 'red', nc: true }]
			]),
			symbols: [
				...(plantInfo('line')?.io ?? []).map((io) => symbol(io.name, io.address, io.comment)),
				symbol('Run', 'M1.0', 'Linia włączona')
			],
			watch: ['Run', 'PartAtDrill', 'DrillBottom', 'DrillTop', 'Stopper'].map((w) =>
				watchEntry(w, undefined, true)
			)
		}),
		solution: () => ({ version: 1, rungs: [] }),
		solutionSfc: () => drillingSfc(true),
		// the same machine and the same acceptance tests as the ladder version
		tests: []
	}
];

// the SFC drilling station is accepted by the same tests as the ladder one
LESSONS.find((l) => l.slug === 'sfc-drilling')!.tests = LESSONS.find(
	(l) => l.slug === 'drilling-station'
)!.tests;

export const getLesson = (slug: string) => LESSONS.find((l) => l.slug === slug) ?? null;

export const LESSON_PREFIX = 'lesson-';
export const lessonProjectId = (slug: string) => `${LESSON_PREFIX}${slug}`;
