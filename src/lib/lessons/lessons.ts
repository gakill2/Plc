import { sfcStep, sfcTransition, type Sfc } from '#lib/sfc/sfc.js';
import { widget } from '#lib/hmi/model.js';
import { parseAddress } from '#lib/engine/index.js';
import { box as fbdBox, fbdNetwork, operand } from '#lib/fbd/fbd.js';
import { device, DEVICES, type Circuit, type Device, type DeviceType } from '#lib/circuit/model.js';
import {
	blockBox,
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
	MixerState,
	PneumaticState,
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

const FILTER_HEAD = `(* Nadzór temperatury pieca.
   Temperature (IW4) = °C × 10. Czujnik łapie zakłócenia: pojedyncze próbki skaczą.
   Avg (MW20) = średnia z 10 próbek, AlarmCount (MW22) = ile razy był alarm. *)
VAR
  buf : ARRAY[0..9] OF INT;     // 10 ostatnich próbek
  pos : INT;                    // gdzie wpisać następną
  i : INT;
  sum : DINT;
  alarm : BOOL;
  edge : R_TRIG;
END_VAR
`;

const FILTER_MAIN = `
// OB1: grzanie przełącznikiem HeatOn, alarm je blokuje
Heater := HeatOn AND DoorClosed AND NOT OverTemp AND NOT alarm;
HeaterPower := 27648;
OverheatLamp := alarm;
AlarmCount := alarms;
`;

const FILTER_STARTER = `${FILTER_HEAD}VAR RETAIN
  // TODO: licznik alarmów, który przeżyje Stop → Run
END_VAR
VAR
  alarms : INT;
END_VAR
${FILTER_MAIN}
CYCLIC_INTERRUPT T#100ms
  // TODO: zapisz próbkę Temperature do buf[pos], przesuń pos (0 … 9, potem znowu 0)
  // TODO: Avg := suma buf / 10
  // TODO: alarm, gdy Avg > 2500 (250 °C); zgaś, gdy Avg < 2300
  // TODO: zbocze narastające alarmu zwiększa alarms
END_CYCLIC_INTERRUPT
`;

const FILTER_SOLUTION = `${FILTER_HEAD}VAR RETAIN
  alarms : INT;                 // przeżywa Stop → Run
END_VAR
${FILTER_MAIN}
CYCLIC_INTERRUPT T#100ms
  // stała próbka co 100 ms, niezależnie od czasu cyklu OB1
  buf[pos] := Temperature;
  pos := pos + 1;
  IF pos > 9 THEN
    pos := 0;
  END_IF;
  sum := 0;
  FOR i := 0 TO 9 DO
    sum := sum + buf[i];
  END_FOR;
  Avg := DINT_TO_INT(sum / 10);
  IF Avg > 2500 THEN
    alarm := TRUE;
  ELSIF Avg < 2300 THEN
    alarm := FALSE;
  END_IF;
  edge(CLK := alarm);
  IF edge.Q THEN
    alarms := alarms + 1;
  END_IF;
END_CYCLIC_INTERRUPT
`;

const RECIPE_HEAD = `(* Receptury pieca: operator wybiera numer 1 … 3 na panelu (RecipeNo, MW10).
   Setpoint (MW12) = temperatura zadana z receptury, °C × 10. *)
VAR
  temps : ARRAY[1..3] OF INT := [1800, 2000, 2200];
END_VAR
`;
const RECIPE_STARTER = `${RECIPE_HEAD}
Setpoint := temps[RecipeNo];
`;
const RECIPE_SOLUTION = `${RECIPE_HEAD}
// sprawdź dane z panelu, zanim użyjesz ich jako indeksu
IF RecipeNo >= 1 AND RecipeNo <= 3 THEN
  Setpoint := temps[RecipeNo];
  BadRecipe := FALSE;
ELSE
  BadRecipe := TRUE;                  // zła wartość: zostaw poprzednią temperaturę
END_IF;

// siatka bezpieczeństwa: każdy błąd programowania zapala lampkę zamiast zatrzymać CPU
ORGANIZATION_BLOCK OB121
  BadRecipe := TRUE;
END_ORGANIZATION_BLOCK
`;
const setpointIs =
	(v: number): Check =>
	({ plc }) => {
		const s = plc.memory.readNumber(parseAddress('MW12'));
		return s === v ? null : `Setpoint (MW12) = ${s}, a powinno być ${v}`;
	};

/* ---------- pneumatic press and batch mixer ---------- */

const PRESS_HEAD = `(* Prasa: docisk A (Clamp, Q0.0) i prasa B (Press, Q0.1), zawory 5/2 monostabilne.
   Sekwencja A+ B+ B− A−. Krok: 0 czeka, 10 A+, 20 B+, 30 B−, 40 A−, 99 błąd. *)
VAR
  step : INT;
  lastStep : INT;
  moveTime : TON;
  startEdge : R_TRIG;
END_VAR
startEdge(CLK := Start);
`;

const PRESS_STARTER = `${PRESS_HEAD}
// TODO: nadzór ruchu — każdy krok 10 … 40 ma najwyżej 2 s, brak powietrza w cyklu = błąd (krok 99)

CASE step OF
  0:  IF startEdge.Q AND PartPresent AND AirOk AND A_Retracted AND B_Retracted THEN
        step := 10;
      END_IF;
  10: IF A_Extended THEN step := 20; END_IF;
  // TODO: 20 B+, 30 B−, 40 A−, 99 błąd (Ack i powietrze → 30)
END_CASE;

Clamp := step = 10 OR step = 20;
Press := step = 20;
Alarm := FALSE;
`;

const PRESS_SOLUTION = `${PRESS_HEAD}
// nadzór ruchu: licznik czasu startuje od nowa w każdym kroku
moveTime(IN := step >= 10 AND step <= 40 AND step = lastStep, PT := T#2s);
lastStep := step;
IF step >= 10 AND step <= 40 AND (moveTime.Q OR NOT AirOk) THEN
  step := 99;
END_IF;

CASE step OF
  0:  IF (startEdge.Q OR Auto) AND PartPresent AND AirOk AND A_Retracted AND B_Retracted THEN
        step := 10;
      END_IF;
  10: IF A_Extended THEN step := 20; END_IF;    // detal dociśnięty
  20: IF B_Extended THEN step := 30; END_IF;    // wytłoczony
  30: IF B_Retracted THEN step := 40; END_IF;   // prasa w górze
  40: IF A_Retracted THEN step := 0; END_IF;    // docisk zwolniony
  99: IF Ack AND AirOk THEN step := 30; END_IF; // po kwitowaniu: prasa w górę, potem docisk
END_CASE;

// docisk trzyma, dopóki prasa nie wróci — także w błędzie
Clamp := step = 10 OR step = 20 OR step = 30 OR (step = 99 AND Clamp);
Press := step = 20;
Alarm := step = 99;
`;

const pressCounts =
	(good: number, atLeast = false): Check =>
	({ process }) => {
		const s = process?.state() as PneumaticState;
		if (s.scrap) return `${s.scrap} detal(e) zniszczone — ${s.lastFault ?? ''}`;
		if (s.emptyStrokes) return 'pusty skok prasy — brak detalu';
		const ok = atLeast ? s.good >= good : s.good === good;
		return ok
			? null
			: `dobrych detali: ${s.good}, a powinno być ${atLeast ? 'co najmniej ' : ''}${good}`;
	};

const L40 = 11059;
const L80 = 22118;

function mixerSfc(full: boolean): Sfc {
	const steps = [
		sfcStep('Idle', true),
		sfcStep('FillA', false, [['N', 'ValveA']]),
		sfcStep('FillB', false, [['N', 'ValveB']])
	];
	const transitions = [
		sfcTransition('Idle', 'FillA', 'Start AND NOT Alarm'),
		sfcTransition('FillA', 'FillB', `Level >= ${L40}`)
	];
	if (full) {
		steps.push(
			sfcStep('Heat', false, [
				['N', 'Stirrer'],
				['N', 'Heater']
			]),
			sfcStep('Mix', false, [['N', 'Stirrer']]),
			sfcStep('Drain', false, [['N', 'Outlet']])
		);
		transitions.push(
			sfcTransition('FillB', 'Heat', `Level >= ${L80}`),
			sfcTransition('Heat', 'Mix', 'Temperature >= 500'),
			sfcTransition('Mix', 'Drain', 'Mix.T >= T#5s'),
			sfcTransition('Drain', 'Idle', 'Level <= 276')
		);
	}
	return {
		steps,
		transitions,
		logic: full
			? `// 32767 = przepełnienie / zerwany przewód 4–20 mA: pomiar nie jest wiarygodny
IF Level >= 32767 OR NOT LevelOk THEN
  Alarm := TRUE;
END_IF;
IF Ack AND Level < 32767 AND LevelOk THEN
  Alarm := FALSE;
END_IF;
// blokady mają pierwszeństwo przed diagramem
IF Alarm THEN
  ValveA := FALSE;
  ValveB := FALSE;
  Heater := FALSE;
END_IF;
IF Level < 4147 THEN
  Heater := FALSE;                 // grzałka tylko zanurzona (> 15 %)
END_IF;`
			: '// TODO: alarm przy złym pomiarze poziomu i blokady (logika stała działa po diagramie)'
	};
}

const mixerOk =
	(good: number): Check =>
	({ process }) => {
		const s = process?.state() as MixerState;
		if (s.overflows) return 'zbiornik się przelał';
		if (s.dryHeating) return 'grzałka pracowała na sucho';
		if (s.bad) return s.lastBatch ?? 'zła partia';
		return s.good >= good ? null : `dobrych partii: ${s.good}, a powinno być ${good}`;
	};

/* ---------- device standard: one motor block for the whole plant ---------- */

const STD_INTERFACE = `FUNCTION_BLOCK MotorStd
(* Standardowy blok silnika. Taki sam dla każdej pompy, taśmy i wentylatora w zakładzie. *)
VAR_INPUT
  AutoCmd : BOOL;    // żądanie pracy z sekwencji (tryb Auto)
  ManMode : BOOL;    // 1 = tryb ręczny (z panelu)
  ManStart : BOOL;   // Start z panelu w trybie ręcznym
  ManStop : BOOL;    // Stop z panelu w trybie ręcznym
  Permit : BOOL;     // permisywy: warunki potrzebne do STARTU
  Interlock : BOOL;  // blokada: 1 = zatrzymaj natychmiast, w każdym trybie
  Feedback : BOOL;   // styk pomocniczy stycznika
  Ack : BOOL;        // kwitowanie alarmu
END_VAR
VAR_OUTPUT
  Run : BOOL;        // rozkaz do stycznika
  Running : BOOL;    // praca potwierdzona stykiem zwrotnym
  Fault : BOOL;      // alarm: brak potwierdzenia w 2 s
  Ready : BOOL;      // można uruchomić
END_VAR
VAR
  manOn : BOOL;
  fbTimer : TON;
END_VAR
`;

const STD_BODY = `// alarm kasuje się kwitowaniem, gdy silnik stoi
IF Ack AND NOT Run THEN
  Fault := FALSE;
END_IF;
Ready := Permit AND NOT Interlock AND NOT Fault;

// tryb ręczny: zatrzask z przycisków panelu (start tylko, gdy Ready)
IF NOT ManMode OR ManStop OR Interlock OR Fault THEN
  manOn := FALSE;
ELSIF ManStart AND Ready THEN
  manOn := TRUE;
END_IF;

// permisywy potrzebne do startu, nie do pracy; blokada i alarm zatrzymują zawsze
IF Interlock OR Fault THEN
  Run := FALSE;
ELSIF ManMode THEN
  Run := manOn;
ELSIF AutoCmd THEN
  Run := Run OR Ready;
ELSE
  Run := FALSE;
END_IF;

// nadzór potwierdzenia: stycznik musi zgłosić pracę w 2 s
fbTimer(IN := Run AND NOT Feedback, PT := T#2s);
IF fbTimer.Q THEN
  Fault := TRUE;
  Run := FALSE;
END_IF;
Running := Run AND Feedback;
END_FUNCTION_BLOCK
`;

const STD_PUMP_MAIN = `
(* Pompa P1. Permisyw: woda w zbiorniku ssawnym. Blokada: za wysokie ciśnienie. *)
VAR
  p1 : MotorStd;
END_VAR
p1(AutoCmd := AutoRequest, ManMode := ManMode, ManStart := ManStart, ManStop := ManStop,
   Permit := LevelOk, Interlock := PressureHigh, Feedback := FbK1, Ack := Ack,
   Run => K1, Running => H_Run, Fault => H_Fault);
`;

const STD_PUMP_STARTER = `${STD_INTERFACE}
// TODO: alarm i kwitowanie, Ready, tryb ręczny, rozkaz Run (permisywy tylko do startu!),
//       nadzór potwierdzenia 2 s
Run := AutoCmd;
Running := Run AND Feedback;
END_FUNCTION_BLOCK
${STD_PUMP_MAIN}`;

const STD_PUMP_SOLUTION = `${STD_INTERFACE}${STD_BODY}${STD_PUMP_MAIN}`;

const STD_LINE_MAIN_HEAD = `
(* Ciąg trzech taśm: materiał płynie C1 → C2 → C3. Start i Stop całej linii. *)
VAR
  c1, c2, c3 : MotorStd;
  lineOn : BOOL;
END_VAR
lineOn := (Start OR lineOn) AND Stop;
`;

const STD_LINE_STARTER = `${STD_INTERFACE}${STD_BODY}${STD_LINE_MAIN_HEAD}
// TODO: trzy instancje — najpierw C3 (odbierająca), potem C2 i C1.
//       Permisyw taśmy = taśma za nią pracuje. Blokada = pracuję, a taśma za mną stanęła.
c1(AutoCmd := lineOn, Permit := TRUE, Feedback := Fb1, Ack := Ack, Run => K1);
FaultLamp := c1.Fault;
`;

const STD_LINE_SOLUTION = `${STD_INTERFACE}${STD_BODY}${STD_LINE_MAIN_HEAD}
// od końca linii: najpierw taśma odbierająca, inaczej materiał spadnie na stojącą taśmę
c3(AutoCmd := lineOn, Permit := TRUE, Feedback := Fb3, Ack := Ack, Run => K3);
c2(AutoCmd := lineOn, Permit := c3.Running, Interlock := c2.Run AND NOT c3.Running,
   Feedback := Fb2, Ack := Ack, Run => K2);
c1(AutoCmd := lineOn, Permit := c2.Running, Interlock := c1.Run AND NOT c2.Running,
   Feedback := Fb1, Ack := Ack, Run => K1);
FaultLamp := c1.Fault OR c2.Fault OR c3.Fault;
`;

/* ---------- capstone: the MX2 mixer from a functional description ---------- */

const CAPSTONE_STARTER = `(* Mieszalnik MX2 — projekt końcowy.
   Wymagania: opis funkcjonalny w panelu lekcji (W1 … W8).
   Sygnały obiektu i panelu są już w tablicy symboli. *)

// TODO: Twój program
`;

const CAPSTONE_SOLUTION = `(* Mieszalnik MX2 — sterowanie partią według opisu funkcjonalnego. *)
VAR RETAIN
  batches : INT;                  // W8: licznik partii przeżywa restart
END_VAR
VAR
  step : INT;                     // krok sekwencji
  run : BOOL;                     // partia w toku (Stop wstrzymuje)
  setA, setB : INT;               // progi poziomu z receptury
  startEdge : R_TRIG;
  heatTime : TON;
  mixTime : TON;
  measOk : BOOL;                  // pomiar poziomu wiarygodny
  alarmLevel, alarmHH, alarmHeat, alarmRecipe : BOOL;
  FULL : INT := 276;              // 1 % — zbiornik pusty
  DRY : INT := 4147;              // 15 % — grzałka zanurzona
  TARGET : INT := 500;            // 50,0 °C
END_VAR

startEdge(CLK := Start);

// W6: alarmy — zapamiętane do kwitowania
measOk := Level < 32767;        // 32767 = zerwany przewód 4–20 mA
IF NOT measOk THEN alarmLevel := TRUE; END_IF;
IF NOT LevelOk THEN alarmHH := TRUE; END_IF;
IF heatTime.Q THEN alarmHeat := TRUE; END_IF;
IF Ack THEN
  IF measOk THEN alarmLevel := FALSE; END_IF;
  IF LevelOk THEN alarmHH := FALSE; END_IF;
  alarmHeat := FALSE;
  alarmRecipe := FALSE;
END_IF;
Alarm := alarmLevel OR alarmHH OR alarmHeat OR alarmRecipe;
// bity alarmów dla panelu HMI
AlmLevel := alarmLevel;
AlmOverfill := alarmHH;
AlmHeating := alarmHeat;
AlmRecipe := alarmRecipe;

// W2: receptury z panelu
CASE RecipeNo OF
  1: setA := 11059; setB := 22118;    // 40 % A, do 80 % B
  2: setA := 8294;  setB := 16589;    // 30 % A, do 60 % B
ELSE
  setA := 0; setB := 0;               // zły numer
END_CASE;

// W3: Stop wstrzymuje, Start wznawia; W5: zła receptura nie startuje
IF NOT Stop OR Alarm THEN run := FALSE; END_IF;
IF startEdge.Q AND Stop AND NOT Alarm THEN
  IF step = 0 AND setA = 0 THEN
    alarmRecipe := TRUE;
  ELSE
    run := TRUE;
    IF step = 0 THEN step := 10; END_IF;
  END_IF;
END_IF;

// W1: sekwencja partii (krok 0 czeka, 10 dozuje A, 20 dozuje B, 30 grzeje, 40 miesza, 50 spust)
heatTime(IN := run AND step = 30, PT := T#120s);   // W7: grzanie za długo = alarm
mixTime(IN := run AND step = 40, PT := T#5s);
IF run THEN
  CASE step OF
    10: IF Level >= setA THEN step := 20; END_IF;          // krok: dozowanie A
    20: IF Level >= setB THEN step := 30; END_IF;          // krok: dozowanie B
    30: IF Temperature >= TARGET THEN step := 40; END_IF;  // krok: grzanie z mieszaniem
    40: IF mixTime.Q THEN step := 50; END_IF;              // krok: mieszanie
    50: IF Level <= FULL THEN                              // krok: spust
          step := 0;
          run := FALSE;
          batches := batches + 1;
        END_IF;
  END_CASE;
END_IF;

// wyjścia z kroku; W4: grzałka tylko zanurzona i przy dobrym pomiarze
ValveA := run AND step = 10;
ValveB := run AND step = 20;
Stirrer := run AND (step = 30 OR step = 40);
Heater := run AND step = 30 AND measOk AND Level >= DRY;
Outlet := run AND step = 50;
BatchCount := batches;
`;

const counted =
	(n: number): Check =>
	({ plc }) => {
		const c = plc.memory.readNumber(parseAddress('MW40'));
		return c === n ? null : `BatchCount (MW40) = ${c}, a powinno być ${n}`;
	};

/* ---------- STL / AWL: legacy S7-300 programs ---------- */

const STL_PUMP_HEAD = `// FC1 Pompa P1 — program z 2004 r., CPU 314
// autor: nieznany, ostatnia zmiana: 2011
`;

const STL_PUMP_STARTER = `${STL_PUMP_HEAD}
NETWORK 1 // pompa: start, podtrzymanie, stop
      A     "Start"
      O     "Pump"
      A     "Stop"
      =     "Pump"

NETWORK 2 // lampka pracy po 3 s
      A     "Pump"
      L     S5T#3S
      SD    T 1
      A     T 1
      =     "RunLamp"
`;

const STL_PUMP_SOLUTION = `${STL_PUMP_HEAD}
NETWORK 1 // pompa: start, podtrzymanie, stop
      A(                  // nawias: najpierw LUB (start albo podtrzymanie) …
      O     "Start"
      O     "Pump"
      )
      A     "Stop"        // … i dopiero potem I ze Stopem — Stop wygrywa zawsze
      =     "Pump"

NETWORK 2 // lampka pracy po 3 s
      A     "Pump"
      L     S5T#3S
      SD    T 1
      A     T 1
      =     "RunLamp"
`;

const STL_PRESS_HEAD = `// FC10 Prasa PR1 — Zakład Mechaniczny, 2009, CPU 315-2DP
// kroki: M10.1 A+, M10.2 B+, M10.3 B-, M10.4 A-
`;

const STL_PRESS_STARTER = `${STL_PRESS_HEAD}
NETWORK 1 // start cyklu
      A     I 1.0
      FP    M 0.0
      A     I 0.5
      A     I 0.0
      A     I 0.2
      AN    M 10.1
      AN    M 10.2
      AN    M 10.3
      AN    M 10.4
      S     M 10.1

NETWORK 2
      A     M 10.1
      A     I 0.1
      S     M 10.2
      R     M 10.1

NETWORK 3
      A     M 10.2
      A     I 0.3
      S     M 10.3
      R     M 10.2

NETWORK 4
      A     M 10.3
      A     I 0.2
      S     M 10.4
      R     M 10.3

NETWORK 5
      A     M 10.4
      A     I 0.0
      R     M 10.4

NETWORK 6 // zawory
      O     M 10.1
      O     M 10.2
      O     M 10.3
      =     Q 0.0
      A     M 10.2
      =     Q 0.1
`;

const STL_PRESS_SOLUTION = `${STL_PRESS_HEAD}
// ZM-17 (2026): praca ciągła z przełącznika Auto, licznik dobrych detali MW50

NETWORK 1 // zbocze przycisku Start
      A     I 1.0
      FP    M 0.0
      =     M 0.1

NETWORK 2 // start cyklu: Start albo Auto (ZM-17/1)
      A(
      O     M 0.1
      O     I 1.1          // ZM-17/1: Auto
      )
      A     I 0.4          // ZM-17/1: detal leży — dotąd pilnował tego operator
      A     I 0.5
      A     I 0.0
      A     I 0.2
      AN    M 10.1
      AN    M 10.2
      AN    M 10.3
      AN    M 10.4
      S     M 10.1

NETWORK 3
      A     M 10.1
      A     I 0.1
      S     M 10.2
      R     M 10.1

NETWORK 4
      A     M 10.2
      A     I 0.3
      S     M 10.3
      R     M 10.2

NETWORK 5
      A     M 10.3
      A     I 0.2
      S     M 10.4
      R     M 10.3

NETWORK 6 // koniec cyklu
      A     M 10.4
      A     I 0.0
      =     M 0.2          // ZM-17/2: impuls „detal gotowy”
      R     M 10.4

NETWORK 7 // ZM-17/2: licznik dobrych detali
      A     M 0.2
      JCN   m007
      L     MW 50
      L     1
      +I
      T     MW 50
m007: NOP   0

NETWORK 8 // zawory
      O     M 10.1
      O     M 10.2
      O     M 10.3
      =     Q 0.0
      A     M 10.2
      =     Q 0.1
`;

const partsCounted: Check = ({ plc, process }) => {
	const s = process?.state() as PneumaticState;
	const c = plc.memory.readNumber(parseAddress('MW50'));
	return c === s.good && c > 0 ? null : `MW50 = ${c}, a dobrych detali jest ${s.good}`;
};

/** The filtered value in MW20 is close to the real temperature. */
const avgNear =
	(tol: number): Check =>
	({ plc, process }) => {
		const avg = plc.memory.readNumber(parseAddress('MW20'));
		const t = (process?.state() as OvenState).temp * 10;
		return Math.abs(avg - t) <= tol
			? null
			: `Avg (MW20) = ${avg}, a temperatura to ${Math.round(t)} (°C × 10) — różnica ponad ${tol}`;
	};
const alarmCount =
	(n: number): Check =>
	({ plc }) => {
		const c = plc.memory.readNumber(parseAddress('MW22'));
		return c === n ? null : `AlarmCount (MW22) = ${c}, a powinno być ${n}`;
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

/* ---------- function block lesson ---------- */

const FB_MOTOR_HEAD = `(* Blok funkcyjny silnika z kontrolą styku zwrotnego stycznika.
   Każda instancja (m1, m2, m3) ma własne podtrzymanie, timer i błąd. *)
FUNCTION_BLOCK Motor
VAR_INPUT
  Start    : BOOL;   // przycisk Start
  Stop     : BOOL;   // przycisk Stop (NC: puszczony = TRUE)
  Feedback : BOOL;   // styk zwrotny stycznika
END_VAR
VAR_OUTPUT
  Run   : BOOL;      // cewka stycznika
  Fault : BOOL;      // brak potwierdzenia
END_VAR
VAR
  check : TON;
END_VAR
`;

const FB_MOTOR_STARTER = `${FB_MOTOR_HEAD}
Run := (Start OR Run) AND Stop;
// TODO: kontrola styku zwrotnego (1 s), Fault zatrzymuje silnik, Stop kasuje Fault
END_FUNCTION_BLOCK

VAR
  m1 : Motor;
END_VAR

m1(Start := Start1, Stop := Stop1, Feedback := Fb1, Run => K1, Fault => H1);
// TODO: m2 i m3 dla taśm 2 i 3
`;

const FB_MOTOR_SOLUTION = `${FB_MOTOR_HEAD}
IF NOT Stop THEN
  Fault := FALSE;                         // Stop kasuje błąd
END_IF;
Run := (Start OR Run) AND Stop AND NOT Fault;
check(IN := Run AND NOT Feedback, PT := T#1s);
IF check.Q THEN
  Fault := TRUE;                          // stycznik nie potwierdził w 1 s
  Run := FALSE;
END_IF;
END_FUNCTION_BLOCK

VAR
  m1 : Motor;
  m2 : Motor;
  m3 : Motor;
END_VAR

m1(Start := Start1, Stop := Stop1, Feedback := Fb1, Run => K1, Fault => H1);
m2(Start := Start2, Stop := Stop2, Feedback := Fb2, Run => K2, Fault => H2);
m3(Start := Start3, Stop := Stop3, Feedback := Fb3, Run => K3, Fault => H3);
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
	{
		slug: 'fb-motor',
		title: 'Blok funkcyjny: jeden silnik, trzy taśmy',
		level: 'process',
		summary:
			'Napisz FUNCTION_BLOCK silnika z kontrolą styku zwrotnego i użyj go w trzech instancjach.',
		instructions: [
			'Trzy taśmy mają identyczne sterowanie: Start, Stop (NC), stycznik `K` i jego styk zwrotny `Fb`. Zamiast kopiować kod trzy razy, piszesz go **raz** jako blok funkcyjny `Motor` i tworzysz trzy **instancje** — każda ma własną pamięć (podtrzymanie, timer, błąd).',
			'Interfejs bloku jest gotowy: wejścia `Start`, `Stop`, `Feedback`, wyjścia `Run`, `Fault`, zmienna wewnętrzna `check : TON`. Uzupełnij ciało: jeśli `Run` jest włączony, a `Feedback` nie przyszedł w ciągu **1 s** — ustaw `Fault` i zatrzymaj silnik. `Stop` kasuje błąd.',
			'W programie głównym dodaj instancje `m2` i `m3` i wywołaj je dla taśm 2 i 3 (`Start2`/`Stop2`/`Fb2` → `K2`, `H2` itd.), tak jak `m1`.'
		],
		hints: [
			'`check(IN := Run AND NOT Feedback, PT := T#1s);` a potem `IF check.Q THEN Fault := TRUE; END_IF;`',
			'`Run := (Start OR Run) AND Stop AND NOT Fault;` i `IF NOT Stop THEN Fault := FALSE; END_IF;`',
			'`m2(Start := Start2, Stop := Stop2, Feedback := Fb2, Run => K2, Fault => H2);`'
		],
		starter: () => ({
			version: 2,
			lesson: 'fb-motor',
			language: 'st',
			st: FB_MOTOR_STARTER,
			ladder: { version: 1, rungs: [] },
			circuit: circuitOf([
				['pushbutton', 'Start1', 'I0.0', { color: 'green' }],
				['pushbutton', 'Stop1', 'I0.1', { color: 'red', nc: true }],
				['pushbutton', 'Start2', 'I0.2', { color: 'green' }],
				['pushbutton', 'Stop2', 'I0.3', { color: 'red', nc: true }],
				['pushbutton', 'Start3', 'I0.4', { color: 'green' }],
				['pushbutton', 'Stop3', 'I0.5', { color: 'red', nc: true }],
				['switch', 'Fb1', 'I1.0'],
				['switch', 'Fb2', 'I1.1'],
				['switch', 'Fb3', 'I1.2'],
				['lamp', 'K1', 'Q0.0', { color: 'green' }],
				['lamp', 'K2', 'Q0.1', { color: 'green' }],
				['lamp', 'K3', 'Q0.2', { color: 'green' }],
				['lamp', 'H1', 'Q1.0', { color: 'red' }],
				['lamp', 'H2', 'Q1.1', { color: 'red' }],
				['lamp', 'H3', 'Q1.2', { color: 'red' }]
			]),
			symbols: [],
			watch: ['K1', 'K2', 'K3', 'H1', 'H2', 'H3'].map((w) => watchEntry(w, 'BOOL', true))
		}),
		solution: () => ({ version: 1, rungs: [] }),
		solutionSt: FB_MOTOR_SOLUTION,
		tests: [
			{
				name: 'Taśma 1 pracuje, gdy przychodzi styk zwrotny',
				steps: [
					settle(
						'Stopy puszczone',
						{ 'I0.1': true, 'I0.3': true, 'I0.5': true },
						{ 'Q0.0': false }
					),
					{ label: 'Start1', set: { 'I0.0': true }, wait: 100 },
					{
						label: 'puść, styk zwrotny',
						set: { 'I0.0': false, 'I1.0': true },
						wait: 2000,
						expect: { 'Q0.0': true, 'Q1.0': false, 'Q0.1': false }
					}
				]
			},
			{
				name: 'Taśma 2 bez styku zwrotnego: błąd po 1 s, inne taśmy bez zmian',
				steps: [
					settle(
						'Stopy puszczone',
						{ 'I0.1': true, 'I0.3': true, 'I0.5': true },
						{ 'Q0.1': false }
					),
					{
						label: 'Start1 i Start2',
						set: { 'I0.0': true, 'I0.2': true, 'I1.0': true },
						wait: 100
					},
					{
						label: 'puść, 0,5 s',
						set: { 'I0.0': false, 'I0.2': false },
						wait: 500,
						expect: { 'Q0.1': true, 'Q1.1': false }
					},
					{
						label: 'po 1,5 s',
						wait: 1000,
						expect: { 'Q0.1': false, 'Q1.1': true, 'Q0.0': true, 'Q1.0': false }
					},
					{
						label: 'Stop2 kasuje błąd',
						set: { 'I0.3': false },
						wait: 100,
						expect: { 'Q1.1': false }
					}
				]
			},
			{
				name: 'Trzy instancje działają niezależnie',
				steps: [
					settle(
						'Stopy puszczone',
						{ 'I0.1': true, 'I0.3': true, 'I0.5': true, 'I1.0': true, 'I1.1': true, 'I1.2': true },
						{ 'Q0.2': false }
					),
					{ label: 'Start3', set: { 'I0.4': true }, wait: 100 },
					{
						label: 'puść',
						set: { 'I0.4': false },
						wait: 500,
						expect: { 'Q0.2': true, 'Q0.0': false, 'Q0.1': false }
					},
					{ label: 'Start1', set: { 'I0.0': true }, wait: 100 },
					{
						label: 'Stop3',
						set: { 'I0.0': false, 'I0.5': false },
						wait: 100,
						expect: { 'Q0.0': true, 'Q0.2': false }
					}
				]
			}
		]
	},
	{
		slug: 'oven-filter',
		title: 'Tablice, RETAIN i przerwanie cykliczne: filtr czujnika',
		level: 'process',
		scenario: 'oven',
		summary:
			'Próbkuj temperaturę co 100 ms w przerwaniu cyklicznym, uśrednij 10 próbek w tablicy i policz alarmy w pamięci RETAIN.',
		instructions: [
			'Termopara pieca (`Temperature`, `IW4`, °C × 10) łapie zakłócenia od styczników: pojedyncza próbka potrafi pokazać 300 °C, choć piec ma 150 °C. Alarm przegrzania na surowej wartości wyłączałby grzanie bez powodu.',
			'Zrób **filtr średniej kroczącej**: w `CYCLIC_INTERRUPT T#100ms` (to odpowiednik OB30 w TIA Portal — kod uruchamiany co stały czas, niezależnie od cyklu OB1) zapisuj próbkę do tablicy `buf : ARRAY[0..9] OF INT` jak do bufora kołowego, a do `Avg` (`MW20`) wpisz średnią z 10 próbek — czyli z ostatniej sekundy.',
			'Alarm `alarm` ma się włączyć, gdy `Avg` > 2500 (250 °C), i zgasnąć poniżej 2300 (histereza). Pojedyncza zakłócona próbka nie może go wywołać, ale temperatura trzymająca się powyżej 250 °C — tak.',
			'Każde włączenie alarmu (zbocze narastające) zwiększa licznik `alarms`. Zadeklaruj go w **`VAR RETAIN`**: zwykłe zmienne po Stop → Run wracają do wartości początkowych, retencyjne zostają — tak jak licznik godzin pracy czy liczba wyprodukowanych sztuk.'
		],
		hints: [
			'Bufor kołowy: `buf[pos] := Temperature; pos := pos + 1; IF pos > 9 THEN pos := 0; END_IF;`',
			'Suma w pętli: `sum := 0; FOR i := 0 TO 9 DO sum := sum + buf[i]; END_FOR; Avg := DINT_TO_INT(sum / 10);`',
			'Zbocze: `edge(CLK := alarm); IF edge.Q THEN alarms := alarms + 1; END_IF;` — a `alarms : INT;` przenieś do bloku `VAR RETAIN`.'
		],
		starter: () => ({
			version: 2,
			lesson: 'oven-filter',
			scenario: 'oven',
			language: 'st',
			st: FILTER_STARTER,
			ladder: { version: 1, rungs: [] },
			circuit: circuitOf([['switch', 'HeatOn', 'I0.2']]),
			symbols: [
				symbol('DoorClosed', 'I0.0', 'Wyłącznik drzwi (1 = zamknięte)'),
				symbol('OverTemp', 'I0.1', 'Termostat bezpieczeństwa > 280 °C'),
				symbol('Temperature', 'IW4', 'Termopara, °C × 10'),
				symbol('Heater', 'Q0.0', 'Stycznik grzałek'),
				symbol('OverheatLamp', 'Q0.2', 'Lampka alarmu przegrzania'),
				symbol('HeaterPower', 'QW4', 'Moc grzałek 0 … 27648'),
				symbol('Avg', 'MW20', 'Temperatura po filtrze, °C × 10'),
				symbol('AlarmCount', 'MW22', 'Liczba alarmów (RETAIN)')
			],
			watch: ['Temperature', 'Avg', 'OverheatLamp', 'AlarmCount'].map((w) =>
				watchEntry(w, undefined, true)
			)
		}),
		solution: () => ({ version: 1, rungs: [] }),
		solutionSt: FILTER_SOLUTION,
		tests: [
			{
				name: 'Avg nadąża za temperaturą',
				steps: [
					{ label: 'piec 180 °C, 2 s', commands: [['temp', 180]], wait: 2000, check: avgNear(150) },
					{ label: 'piec 120 °C, 2 s', commands: [['temp', 120]], wait: 2000, check: avgNear(150) }
				]
			},
			{
				name: 'Pojedyncza zakłócona próbka nie wywołuje alarmu',
				steps: [
					{ label: 'piec 150 °C', commands: [['temp', 150]], wait: 1500 },
					{ label: 'zakłócenie: 300 °C przez 100 ms', commands: [['temp', 300]], wait: 100 },
					{
						label: 'z powrotem 150 °C, 2 s',
						commands: [['temp', 150]],
						wait: 2000,
						expect: { 'Q0.2': false },
						check: alarmCount(0)
					}
				]
			},
			{
				name: 'Gorący piec: alarm, licznik i RETAIN po Stop → Run',
				steps: [
					{ label: 'piec 150 °C', commands: [['temp', 150]], wait: 1500 },
					{
						label: 'piec 300 °C, 1,5 s',
						commands: [['temp', 300]],
						wait: 1500,
						expect: { 'Q0.2': true },
						check: alarmCount(1)
					},
					{
						label: 'ostygł do 150 °C, 2 s',
						commands: [['temp', 150]],
						wait: 2000,
						expect: { 'Q0.2': false }
					},
					{ label: 'drugi alarm', commands: [['temp', 300]], wait: 1500, check: alarmCount(2) },
					{ label: 'ostygł', commands: [['temp', 150]], wait: 2000 },
					{
						label: 'Stop → Run (nowe ładowanie programu)',
						restart: true,
						wait: 500,
						check: alarmCount(2)
					}
				]
			}
		]
	},
	{
		slug: 'recipe-index',
		kind: 'debug',
		title: 'Znajdź błąd: CPU staje po wyborze receptury',
		level: 'process',
		summary:
			'Zły numer receptury z panelu wychodzi poza tablicę i zatrzymuje sterownik. Zabezpiecz program i dodaj OB121.',
		instructions: [
			'Operator wybiera na panelu recepturę 1 … 3 (`RecipeNo`, `MW10`), a program bierze z tablicy temperaturę zadaną `Setpoint` (`MW12`).',
			'**Objaw:** zaraz po Run sterownik przechodzi w STOP (FAULT). W widoku **Diagnostics** bufor diagnostyczny mówi: indeks poza zakresem tablicy. Panel startuje z wartością 0, a operator potrafi też wpisać 7.',
			'Popraw program: zanim użyjesz `RecipeNo` jako indeksu, sprawdź zakres. Przy złej wartości zapal lampkę `BadRecipe` (`Q0.1`) i zostaw poprzednią temperaturę. Jako siatkę bezpieczeństwa dodaj **OB121** (blok błędu programowania), który też zapala `BadRecipe` — bez niego każdy przeoczony błąd zatrzymuje maszynę.'
		],
		hints: [
			'`IF RecipeNo >= 1 AND RecipeNo <= 3 THEN Setpoint := temps[RecipeNo]; BadRecipe := FALSE; ELSE BadRecipe := TRUE; END_IF;`',
			'Na końcu programu: `ORGANIZATION_BLOCK OB121` … `BadRecipe := TRUE;` … `END_ORGANIZATION_BLOCK`.',
			'Na S7-1500 brak OB121 przy takim błędzie = STOP. Dane z HMI zawsze traktuj jak dane z zewnątrz: sprawdzaj zakres.'
		],
		starter: () => ({
			version: 2,
			lesson: 'recipe-index',
			language: 'st',
			st: RECIPE_STARTER,
			ladder: { version: 1, rungs: [] },
			circuit: circuitOf([['lamp', 'BadRecipe', 'Q0.1', { color: 'red' }]]),
			symbols: [
				symbol('RecipeNo', 'MW10', 'Numer receptury z panelu (1 … 3)'),
				symbol('Setpoint', 'MW12', 'Temperatura zadana, °C × 10')
			],
			watch: [
				watchEntry('RecipeNo', 'DEC', true),
				watchEntry('Setpoint', 'DEC', true),
				watchEntry('BadRecipe', undefined, true)
			]
		}),
		solution: () => ({ version: 1, rungs: [] }),
		solutionSt: RECIPE_SOLUTION,
		tests: [
			{
				name: 'Poprawny numer: temperatura z receptury',
				steps: [
					{
						label: 'receptura 2',
						hmi: { MW10: 2 },
						wait: 100,
						check: setpointIs(2000),
						expect: { 'Q0.1': false }
					},
					{ label: 'receptura 3', hmi: { MW10: 3 }, wait: 100, check: setpointIs(2200) }
				]
			},
			{
				name: 'Zły numer: CPU pracuje dalej, lampka, temperatura bez zmian',
				steps: [
					{ label: 'start z 0 z panelu', wait: 100, expect: { 'Q0.1': true } },
					{
						label: 'receptura 1',
						hmi: { MW10: 1 },
						wait: 100,
						check: setpointIs(1800),
						expect: { 'Q0.1': false }
					},
					{
						label: 'operator wpisuje 7',
						hmi: { MW10: 7 },
						wait: 200,
						check: setpointIs(1800),
						expect: { 'Q0.1': true }
					},
					{
						label: 'operator wpisuje -1',
						hmi: { MW10: -1 },
						wait: 200,
						check: setpointIs(1800),
						expect: { 'Q0.1': true }
					},
					{
						label: 'z powrotem 2',
						hmi: { MW10: 2 },
						wait: 100,
						check: setpointIs(2000),
						expect: { 'Q0.1': false }
					}
				]
			}
		]
	},
	{
		slug: 'oven-pid-lad',
		title: 'Piec w drabince: blok PID',
		level: 'process',
		scenario: 'oven',
		summary:
			'Ten sam piec, ale w LAD: wstaw gotowy blok PID z biblioteki, podłącz piny i dobierz nastawy.',
		instructions: [
			'W drabince nie piszesz regulatora sam — bierzesz **gotowy blok** z biblioteki (paleta „Blocks → FB…” → **PID**), jak PID_Compact w TIA Portal. Każdy blok ma **instancję** (np. `PID_1`) z własną pamięcią.',
			'Podłącz piny: `SP` = `1800` (180,0 °C, bo temperatura przychodzi w °C × 10), `PV` = `Temperature`, `OUT_HI` = `27648.0` (pełna moc), wyjście `OUT ⇒` `HeaterPower`.',
			'Nastawy w jednostkach sygnałów: `KP` ≈ **80** (3 % mocy na 1 °C to 3 · 276,48 / 10 na jednostkę PV), `TI` ≈ **12** s. Wymagania jak w lekcji ST: 180 °C w minutę, przestrzał do 8 °C, ±1,5 °C po zimnym wsadzie.',
			'Network z blokiem potrzebuje cewki (np. `PidOn`, `M0.0`). Stycznik grzałek z blokadą drzwi już jest.'
		],
		hints: [
			'Blok PID wstawisz z listy „FB…” na palecie. Puste piny mają wartości domyślne (szare podpowiedzi w polach).',
			'KP za duże (np. 300) — oscylacje; za małe (np. 10) — powolne dochodzenie. TI 12 s to dobry start.'
		],
		starter: starter('oven-pid-lad', [], {
			scenario: 'oven',
			symbols: [
				symbol('DoorClosed', 'I0.0', 'Wyłącznik drzwi (1 = zamknięte)'),
				symbol('OverTemp', 'I0.1', 'Termostat bezpieczeństwa > 280 °C'),
				symbol('Temperature', 'IW4', 'Termopara, °C × 10'),
				symbol('Heater', 'Q0.0', 'Stycznik grzałek'),
				symbol('HeaterPower', 'QW4', 'Moc grzałek 0 … 27648'),
				symbol('PidOn', 'M0.0', 'Regulator pracuje')
			],
			watch: ['Temperature', 'HeaterPower', 'Heater'],
			ladder: program(
				rung(
					[contact('NO', 'DoorClosed'), contact('NC', 'OverTemp')],
					[coil('COIL', 'Heater')],
					'Stycznik grzałek z blokadą drzwi i termostatu'
				)
			)
		}),
		solution: () =>
			program(
				rung(
					[contact('NO', 'DoorClosed'), contact('NC', 'OverTemp')],
					[coil('COIL', 'Heater')],
					'Stycznik grzałek z blokadą drzwi i termostatu'
				),
				rung(
					[
						blockBox('PID', 'PID_1', {
							SP: '1800',
							PV: 'Temperature',
							KP: '80.0',
							TI: '12.0',
							OUT_HI: '27648.0',
							'>OUT': 'HeaterPower'
						})
					],
					[coil('COIL', 'PidOn')],
					'Regulator temperatury'
				)
			),
		tests: []
	},
	{
		slug: 'pneumatic-press',
		title: 'Prasa pneumatyczna: sekwencja A+ B+ B− A− z nadzorem ruchu',
		level: 'process',
		scenario: 'pneumatic',
		summary:
			'Klasyczne zadanie z pneumatyki: docisk i prasa na zaworach 5/2, krokowy program w CASE i alarm, gdy siłownik nie dojedzie.',
		instructions: [
			'Stanowisko ma dwa siłowniki na **monostabilnych zaworach 5/2**: cewka załączona = wysuw, wyłączona = sprężyna przestawia zawór i siłownik się chowa. Na obu krańcach każdego siłownika są **kontaktrony** (1B1/1B2, 2B1/2B2).',
			'Po `Start` (albo stale przy przełączniku `Auto`), gdy detal leży, jest powietrze i oba siłowniki są schowane: **A+** (docisk), **B+** (prasa), **B−**, **A−**. Każdy krok czeka na kontaktron — nie na czas.',
			'**Nadzór ruchu:** jeśli ruch nie skończy się w 2 s albo w trakcie cyklu zniknie powietrze (`AirOk`), przejdź do kroku błędu 99 i zapal `Alarm`. Docisk ma wtedy trzymać detal, a prasa wracać. Po `Ack` (i z powrotem powietrzu) program kończy cykl: prasa w górę, potem docisk.',
			'Usterki wywołasz sam w widoku Process → „Czujniki i usterki” (brak powietrza, nieszczelny siłownik, kontaktron stale 0).'
		],
		hints: [
			'Licznik czasu kroku: `moveTime(IN := step >= 10 AND step <= 40 AND step = lastStep, PT := T#2s); lastStep := step;` — przy zmianie kroku IN na jeden cykl spada i timer liczy od nowa.',
			'`IF step >= 10 AND step <= 40 AND (moveTime.Q OR NOT AirOk) THEN step := 99; END_IF;`',
			'Wyjścia licz z kroku po CASE: `Clamp := step = 10 OR step = 20 OR step = 30 OR (step = 99 AND Clamp);`'
		],
		starter: () => ({
			version: 2,
			lesson: 'pneumatic-press',
			scenario: 'pneumatic',
			language: 'st',
			st: PRESS_STARTER,
			ladder: { version: 1, rungs: [] },
			circuit: circuitOf([
				['pushbutton', 'Start', 'I1.0', { color: 'green' }],
				['switch', 'Auto', 'I1.1'],
				['pushbutton', 'Ack', 'I1.2'],
				['lamp', 'Alarm', 'Q1.0', { color: 'red' }]
			]),
			symbols: (plantInfo('pneumatic')?.io ?? []).map((io) =>
				symbol(io.name, io.address, io.comment)
			),
			watch: ['A_Extended', 'B_Extended', 'Clamp', 'Press', 'Alarm'].map((w) =>
				watchEntry(w, undefined, true)
			)
		}),
		solution: () => ({ version: 1, rungs: [] }),
		solutionSt: PRESS_SOLUTION,
		tests: [
			{
				name: 'Start: jeden cykl, detal dobry',
				steps: [
					{ label: 'Start', set: { 'I1.0': true }, wait: 100 },
					{ label: 'puść, 4 s', set: { 'I1.0': false }, wait: 4000, check: pressCounts(1) }
				]
			},
			{
				name: 'Auto: detal za detalem',
				steps: [
					{ label: 'Auto, 15 s', set: { 'I1.1': true }, wait: 15_000, check: pressCounts(4, true) }
				]
			},
			{
				name: 'Brak powietrza w cyklu: alarm, docisk trzyma, po Ack cykl kończy się bez złomu',
				steps: [
					{ label: 'Start', set: { 'I1.0': true }, wait: 100 },
					{
						label: 'docisk w ruchu — znika powietrze',
						set: { 'I1.0': false },
						plantFaults: { noAir: true },
						wait: 2500,
						expect: { 'Q1.0': true, 'Q0.1': false }
					},
					{
						label: 'powietrze wraca',
						plantFaults: { noAir: false },
						wait: 500,
						expect: { 'Q1.0': true }
					},
					{ label: 'Ack', set: { 'I1.2': true }, wait: 100 },
					{
						label: 'puść Ack, 2 s',
						set: { 'I1.2': false },
						wait: 2000,
						expect: { 'Q1.0': false, 'Q0.0': false },
						check: pressCounts(0)
					},
					{ label: 'Start', set: { 'I1.0': true }, wait: 100 },
					{ label: 'puść, 4 s', set: { 'I1.0': false }, wait: 4000, check: pressCounts(1) }
				]
			},
			{
				name: 'Nieszczelny siłownik: B nie dojeżdża w 2 s → alarm',
				steps: [
					{
						label: 'nieszczelny B, Start',
						plantFaults: { leakB: true },
						set: { 'I1.0': true },
						wait: 100
					},
					{ label: 'puść, 3 s', set: { 'I1.0': false }, wait: 3000, expect: { 'Q1.0': true } }
				]
			}
		]
	},
	{
		slug: 'mixer-batch',
		title: 'Mieszalnik wsadowy w SFC: dozowanie, grzanie i blokady',
		level: 'process',
		scenario: 'mixer',
		realism: true,
		summary:
			'Partia: 40 % składnika A, do 80 % składnik B, grzanie z mieszaniem do 50 °C, 5 s mieszania, spust. Pomiar poziomu z szumem — i co, gdy przewód 4–20 mA się zerwie.',
		instructions: [
			'Mieszalnik ma przetwornik poziomu `Level` (`IW4`, 0 … 27648 = 0 … 100 %, sygnał 4–20 mA) i temperatury `Temperature` (`IW6`, °C × 10). Pomiary **szumią** — jak prawdziwe.',
			'Dokończ diagram SFC: po `FillB` krok `Heat` (mieszadło i grzałka) do **50 °C** (500), krok `Mix` (samo mieszadło) przez **5 s** i `Drain` (zawór spustowy) aż poziom spadnie do 1 % (276). Potem znowu `Idle`. Progi: 40 % = 11059, 80 % = 22118.',
			'**Blokady w logice stałej** (działa po diagramie, więc ma ostatnie słowo): przy złym pomiarze poziomu — wartość **32767** (zerwany przewód / przepełnienie) albo zadziałany wyłącznik `LevelOk` — zapal `Alarm` i zamknij zawory A, B oraz wyłącz grzałkę. `Ack` kasuje alarm, gdy pomiar wrócił. Grzałka nigdy poniżej 15 % (4147) — inaczej pracuje na sucho.',
			'Spróbuj bez blokady: zerwij przewód `IW4` w widoku Process → „Czujniki i usterki” w trakcie napełniania. 32767 spełnia warunek „≥ 40 %” i „≥ 80 %” — diagram przeskoczy do grzania z prawie pustym zbiornikiem.'
		],
		hints: [
			'Przejście `Mix → Drain`: `Mix.T >= T#5s` (czas aktywności kroku).',
			'`IF Alarm THEN ValveA := FALSE; ValveB := FALSE; Heater := FALSE; END_IF;` — logika stała nadpisuje akcje kroków.',
			'Alarm zapamiętaj: ustawiaj przy `Level >= 32767 OR NOT LevelOk`, kasuj tylko `Ack` przy dobrym pomiarze.'
		],
		starter: () => ({
			version: 2,
			lesson: 'mixer-batch',
			scenario: 'mixer',
			language: 'sfc',
			sfc: mixerSfc(false),
			ladder: { version: 1, rungs: [] },
			circuit: circuitOf([
				['pushbutton', 'Start', 'I1.0', { color: 'green' }],
				['pushbutton', 'Ack', 'I1.1'],
				['lamp', 'Alarm', 'Q1.0', { color: 'red' }]
			]),
			symbols: (plantInfo('mixer')?.io ?? []).map((io) => symbol(io.name, io.address, io.comment)),
			watch: [
				watchEntry('Level', 'DEC', true),
				watchEntry('Temperature', 'DEC', true),
				watchEntry('Alarm', undefined, true)
			]
		}),
		solution: () => ({ version: 1, rungs: [] }),
		solutionSfc: () => mixerSfc(true),
		tests: [
			{
				name: 'Jedna dobra partia',
				steps: [
					{ label: 'Start', set: { 'I1.0': true }, wait: 100 },
					{ label: 'puść, 90 s', set: { 'I1.0': false }, wait: 90_000, check: mixerOk(1) }
				]
			},
			{
				name: 'Zerwany przewód poziomu przy napełnianiu: alarm, zawory zamknięte, grzałka nie rusza',
				steps: [
					{ label: 'Start', set: { 'I1.0': true }, wait: 100 },
					{ label: 'napełnianie A, 3 s', set: { 'I1.0': false }, wait: 3000 },
					{
						label: 'przewód IW4 zerwany, 20 s',
						fieldFaults: { IW4: 'wireBreak' },
						wait: 20_000,
						expect: { 'Q1.0': true, 'Q0.0': false, 'Q0.1': false, 'Q0.3': false },
						check: mixerOk(0)
					}
				]
			}
		]
	},
	{
		slug: 'std-motor',
		title: 'Standard bloku urządzenia: silnik z trybami, permisywami i blokadami',
		level: 'process',
		summary:
			'Napisz blok, jakiego używa się w zakładzie dla każdego silnika: Auto i Ręczny, permisywy tylko do startu, blokady zawsze, nadzór stycznika i kwitowanie.',
		instructions: [
			'W prawdziwym zakładzie nikt nie pisze sterowania pompy „od zera”. Jest **standard**: jeden blok silnika z ustalonym interfejsem, używany setki razy. Tu piszesz taki blok — `MotorStd` — i testujesz go na pompie P1.',
			'**Tryby.** `ManMode` = 0: tryb Auto, silnik pracuje, gdy sekwencja żąda (`AutoCmd`). `ManMode` = 1: tryb ręczny, operator uruchamia go `ManStart` i zatrzymuje `ManStop` z panelu; żądanie z sekwencji jest wtedy ignorowane.',
			'**Permisywy a blokady** — najważniejsza różnica. `Permit` to warunki potrzebne do **startu** (np. jest woda w zbiorniku ssawnym): gdy znikną w trakcie pracy, silnik pracuje dalej. `Interlock` to blokada: **zatrzymuje natychmiast**, w każdym trybie (np. za wysokie ciśnienie). Po zniknięciu blokady tryb ręczny nie startuje sam.',
			'**Nadzór.** Jeśli po rozkazie `Run` styk pomocniczy `Feedback` nie zgłosi się w **2 s** — alarm `Fault` (zapamiętany) i rozkaz wyłączony. `Ack` kasuje alarm, gdy silnik stoi. `Ready` = można uruchomić (permisywy są, nie ma blokady ani alarmu), `Running` = praca potwierdzona.'
		],
		hints: [
			'`Ready := Permit AND NOT Interlock AND NOT Fault;` — a start w Auto: `Run := Run OR Ready;` (raz uruchomiony pracuje bez permisywów).',
			'Tryb ręczny to zatrzask: `IF NOT ManMode OR ManStop OR Interlock OR Fault THEN manOn := FALSE; ELSIF ManStart AND Ready THEN manOn := TRUE; END_IF;`',
			'Nadzór: `fbTimer(IN := Run AND NOT Feedback, PT := T#2s); IF fbTimer.Q THEN Fault := TRUE; Run := FALSE; END_IF;`'
		],
		starter: () => ({
			version: 2,
			lesson: 'std-motor',
			language: 'st',
			st: STD_PUMP_STARTER,
			ladder: { version: 1, rungs: [] },
			circuit: circuitOf([
				['switch', 'AutoRequest', 'I0.0'],
				['switch', 'ManMode', 'I0.1'],
				['pushbutton', 'ManStart', 'I0.2', { color: 'green' }],
				['pushbutton', 'ManStop', 'I0.3', { color: 'red' }],
				['switch', 'LevelOk', 'I0.4'],
				['switch', 'PressureHigh', 'I0.5'],
				['switch', 'FbK1', 'I0.6'],
				['pushbutton', 'Ack', 'I0.7'],
				['lamp', 'K1', 'Q0.0', { color: 'green' }],
				['lamp', 'H_Run', 'Q0.1', { color: 'green' }],
				['lamp', 'H_Fault', 'Q0.2', { color: 'red' }]
			]),
			symbols: [],
			watch: ['AutoRequest', 'LevelOk', 'PressureHigh', 'FbK1', 'K1', 'H_Fault'].map((w) =>
				watchEntry(w, 'BOOL', true)
			)
		}),
		solution: () => ({ version: 1, rungs: [] }),
		solutionSt: STD_PUMP_SOLUTION,
		tests: [
			{
				name: 'Auto: praca na żądanie sekwencji',
				steps: [
					{ label: 'woda jest, stycznik sprawny', set: { 'I0.4': true, 'I0.6': true }, wait: 100 },
					{
						label: 'żądanie pracy',
						set: { 'I0.0': true },
						wait: 300,
						expect: { 'Q0.0': true, 'Q0.1': true }
					},
					{ label: 'koniec żądania', set: { 'I0.0': false }, wait: 200, expect: { 'Q0.0': false } }
				]
			},
			{
				name: 'Permisyw potrzebny do startu, nie do pracy',
				steps: [
					{
						label: 'brak wody, żądanie',
						set: { 'I0.6': true, 'I0.0': true },
						wait: 500,
						expect: { 'Q0.0': false }
					},
					{ label: 'woda jest', set: { 'I0.4': true }, wait: 300, expect: { 'Q0.0': true } },
					{
						label: 'poziom spada w trakcie pracy',
						set: { 'I0.4': false },
						wait: 500,
						expect: { 'Q0.0': true }
					}
				]
			},
			{
				name: 'Blokada zatrzymuje natychmiast',
				steps: [
					{
						label: 'praca',
						set: { 'I0.4': true, 'I0.6': true, 'I0.0': true },
						wait: 300,
						expect: { 'Q0.0': true }
					},
					{
						label: 'za wysokie ciśnienie',
						set: { 'I0.5': true },
						wait: 50,
						expect: { 'Q0.0': false, 'Q0.2': false }
					},
					{
						label: 'ciśnienie spada — Auto rusza znowu',
						set: { 'I0.5': false },
						wait: 300,
						expect: { 'Q0.0': true }
					}
				]
			},
			{
				name: 'Brak potwierdzenia stycznika: alarm i kwitowanie',
				steps: [
					{
						label: 'żądanie, stycznik nie zgłasza',
						set: { 'I0.4': true, 'I0.0': true },
						wait: 2500,
						expect: { 'Q0.0': false, 'Q0.2': true }
					},
					{
						label: 'kwitowanie bez naprawy — alarm wraca po 2 s',
						set: { 'I0.7': true },
						wait: 100
					},
					{
						label: 'naprawiony stycznik, kwitowanie',
						set: { 'I0.7': false, 'I0.6': true },
						wait: 2600
					},
					{ label: 'Ack', set: { 'I0.7': true }, wait: 100 },
					{
						label: 'puść Ack',
						set: { 'I0.7': false },
						wait: 300,
						expect: { 'Q0.2': false, 'Q0.0': true, 'Q0.1': true }
					}
				]
			},
			{
				name: 'Tryb ręczny: przyciski z panelu, sekwencja nie ma wpływu',
				steps: [
					{
						label: 'ręczny, woda, stycznik',
						set: { 'I0.1': true, 'I0.4': true, 'I0.6': true, 'I0.0': true },
						wait: 300,
						expect: { 'Q0.0': false }
					},
					{ label: 'ManStart', set: { 'I0.2': true }, wait: 100 },
					{
						label: 'puść, koniec żądania sekwencji',
						set: { 'I0.2': false, 'I0.0': false },
						wait: 300,
						expect: { 'Q0.0': true }
					},
					{ label: 'blokada', set: { 'I0.5': true }, wait: 100, expect: { 'Q0.0': false } },
					{
						label: 'blokada znika — ręczny nie startuje sam',
						set: { 'I0.5': false },
						wait: 300,
						expect: { 'Q0.0': false }
					},
					{ label: 'ManStart', set: { 'I0.2': true }, wait: 100 },
					{ label: 'puść', set: { 'I0.2': false }, wait: 100, expect: { 'Q0.0': true } },
					{ label: 'ManStop', set: { 'I0.3': true }, wait: 100, expect: { 'Q0.0': false } }
				]
			}
		]
	},
	{
		slug: 'std-conveyors',
		title: 'Standard w praktyce: ciąg taśm z kaskadowym zatrzymaniem',
		level: 'process',
		summary:
			'Ten sam blok MotorStd trzy razy: taśmy startują od końca linii, a gdy jedna stanie, wszystkie przed nią zatrzymują się bez wysypania materiału.',
		instructions: [
			'Materiał płynie **C1 → C2 → C3**, C3 zrzuca go do zasobnika. Blok `MotorStd` jest gotowy — przetestowany w poprzedniej lekcji. Teraz go **używasz**, nie piszesz.',
			'**Start od końca linii.** Taśma może ruszyć dopiero, gdy pracuje taśma za nią — to jej **permisyw** (`Permit := c3.Running` dla C2). Inaczej C1 sypałaby materiał na stojącą C2. Dla C3 permisyw to `TRUE`.',
			'**Kaskadowe zatrzymanie.** Gdy taśma za mną stanie w trakcie pracy (np. wybił termik), mam się zatrzymać natychmiast — to **blokada**: `Interlock := c2.Run AND NOT c3.Running`. Alarm ma tylko taśma, która naprawdę zawiodła; pozostałe po prostu stoją i ruszą same po kwitowaniu i naprawie.',
			'Wywołaj instancje w kolejności **C3, C2, C1** — każda widzi aktualny stan taśmy za sobą. Lampka `FaultLamp` świeci, gdy którakolwiek ma alarm.'
		],
		hints: [
			'`c3(AutoCmd := lineOn, Permit := TRUE, Feedback := Fb3, Ack := Ack, Run => K3);`',
			'`c2(AutoCmd := lineOn, Permit := c3.Running, Interlock := c2.Run AND NOT c3.Running, Feedback := Fb2, Ack := Ack, Run => K2);` — i tak samo C1 względem C2.',
			'Wyjście instancji można czytać w jej własnym wywołaniu (`c2.Run`) — to wartość z poprzedniego cyklu.'
		],
		starter: () => ({
			version: 2,
			lesson: 'std-conveyors',
			language: 'st',
			st: STD_LINE_STARTER,
			ladder: { version: 1, rungs: [] },
			circuit: circuitOf([
				['pushbutton', 'Start', 'I0.0', { color: 'green' }],
				['pushbutton', 'Stop', 'I0.1', { color: 'red', nc: true }],
				['pushbutton', 'Ack', 'I0.2'],
				['switch', 'Fb1', 'I1.0'],
				['switch', 'Fb2', 'I1.1'],
				['switch', 'Fb3', 'I1.2'],
				['lamp', 'K1', 'Q0.0', { color: 'green' }],
				['lamp', 'K2', 'Q0.1', { color: 'green' }],
				['lamp', 'K3', 'Q0.2', { color: 'green' }],
				['lamp', 'FaultLamp', 'Q0.3', { color: 'red' }]
			]),
			symbols: [],
			watch: ['K1', 'K2', 'K3', 'Fb3', 'FaultLamp'].map((w) => watchEntry(w, 'BOOL', true))
		}),
		solution: () => ({ version: 1, rungs: [] }),
		solutionSt: STD_LINE_SOLUTION,
		tests: [
			{
				name: 'Start i Stop całej linii',
				steps: [
					settle(
						'Stop puszczony, styczniki sprawne',
						{ 'I0.1': true, 'I1.0': true, 'I1.1': true, 'I1.2': true },
						{ 'Q0.0': false }
					),
					{ label: 'Start', set: { 'I0.0': true }, wait: 100 },
					{
						label: 'puść',
						set: { 'I0.0': false },
						wait: 300,
						expect: { 'Q0.0': true, 'Q0.1': true, 'Q0.2': true }
					},
					{
						label: 'Stop',
						set: { 'I0.1': false },
						wait: 100,
						expect: { 'Q0.0': false, 'Q0.1': false, 'Q0.2': false }
					}
				]
			},
			{
				name: 'Start od końca: C2 bez potwierdzenia — C1 nie rusza, C3 pracuje',
				steps: [
					settle(
						'C2 nie potwierdza',
						{ 'I0.1': true, 'I1.0': true, 'I1.2': true },
						{ 'Q0.0': false }
					),
					{ label: 'Start', set: { 'I0.0': true }, wait: 100 },
					{
						label: 'puść, 1 s',
						set: { 'I0.0': false },
						wait: 1000,
						expect: { 'Q0.2': true, 'Q0.0': false }
					},
					{
						label: 'po 3 s',
						wait: 2000,
						expect: { 'Q0.3': true, 'Q0.1': false, 'Q0.0': false, 'Q0.2': true }
					}
				]
			},
			{
				name: 'C3 staje w trakcie pracy: C2 i C1 zatrzymują się od razu, po naprawie ruszają same',
				steps: [
					settle(
						'Stop puszczony',
						{ 'I0.1': true, 'I1.0': true, 'I1.1': true, 'I1.2': true },
						{ 'Q0.0': false }
					),
					{ label: 'Start', set: { 'I0.0': true }, wait: 100 },
					{ label: 'praca', set: { 'I0.0': false }, wait: 500, expect: { 'Q0.0': true } },
					{
						label: 'C3 traci potwierdzenie',
						set: { 'I1.2': false },
						wait: 50,
						expect: { 'Q0.0': false, 'Q0.1': false }
					},
					{ label: 'po 2,5 s', wait: 2500, expect: { 'Q0.3': true, 'Q0.2': false } },
					{ label: 'naprawa i Ack', set: { 'I1.2': true, 'I0.2': true }, wait: 100 },
					{
						label: 'puść Ack',
						set: { 'I0.2': false },
						wait: 500,
						expect: { 'Q0.3': false, 'Q0.0': true, 'Q0.1': true, 'Q0.2': true }
					}
				]
			}
		]
	},
	{
		slug: 'capstone-mixer',
		kind: 'capstone',
		title: 'Projekt końcowy: mieszalnik MX2 według opisu funkcjonalnego',
		level: 'process',
		scenario: 'mixer',
		realism: true,
		summary:
			'Cała maszyna od zera, jak w pracy: opis funkcjonalny, sekwencja, receptury, alarmy, HMI i odbiór FAT. Po zaliczeniu — recenzja kodu.',
		instructions: [
			'**Zlecenie.** Technolog zamawia sterowanie mieszalnika MX2 (ten sam obiekt co w lekcji SFC). Dostajesz opis funkcjonalny — Twoja robota to program w dowolnym języku, panel HMI z alarmami i odbiór FAT. Przyciski: `Start` (`I1.0`), `Stop` (`I1.1`, NC), `Ack` (`I1.2`), lampka `Alarm` (`Q1.0`). Panel: `RecipeNo` (`MW30`), `BatchCount` (`MW40`).',
			'**W1 — Partia.** Dozowanie A do progu receptury, dozowanie B do drugiego progu, grzanie z mieszaniem do 50 °C, 5 s mieszania, spust do 1 % (276). Potem maszyna czeka na kolejny Start.',
			'**W2 — Receptury** z panelu: `RecipeNo` = 1 → A do 40 % (11059), B do 80 % (22118); 2 → A do 30 % (8294), B do 60 % (16589).',
			'**W3 — Stop** (NC) wstrzymuje partię natychmiast: zawory zamknięte, grzałka i mieszadło stoją. `Start` wznawia od tego samego kroku.',
			'**W4 — Grzałka** tylko przy poziomie ≥ 15 % (4147) i wiarygodnym pomiarze — nigdy na sucho.',
			'**W5 — Zła receptura** (inna niż 1 i 2): Start nie rusza, zapala się `Alarm`. CPU nie może przejść w STOP.',
			'**W6 — Alarmy** (zapamiętane, kasowane `Ack`, gdy przyczyna zniknęła): zerwany przewód przetwornika poziomu (32767), wyłącznik `LevelOk` (zbiornik przepełniony), grzanie dłuższe niż **120 s** (uszkodzona grzałka), zła receptura. Alarm wstrzymuje partię jak Stop. Wystaw je na bity `AlmLevel`, `AlmOverfill`, `AlmHeating`, `AlmRecipe` (`M20.0` … `M20.3`) i dodaj w panelu HMI alarmy z opisem dla operatora oraz pole receptury.',
			'**W7 — Odbiór FAT.** Testy to protokół odbioru: każda pozycja sprawdza jedno wymaganie, także z usterkami wstrzykniętymi w obiekt. Pomiary szumią.',
			'**W8 — Licznik partii** (`BatchCount`) przeżywa Stop → Run (pamięć RETAIN).'
		],
		hints: [
			'Zacznij od listy I/O i kroków sekwencji na kartce. Jeden `CASE step OF` z krokami 10, 20, 30, 40, 50 i wyjścia liczone z kroku pod spodem — tak jak w lekcji prasy.',
			'Wstrzymanie: zmienna `run`. `IF NOT Stop OR Alarm THEN run := FALSE; END_IF;` a przejścia i wyjścia tylko gdy `run`.',
			'Nadzór grzania: `heatTime(IN := run AND step = 30, PT := T#120s);` → alarm. Licznik: `VAR RETAIN batches : INT; END_VAR`.'
		],
		starter: () => ({
			version: 2,
			lesson: 'capstone-mixer',
			scenario: 'mixer',
			language: 'st',
			st: CAPSTONE_STARTER,
			ladder: { version: 1, rungs: [] },
			circuit: circuitOf([
				['pushbutton', 'Start', 'I1.0', { color: 'green' }],
				['pushbutton', 'Stop', 'I1.1', { color: 'red', nc: true }],
				['pushbutton', 'Ack', 'I1.2'],
				['lamp', 'Alarm', 'Q1.0', { color: 'red' }]
			]),
			symbols: [
				...(plantInfo('mixer')?.io ?? []).map((io) => symbol(io.name, io.address, io.comment)),
				symbol('RecipeNo', 'MW30', 'Numer receptury z panelu (1, 2)'),
				symbol('BatchCount', 'MW40', 'Liczba partii (RETAIN)'),
				symbol('AlmLevel', 'M20.0', 'Alarm: przetwornik poziomu'),
				symbol('AlmOverfill', 'M20.1', 'Alarm: przepełnienie (LevelOk)'),
				symbol('AlmHeating', 'M20.2', 'Alarm: grzanie > 120 s'),
				symbol('AlmRecipe', 'M20.3', 'Alarm: zła receptura')
			],
			watch: [
				watchEntry('Level', 'DEC', true),
				watchEntry('Temperature', 'DEC', true),
				watchEntry('RecipeNo', 'DEC', true),
				watchEntry('BatchCount', 'DEC', true),
				watchEntry('Alarm', undefined, true)
			]
		}),
		solution: () => ({ version: 1, rungs: [] }),
		solutionSt: CAPSTONE_SOLUTION,
		solutionHmi: () => ({
			widgets: [
				widget('label', 20, 16, { text: 'Mieszalnik MX2' }),
				widget('input', 20, 60, { tag: 'RecipeNo', text: 'Receptura (1, 2)' }),
				widget('value', 220, 60, { tag: 'BatchCount', text: 'Partie' }),
				widget('bar', 420, 60, { tag: 'Level', text: 'Poziom', min: 0, max: 27648 }),
				widget('value', 220, 140, {
					tag: 'Temperature',
					text: 'Temperatura',
					scale: 0.1,
					decimals: 1,
					unit: '°C'
				}),
				widget('alarms', 20, 240)
			],
			alarms: [
				{
					id: 'a1',
					tag: 'AlmLevel',
					text: 'Przetwornik poziomu: zerwany przewód — dozowanie wstrzymane',
					kind: 'alarm'
				},
				{
					id: 'a2',
					tag: 'AlmOverfill',
					text: 'Zbiornik przepełniony (wyłącznik poziomu)',
					kind: 'alarm'
				},
				{
					id: 'a3',
					tag: 'AlmHeating',
					text: 'Grzanie trwa ponad 120 s — sprawdź grzałkę',
					kind: 'alarm'
				},
				{
					id: 'a4',
					tag: 'AlmRecipe',
					text: 'Zły numer receptury — wybierz 1 albo 2',
					kind: 'warning'
				}
			],
			ackTag: ''
		}),
		tests: [
			{
				name: 'FAT 1 (W1, W2, W8): receptura 1 — dobra partia, licznik',
				steps: [
					{
						label: 'Stop puszczony, receptura 1',
						set: { 'I1.1': true },
						hmi: { MW30: 1 },
						wait: 200
					},
					{ label: 'Start', set: { 'I1.0': true }, wait: 100 },
					{ label: 'puść, 110 s', set: { 'I1.0': false }, wait: 110_000, check: mixerOk(1) },
					{ label: 'licznik', wait: 0, check: counted(1) }
				]
			},
			{
				name: 'FAT 2 (W2): receptura 2 — dobra partia',
				steps: [
					{
						label: 'Stop puszczony, receptura 2',
						set: { 'I1.1': true },
						hmi: { MW30: 2 },
						wait: 200
					},
					{ label: 'Start', set: { 'I1.0': true }, wait: 100 },
					{ label: 'puść, 90 s', set: { 'I1.0': false }, wait: 90_000, check: mixerOk(1) }
				]
			},
			{
				name: 'FAT 3 (W5): zła receptura — alarm, brak startu, CPU w RUN',
				steps: [
					{ label: 'receptura 7', set: { 'I1.1': true }, hmi: { MW30: 7 }, wait: 200 },
					{ label: 'Start', set: { 'I1.0': true }, wait: 100 },
					{
						label: 'puść, 3 s',
						set: { 'I1.0': false },
						wait: 3000,
						expect: { 'Q1.0': true, 'Q0.0': false, 'Q0.1': false }
					}
				]
			},
			{
				name: 'FAT 4 (W3): Stop wstrzymuje dozowanie, Start wznawia — partia dobra',
				steps: [
					{ label: 'receptura 1', set: { 'I1.1': true }, hmi: { MW30: 1 }, wait: 200 },
					{ label: 'Start', set: { 'I1.0': true }, wait: 100 },
					{
						label: 'dozowanie A, 3 s',
						set: { 'I1.0': false },
						wait: 3000,
						expect: { 'Q0.0': true }
					},
					{
						label: 'Stop',
						set: { 'I1.1': false },
						wait: 2000,
						expect: { 'Q0.0': false, 'Q0.2': false }
					},
					{ label: 'puść Stop, Start', set: { 'I1.1': true, 'I1.0': true }, wait: 100 },
					{ label: 'puść, 110 s', set: { 'I1.0': false }, wait: 110_000, check: mixerOk(1) }
				]
			},
			{
				name: 'FAT 5 (W4, W6): zerwany przewód poziomu przy dozowaniu B',
				steps: [
					{ label: 'receptura 1', set: { 'I1.1': true }, hmi: { MW30: 1 }, wait: 200 },
					{ label: 'Start', set: { 'I1.0': true }, wait: 100 },
					{ label: 'dozowanie, 12 s', set: { 'I1.0': false }, wait: 12_000 },
					{
						label: 'przewód IW4 zerwany, 20 s',
						fieldFaults: { IW4: 'wireBreak' },
						wait: 20_000,
						expect: { 'Q1.0': true, 'Q0.0': false, 'Q0.1': false, 'Q0.3': false },
						check: mixerOk(0)
					}
				]
			},
			{
				name: 'FAT 6 (W6): uszkodzona grzałka — alarm po 120 s grzania',
				steps: [
					{
						label: 'grzałka uszkodzona, receptura 1',
						set: { 'I1.1': true },
						hmi: { MW30: 1 },
						plantFaults: { heaterDead: true },
						wait: 200
					},
					{ label: 'Start', set: { 'I1.0': true }, wait: 100 },
					{ label: 'puść, 60 s', set: { 'I1.0': false }, wait: 60_000, expect: { 'Q1.0': false } },
					{
						label: 'po 160 s',
						wait: 100_000,
						expect: { 'Q1.0': true, 'Q0.3': false, 'Q0.2': false }
					}
				]
			},
			{
				name: 'FAT 7 (W8): licznik partii po Stop → Run',
				steps: [
					{ label: 'receptura 2', set: { 'I1.1': true }, hmi: { MW30: 2 }, wait: 200 },
					{ label: 'Start', set: { 'I1.0': true }, wait: 100 },
					{ label: 'puść, 90 s', set: { 'I1.0': false }, wait: 90_000, check: counted(1) },
					{ label: 'Stop → Run', restart: true, wait: 500, check: counted(1) }
				]
			}
		]
	},
	{
		slug: 'stl-pump',
		kind: 'debug',
		title: 'Znajdź błąd w STL: pompa, której Stop nie zawsze zatrzymuje',
		level: 'logic',
		summary:
			'Pierwszy kontakt z AWL ze starego S7-300: przeczytaj program, znajdź, dlaczego trzymany Start wygrywa ze Stopem, i popraw jedną linią nawiasu.',
		instructions: [
			'Serwis zgłasza: „Jak operator trzyma Start, Stop nie wyłącza pompy”. Program jest w **STL** (po niemiecku **AWL**) — każda linia to jedna instrukcja, wynik logiki (**RLO**) płynie z linii do linii.',
			'`A` to I (AND), `O` to LUB (OR), `=` przypisuje RLO. Uwaga: w STL **I wiąże mocniej niż LUB** — `A a / O b / A c` znaczy `a + (b·c)`, a nie `(a + b)·c`.',
			'Popraw sieć 1 tak, żeby **Stop wygrywał zawsze**. Sieć 2 (lampka po 3 s, timer S7 `SD`) działa — nie ruszaj. Online zobaczysz po prawej status każdej linii: STA, RLO, ACCU1 — jak w STEP 7.'
		],
		hints: [
			'Rozpisz sieć 1 jak wyrażenie: `Start + (Pump · Stop)`. Gdy Start jest wciśnięty, Stop w ogóle nie bierze udziału.',
			'Nawias: `A(` / `O "Start"` / `O "Pump"` / `)` / `A "Stop"` / `= "Pump"`.'
		],
		starter: () => ({
			version: 2,
			lesson: 'stl-pump',
			language: 'stl',
			st: '',
			stl: STL_PUMP_STARTER,
			ladder: { version: 1, rungs: [] },
			circuit: circuitOf([
				['pushbutton', 'Start', 'I0.0', { color: 'green' }],
				['pushbutton', 'Stop', 'I0.1', { color: 'red', nc: true }],
				['lamp', 'Pump', 'Q0.0', { color: 'green' }],
				['lamp', 'RunLamp', 'Q0.1', { color: 'amber' }]
			]),
			symbols: [],
			watch: [watchEntry('Pump', undefined, true), watchEntry('RunLamp', undefined, true)]
		}),
		solution: () => ({ version: 1, rungs: [] }),
		solutionStl: STL_PUMP_SOLUTION,
		tests: [
			{
				name: 'Start i podtrzymanie',
				steps: [
					{ label: 'Stop puszczony', set: { 'I0.1': true }, wait: 100, expect: { 'Q0.0': false } },
					{ label: 'Start', set: { 'I0.0': true }, wait: 100, expect: { 'Q0.0': true } },
					{ label: 'puść Start', set: { 'I0.0': false }, wait: 100, expect: { 'Q0.0': true } }
				]
			},
			{
				name: 'Stop wygrywa — także przy trzymanym Starcie',
				steps: [
					{ label: 'Stop puszczony, Start', set: { 'I0.1': true, 'I0.0': true }, wait: 100 },
					{
						label: 'Stop przy trzymanym Starcie',
						set: { 'I0.1': false },
						wait: 100,
						expect: { 'Q0.0': false }
					},
					{
						label: 'puść oba',
						set: { 'I0.0': false, 'I0.1': true },
						wait: 100,
						expect: { 'Q0.0': false }
					}
				]
			},
			{
				name: 'Lampka pracy po 3 s (bez zmian)',
				steps: [
					{ label: 'Start', set: { 'I0.1': true, 'I0.0': true }, wait: 100 },
					{ label: 'puść, 2 s', set: { 'I0.0': false }, wait: 2000, expect: { 'Q0.1': false } },
					{ label: 'po 3,2 s', wait: 1100, expect: { 'Q0.1': true } }
				]
			}
		]
	},
	{
		slug: 'brownfield-press',
		kind: 'brownfield',
		title: 'Przejęty program: zlecenie zmiany w prasie z 2009 roku',
		level: 'process',
		scenario: 'pneumatic',
		summary:
			'Cudzy program w AWL, bez symboli i komentarzy, działa od lat. Dodaj pracę ciągłą i licznik — i nie zepsuj tego, co działa.',
		instructions: [
			'**Sytuacja.** Prasa PR1 (ta sama co w lekcji o pneumatyce) chodzi od 2009 roku na programie w STL. Autora nie ma, dokumentacji też — jest tylko kod z adresami bezwzględnymi i kroki na markerach `M10.1` … `M10.4` (ustaw / kasuj). Tablica symboli pomoże: najedź na adres albo sprawdź listę I/O obiektu.',
			'**Zlecenie zmiany ZM-17** od technologa: (1) przełącznik `Auto` (`I1.1`) — praca ciągła, detal za detalem; (2) licznik dobrych detali w `MW50` dla panelu.',
			'**Zasady modernizacji:** zmieniaj jak najmniej, oznacz każdą zmianę komentarzem z numerem ZM, nie „sprzątaj” działającego kodu przy okazji. Pozycje „Regresja” w testach sprawdzają, że stare działanie zostało.',
			'Uważaj na **ukryte założenia** starego programu: przy ręcznym starcie coś pilnował operator, a nie sterownik.'
		],
		hints: [
			'Start i Auto to LUB, a reszta warunków startu to I — potrzebny nawias: `A(` / `O M 0.1` / `O I 1.1` / `)`. Zbocze Startu najlepiej wyciągnij do osobnej sieci (`FP M 0.0` → `= M 0.1`).',
			'Przy Auto prasa uderza na pusto: w warunku startu brakuje czujnika detalu `I 0.4` (PartPresent).',
			'Licznik: koniec cyklu (sieć 5) zapisz impulsem do markera, np. `= M 0.2`, a w nowej sieci `A M 0.2` / `JCN m007` / `L MW 50` / `L 1` / `+I` / `T MW 50` / `m007: NOP 0`.'
		],
		starter: () => ({
			version: 2,
			lesson: 'brownfield-press',
			scenario: 'pneumatic',
			language: 'stl',
			st: '',
			stl: STL_PRESS_STARTER,
			ladder: { version: 1, rungs: [] },
			circuit: circuitOf([
				['pushbutton', 'Start', 'I1.0', { color: 'green' }],
				['switch', 'Auto', 'I1.1']
			]),
			symbols: [
				...(plantInfo('pneumatic')?.io ?? []).map((io) => symbol(io.name, io.address, io.comment)),
				symbol('PartsGood', 'MW50', 'ZM-17: licznik dobrych detali')
			],
			watch: [
				watchEntry('Clamp', undefined, true),
				watchEntry('Press', undefined, true),
				watchEntry('PartPresent', undefined, true),
				watchEntry('PartsGood', 'DEC', true)
			]
		}),
		solution: () => ({ version: 1, rungs: [] }),
		solutionStl: STL_PRESS_SOLUTION,
		tests: [
			{
				name: 'Regresja: Start — jeden cykl, detal dobry',
				steps: [
					{ label: 'Start', set: { 'I1.0': true }, wait: 100 },
					{ label: 'puść, 4 s', set: { 'I1.0': false }, wait: 4000, check: pressCounts(1) }
				]
			},
			{
				name: 'Regresja: trzymany Start nie robi drugiego cyklu',
				steps: [
					{
						label: 'Start trzymany 10 s',
						set: { 'I1.0': true },
						wait: 10_000,
						check: pressCounts(1)
					}
				]
			},
			{
				name: 'ZM-17/1: Auto — detal za detalem, bez pustych skoków',
				steps: [
					{ label: 'Auto, 15 s', set: { 'I1.1': true }, wait: 15_000, check: pressCounts(4, true) },
					{
						label: 'Auto wyłączone, 5 s',
						set: { 'I1.1': false },
						wait: 5000,
						expect: { 'Q0.0': false, 'Q0.1': false }
					}
				]
			},
			{
				name: 'ZM-17/2: licznik dobrych detali w MW50',
				steps: [{ label: 'Auto, 15 s', set: { 'I1.1': true }, wait: 15_000, check: partsCounted }]
			}
		]
	},
	/* ---------- FBD ---------- */
	{
		slug: 'tank-fbd',
		title: 'FBD: zbiornik na przerzutniku SR',
		level: 'logic',
		scenario: 'tank',
		summary:
			'Ten sam zbiornik co w lekcji drabinkowej, ale w języku bloków funkcyjnych: przerzutnik SR z negacją na wejściu.',
		instructions: [
			'**FBD** (Function Block Diagram, w Siemensie FUP) rysuje program jako bloki połączone liniami sygnałów: wejścia po lewej, wyniki płyną w prawo do przypisań. Elektronik zobaczy tu schemat bramek, a nie drabinkę.',
			'Pompa `Pump` (`Q0.0`) ma się włączać, gdy poziom spadnie poniżej `Low` (`I0.0` = 0), i wyłączać przy `High` (`I0.1` = 1) — pomiędzy pamięta stan. To dokładnie **przerzutnik SR**: `S1` ustawia, `R` kasuje.',
			'Zaznacz wejście networku i kliknij **SR** na palecie. Do `S1` wpisz `Low` i daj mu **negację** (przycisk „¬ negacja” — kółko na wejściu), do `R` wpisz `High`. Wyjście `=` → `Pump` już jest.'
		],
		hints: [
			'SR to przerzutnik z dominującym ustawianiem, RS — z dominującym kasowaniem. Tu oba stany naraz nie wystąpią (Low = 0 i High = 1 to sprzeczność), więc wystarczy SR.',
			'Negacja w FBD to kółko na wejściu bloku — odpowiednik styku rozwiernego w drabince.'
		],
		starter: () => ({
			version: 2,
			lesson: 'tank-fbd',
			scenario: 'tank',
			language: 'fbd',
			fbd: { version: 1, networks: [fbdNetwork(operand(), [['=', 'Pump']])] },
			ladder: { version: 1, rungs: [] },
			circuit: circuitOf([['motor', 'Pump', 'Q0.0']]),
			symbols: [symbol('Low', 'I0.0', 'Poziom ≥ 20 %'), symbol('High', 'I0.1', 'Poziom ≥ 80 %')],
			watch: ['Low', 'High', 'Pump'].map((w) => watchEntry(w, undefined, true))
		}),
		solution: () => ({ version: 1, rungs: [] }),
		solutionFbd: () => ({
			version: 1,
			networks: [
				{
					...fbdNetwork(
						{ kind: 'box', box: fbdBox('SR', [['Low', 'not'], 'High'], { instance: 'PumpOn' }) },
						[['=', 'Pump']]
					),
					comment: 'Poniżej Low włącz, przy High wyłącz'
				}
			]
		}),
		// the same plant and acceptance test as the ladder version
		tests: []
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

// the FBD tank is accepted by the same test as the ladder one
LESSONS.find((l) => l.slug === 'tank-fbd')!.tests = LESSONS.find(
	(l) => l.slug === 'tank-level'
)!.tests;
// the ladder oven is accepted by the same tests as the ST one
LESSONS.find((l) => l.slug === 'oven-pid-lad')!.tests = LESSONS.find(
	(l) => l.slug === 'oven-pid'
)!.tests;
// the SFC drilling station is accepted by the same tests as the ladder one
LESSONS.find((l) => l.slug === 'sfc-drilling')!.tests = LESSONS.find(
	(l) => l.slug === 'drilling-station'
)!.tests;

export const getLesson = (slug: string) => LESSONS.find((l) => l.slug === slug) ?? null;

export const LESSON_PREFIX = 'lesson-';
export const lessonProjectId = (slug: string) => `${LESSON_PREFIX}${slug}`;
