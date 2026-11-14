import { formatAddress, parseAddress } from '#lib/engine/index.js';
import type {
	CoilType,
	ContactType,
	CounterType,
	Element,
	LadderProgram,
	Rung,
	Series,
	TimerType
} from '#lib/ladder/model.js';
import { normalizeTerminal, type Circuit } from '#lib/circuit/model.js';
import type { Hmi } from '#lib/hmi/model.js';

/*
 * Guided steps for the lessons ("krok po kroku"). Each step is checked live against the ladder
 * program while the student builds it, so they always know what to do next — and that the
 * part they just built is right. Checks look at the structure, not at exact element order,
 * so any equivalent solution ticks the boxes.
 */

export interface GuideContext {
	ladder: LadderProgram;
	/** the project's operator panel (HMI lessons) */
	hmi?: Hmi;
	/** the project's circuit (commissioning lessons check the wiring) */
	circuit?: Circuit;
	/** Resolves a symbol or address to a normalized address (null if invalid). */
	addr: (operand: string) => string | null;
	online: boolean;
	passed: boolean;
}

export interface GuideStep {
	text: string;
	done: (c: GuideContext) => boolean;
	/** Done by doing something in the app (run, check), not by the program's structure. */
	manual?: boolean;
}

/** Builds the address resolver for a symbol map (upper-case name → address). */
export function addressResolver(symbols: ReadonlyMap<string, string>) {
	return (operand: string): string | null => {
		const text = symbols.get(operand.trim().toUpperCase()) ?? operand;
		try {
			return formatAddress(parseAddress(text));
		} catch {
			return null;
		}
	};
}

/* ---------- structural queries ---------- */

type C = [ContactType, string];

function deep(s: Series): Element[] {
	return s.items.flatMap((e) => (e.kind === 'parallel' ? [e, ...e.branches.flatMap(deep)] : [e]));
}
const branches = (s: Series): Series[] =>
	s.items.flatMap((e) =>
		e.kind === 'parallel' ? [...e.branches, ...e.branches.flatMap(branches)] : []
	);

const sameAddr = (c: GuideContext, a: string, b: string) => {
	const x = c.addr(a);
	return x !== null && x === c.addr(b);
};
const hasContact = (c: GuideContext, s: Series, [type, op]: C) =>
	deep(s).some((e) => e.kind === 'contact' && e.type === type && sameAddr(c, e.operand, op));

export interface RungSpec {
	coil?: [CoilType, string];
	/** Contacts anywhere in the network. */
	contacts?: C[];
	/** Two groups of contacts in different branches of one parallel (an OR). */
	parallel?: [C[], C[]];
	/** Contacts together in one branch of a parallel. */
	branch?: C[];
	timer?: TimerType;
	counter?: CounterType;
	/** Number of compare boxes reading this operand. */
	compares?: [string, number];
	/** A MOVE box: source constant / operand → destination. */
	move?: [string, string];
}

export function rungMatches(c: GuideContext, r: Rung, spec: RungSpec): boolean {
	const els = deep(r.logic);
	if (spec.coil) {
		const [type, op] = spec.coil;
		if (!r.coils.some((k) => k.type === type && sameAddr(c, k.operand, op))) return false;
	}
	if (spec.contacts && !spec.contacts.every((k) => hasContact(c, r.logic, k))) return false;
	if (spec.timer && !els.some((e) => e.kind === 'timer' && e.type === spec.timer)) return false;
	if (spec.counter && !els.some((e) => e.kind === 'counter' && e.type === spec.counter))
		return false;
	if (spec.compares) {
		const [op, n] = spec.compares;
		const count = els.filter(
			(e) => e.kind === 'compare' && (sameAddr(c, e.a, op) || sameAddr(c, e.b, op))
		).length;
		if (count < n) return false;
	}
	if (spec.move) {
		const [src, dst] = spec.move;
		const ok = els.some(
			(e) =>
				e.kind === 'move' &&
				sameAddr(c, e.dst, dst) &&
				(e.src.trim() === src || sameAddr(c, e.src, src))
		);
		if (!ok) return false;
	}
	if (spec.branch) {
		const want = spec.branch;
		if (!branches(r.logic).some((b) => want.every((k) => hasContact(c, b, k)))) return false;
	}
	if (spec.parallel) {
		const [left, right] = spec.parallel;
		const ok = els.some(
			(e) =>
				e.kind === 'parallel' &&
				e.branches.some(
					(a, i) =>
						left.every((k) => hasContact(c, a, k)) &&
						e.branches.some((b, j) => j !== i && right.every((k) => hasContact(c, b, k)))
				)
		);
		if (!ok) return false;
	}
	return true;
}

/** Some network of the program matches the spec. */
export const rung =
	(spec: RungSpec) =>
	(c: GuideContext): boolean =>
		c.ladder.rungs.some((r) => rungMatches(c, r, spec));

const all =
	(...checks: ((c: GuideContext) => boolean)[]) =>
	(c: GuideContext) =>
		checks.every((f) => f(c));

const runIt = (what: string): GuideStep => ({
	text: `Uruchom PLC (▶ Run) i sprawdź działanie: ${what}`,
	done: (c) => c.online || c.passed,
	manual: true
});
const observe = (what: string): GuideStep => ({
	text: `Najpierw zobacz błąd: uruchom PLC (▶ Run) i ${what}`,
	done: (c) => c.online || c.passed,
	manual: true
});
const checkIt: GuideStep = {
	text: 'Kliknij „Sprawdź rozwiązanie” — testy sprawdzą program za Ciebie.',
	done: (c) => c.passed,
	manual: true
};

const testIo: GuideStep = {
	text: 'Test sygnałów (zakładka **Test I/O**): uruchom PLC i po kolei uruchamiaj urządzenia — porównuj, która dioda się zapala, z dokumentacją.',
	done: (c) => c.online || c.passed,
	manual: true
};

/** Is the port of a device (by label) wired to this terminal? */
const wired = (c: GuideContext, label: string, port: string, terminal: string) => {
	const d = c.circuit?.devices.find((x) => x.label === label);
	return (
		!!d &&
		!!c.circuit?.wires.some(
			(w) =>
				w.device === d.id &&
				(w.port ?? 'main') === port &&
				normalizeTerminal(w.terminal) === terminal
		)
	);
};
const nc = (c: GuideContext, label: string) =>
	c.circuit?.devices.find((x) => x.label === label)?.nc ?? false;
const vfdWord = (c: GuideContext, label: string, key: 'aiWord' | 'aoWord') =>
	c.circuit?.devices
		.find((x) => x.label === label)
		?.[key]?.trim()
		.toUpperCase();

/** A widget of this kind on the operator panel, bound to this address (or its symbol). */
const hmiWidget = (c: GuideContext, kind: string, address: string) =>
	!!c.hmi?.widgets.some((w) => w.kind === kind && sameAddr(c, w.tag, address));

/** How many coils of a type write this operand in the whole program. */
const coils = (c: GuideContext, type: CoilType, op: string) =>
	c.ladder.rungs
		.flatMap((r) => r.coils)
		.filter((k) => k.type === type && sameAddr(c, k.operand, op)).length;
/** Some contact of this type and operand anywhere in the program. */
const anyContact = (c: GuideContext, type: ContactType, op: string) =>
	c.ladder.rungs.some((r) => hasContact(c, r.logic, [type, op]));

/* ---------- the guides ---------- */

export const GUIDES: Record<string, GuideStep[]> = {
	'first-rung': [
		{ text: 'Dodaj network przyciskiem „+ Network”.', done: (c) => c.ladder.rungs.length > 0 },
		{
			text: 'Kliknij styk w networku i wpisz `Button` (albo `I0.0`) — styk NO przewodzi, gdy przycisk jest wciśnięty.',
			done: rung({ contacts: [['NO', 'I0.0']] })
		},
		{
			text: 'Kliknij cewkę i wpisz `Lamp` (`Q0.0`) — cewka zapisuje dopływające zasilanie do wyjścia.',
			done: rung({ contacts: [['NO', 'I0.0']], coil: ['COIL', 'Q0.0'] })
		},
		runIt('w widoku Circuit przytrzymaj przycisk Button — lampka świeci tylko wtedy.'),
		checkIt
	],
	'and-or': [
		{
			text: 'Network 1: dwa styki NO jeden za drugim (szeregowo) — `Left` i `Right`. Szeregowo = AND.',
			done: rung({
				contacts: [
					['NO', 'I0.0'],
					['NO', 'I0.1']
				]
			})
		},
		{
			text: 'Na końcu tego networku cewka `Press` (`Q0.0`).',
			done: rung({
				contacts: [
					['NO', 'I0.0'],
					['NO', 'I0.1']
				],
				coil: ['COIL', 'Q0.0']
			})
		},
		{
			text: 'Network 2: styk `Left`, zaznacz go i kliknij „⑂ Branch”; w nowej gałęzi ustaw `Right`. Równolegle = OR.',
			done: rung({ parallel: [[['NO', 'I0.0']], [['NO', 'I0.1']]] })
		},
		{
			text: 'Za rozgałęzieniem cewka `Warning` (`Q0.1`).',
			done: rung({ parallel: [[['NO', 'I0.0']], [['NO', 'I0.1']]], coil: ['COIL', 'Q0.1'] })
		},
		runIt('wciskaj przyciski pojedynczo i razem — porównaj z tabelą prawdy.'),
		checkIt
	],
	'self-holding': [
		{
			text: 'Network: styk NO `Start` (`I0.0`) i cewka `Motor` (`Q0.0`). Na razie silnik działa tylko przy wciśniętym Start.',
			done: rung({ contacts: [['NO', 'I0.0']], coil: ['COIL', 'Q0.0'] })
		},
		{
			text: 'Zaznacz styk Start → „⑂ Branch” i w nowej gałęzi wpisz `Motor` (`Q0.0`). To styk podtrzymania: silnik „trzyma się” sam.',
			done: rung({ parallel: [[['NO', 'I0.0']], [['NO', 'Q0.0']]], coil: ['COIL', 'Q0.0'] })
		},
		{
			text: 'Za rozgałęzieniem, szeregowo, styk NC `┤/├` na `Stop` (`I0.1`) — wciśnięty Stop przerywa obwód.',
			done: rung({
				parallel: [[['NO', 'I0.0']], [['NO', 'Q0.0']]],
				contacts: [['NC', 'I0.1']],
				coil: ['COIL', 'Q0.0']
			})
		},
		runIt('krótko wciśnij Start, potem Stop. Spróbuj też obu naraz — Stop musi wygrać.'),
		checkIt
	],
	toggle: [
		{
			text: 'Network 1: styk zbocza `┤P├` na `Button` → cewka `Pulse` (`M0.0`). Pulse = 1 tylko przez jeden cykl po wciśnięciu.',
			done: rung({ contacts: [['P', 'I0.0']], coil: ['COIL', 'M0.0'] })
		},
		{
			text: 'Network 2, gałąź 1: `Pulse` NO i `Lamp` NC szeregowo — „impuls, a lampa zgaszona → zapal”.',
			done: rung({
				branch: [
					['NO', 'M0.0'],
					['NC', 'Q0.0']
				]
			})
		},
		{
			text: 'Gałąź 2 (⑂ Branch): `Pulse` NC i `Lamp` NO — „bez impulsu lampa zostaje, jak była”.',
			done: all(
				rung({
					branch: [
						['NO', 'M0.0'],
						['NC', 'Q0.0']
					]
				}),
				rung({
					branch: [
						['NC', 'M0.0'],
						['NO', 'Q0.0']
					]
				})
			)
		},
		{
			text: 'Za rozgałęzieniem cewka `Lamp` (`Q0.0`). Razem to XOR: Lamp := Pulse XOR Lamp.',
			done: rung({
				parallel: [
					[
						['NO', 'M0.0'],
						['NC', 'Q0.0']
					],
					[
						['NC', 'M0.0'],
						['NO', 'Q0.0']
					]
				],
				coil: ['COIL', 'Q0.0']
			})
		},
		runIt('przytrzymaj przycisk dłużej — lampa nie może migać.'),
		checkIt
	],
	'traffic-light': [
		{
			text: 'Zegar cyklu: styk NC `CycleDone` → `TON` na `Cycle` (`T0`) z PT `T#8s` → cewka `CycleDone`. Timer sam się restartuje co 8 s.',
			done: rung({ contacts: [['NC', 'M0.0']], timer: 'TON', coil: ['COIL', 'M0.0'] })
		},
		{
			text: 'Czerwone: porównanie `Cycle < 4000` (ET timera w ms) → cewka `Red`.',
			done: rung({ compares: ['T0', 1], coil: ['COIL', 'Q0.0'] })
		},
		{
			text: 'Zielone: `Cycle >= 4000` I `Cycle < 7000` → `Green`.',
			done: rung({ compares: ['T0', 2], coil: ['COIL', 'Q0.2'] })
		},
		{
			text: 'Żółte: (od 3000 do 4000) LUB (od 7000) — dwie gałęzie z porównaniami → `Yellow`.',
			done: (c) =>
				c.ladder.rungs.some(
					(r) =>
						rungMatches(c, r, { compares: ['T0', 2], coil: ['COIL', 'Q0.1'] }) &&
						r.logic.items.some((e) => e.kind === 'parallel')
				)
		},
		runIt('obserwuj w widoku Process — i ET timera w widoku Watch.'),
		checkIt
	],
	'tank-level': [
		{
			text: 'Gdy poziom spadnie poniżej `Low` (styk NC `Low`) → `(S)` SET `Pump`. Pompa zostaje włączona.',
			done: rung({ contacts: [['NC', 'I0.0']], coil: ['SET', 'Q0.0'] })
		},
		{
			text: 'Gdy poziom osiągnie `High` (styk NO) → `(R)` RESET `Pump`.',
			done: rung({ contacts: [['NO', 'I0.1']], coil: ['RESET', 'Q0.0'] })
		},
		runIt('w widoku Process patrz, jak poziom krąży między czujnikami (histereza).'),
		checkIt
	],
	'sorting-conveyor': [
		{
			text: 'Przełącznik `Run` → cewka `Belt`: taśma jedzie, gdy Run jest włączony.',
			done: rung({ contacts: [['NO', 'I0.3']], coil: ['COIL', 'Q0.0'] })
		},
		{
			text: '`TallBox` → `TP` (około `T#600ms`) → `Pusher`. Krótki sygnał czujnika daje pełny ruch spychacza.',
			done: rung({ contacts: [['NO', 'I0.2']], timer: 'TP', coil: ['COIL', 'Q0.1'] })
		},
		{
			text: '`EndSensor` → licznik `CTU` z PV `3` → `Full`.',
			done: rung({ contacts: [['NO', 'I0.1']], counter: 'CTU', coil: ['COIL', 'Q0.2'] })
		},
		runIt('w widoku Process dodawaj pudełka albo włącz Auto feed.'),
		checkIt
	],
	'drilling-station': [
		{
			text: 'Załączenie linii: (`Start` LUB `Run`) I `Stop` → cewka `Run` (`M1.0`). Stop jest podłączony jako NC, więc w programie to styk NO.',
			done: rung({
				parallel: [[['NO', 'I1.0']], [['NO', 'M1.0']]],
				contacts: [['NO', 'I1.1']],
				coil: ['COIL', 'M1.0']
			})
		},
		{
			text: '`Run` → `Belt`.',
			done: rung({ contacts: [['NO', 'M1.0']], coil: ['COIL', 'Q0.0'] })
		},
		{
			text: 'Zatrzymywacz: styk NC `Release` → `Stopper`. Normalnie wysunięty, chowa się tylko na chwilę.',
			done: rung({ contacts: [['NC', 'M0.2']], coil: ['COIL', 'Q0.1'] })
		},
		{
			text: 'Krok „wiercenie”: `PartAtDrill` I `DrillTop` I NIE `Drilled` → `(S) Lowering`.',
			done: rung({
				contacts: [
					['NO', 'I0.0'],
					['NO', 'I0.1'],
					['NC', 'M0.1']
				],
				coil: ['SET', 'M0.0']
			})
		},
		{
			text: '`Lowering` → dwie cewki: `DrillLower` i `Spindle` (wrzeciono musi się kręcić, zanim wiertło dotknie detalu).',
			done: all(
				rung({ contacts: [['NO', 'M0.0']], coil: ['COIL', 'Q0.2'] }),
				rung({ contacts: [['NO', 'M0.0']], coil: ['COIL', 'Q0.3'] })
			)
		},
		{
			text: '`DrillBottom` → `TON` (co najmniej 1 s) → `(S) Drilled` i `(R) Lowering`: koniec wiercenia, wiertło wraca do góry.',
			done: all(
				rung({ contacts: [['NO', 'I0.2']], timer: 'TON', coil: ['SET', 'M0.1'] }),
				rung({ contacts: [['NO', 'I0.2']], timer: 'TON', coil: ['RESET', 'M0.0'] })
			)
		},
		{
			text: '`Drilled` I `DrillTop` → `TP` ~`T#600ms` → `Release`; a gdy detal odjedzie (`Drilled` I NIE `PartAtDrill`) → `(R) Drilled`.',
			done: all(
				rung({
					contacts: [
						['NO', 'M0.1'],
						['NO', 'I0.1']
					],
					timer: 'TP',
					coil: ['COIL', 'M0.2']
				}),
				rung({
					contacts: [
						['NO', 'M0.1'],
						['NC', 'I0.0']
					],
					coil: ['RESET', 'M0.1']
				})
			)
		},
		{
			text: 'Kontrola: `PartAtCheck` I NIE `QualityOK` → `TP` → `Ejector`.',
			done: rung({
				contacts: [
					['NO', 'I0.4'],
					['NC', 'I0.5']
				],
				timer: 'TP',
				coil: ['COIL', 'Q0.4']
			})
		},
		runIt('wciśnij Start, w widoku Process włącz Auto feed i dorzuć pęknięty detal.'),
		checkIt
	],

	/* ---------- field skills ---------- */
	'vfd-fan': [
		{
			text: 'Podtrzymanie: (`Start` LUB `Run`) I `Stop` I NIE `U1_Fault` → cewka `Run`.',
			done: rung({
				parallel: [[['NO', 'I0.0']], [['NO', 'M0.0']]],
				contacts: [
					['NO', 'I0.1'],
					['NC', 'I0.5']
				],
				coil: ['COIL', 'M0.0']
			})
		},
		{
			text: 'Wolno: NIE `Fast` → MOVE `11059` → `U1_Setpoint` (20 Hz). Network potrzebuje cewki, np. `SpeedLow`.',
			done: rung({ contacts: [['NC', 'I0.2']], move: ['11059', 'QW4'] })
		},
		{
			text: 'Szybko: `Fast` → MOVE `24883` → `U1_Setpoint` (45 Hz).',
			done: rung({ contacts: [['NO', 'I0.2']], move: ['24883', 'QW4'] })
		},
		{
			text: 'Kierunek: `Run` I NIE `Reverse` → `U1_Run`; `Run` I `Reverse` → `U1_Rev`. Nigdy oba naraz.',
			done: all(
				rung({
					contacts: [
						['NO', 'M0.0'],
						['NC', 'I0.3']
					],
					coil: ['COIL', 'Q0.0']
				}),
				rung({
					contacts: [
						['NO', 'M0.0'],
						['NO', 'I0.3']
					],
					coil: ['COIL', 'Q0.1']
				})
			)
		},
		{
			text: 'Kasowanie awarii: wciśnięty `Stop` (styk NC, bo przycisk jest podłączony NC) → `U1_Reset`.',
			done: rung({ contacts: [['NC', 'I0.1']], coil: ['COIL', 'Q0.2'] })
		},
		runIt('wciśnij Start, przełącz Fast i Reverse, wywołaj Trip i skasuj go Stopem. Patrz na Hz.'),
		checkIt
	],
	'hmi-start': [
		{
			text: 'Zakładka **HMI** (PLC zatrzymany): „+ Przycisk” z tagiem `HMI_Start` (`M10.0`).',
			done: (c) => hmiWidget(c, 'button', 'M10.0')
		},
		{
			text: 'Drugi przycisk z tagiem `HMI_Stop` (`M10.1`) — najlepiej czerwony.',
			done: (c) => hmiWidget(c, 'button', 'M10.1')
		},
		{
			text: '„+ Lampka” z tagiem `Motor` — operator widzi, czy silnik pracuje.',
			done: (c) => hmiWidget(c, 'lamp', 'Q0.0')
		},
		{
			text: 'Program: dodaj `HMI_Start` równolegle do `Start` (⑂ Branch) — start z panelu albo z szafy.',
			done: rung({
				contacts: [
					['NO', 'M10.0'],
					['NO', 'I0.0']
				],
				coil: ['COIL', 'Q0.0']
			})
		},
		{
			text: 'Program: styk NC `HMI_Stop` szeregowo obok `Stop` — stop z panelu zatrzymuje, a Stop z szafy działa dalej.',
			done: rung({
				contacts: [
					['NC', 'M10.1'],
					['NO', 'I0.1']
				],
				coil: ['COIL', 'Q0.0']
			})
		},
		runIt('w zakładce HMI naciśnij Start i Stop na ekranie, potem przyciski na szafie (Circuit).'),
		checkIt
	],

	/* ---------- commissioning ---------- */
	'commissioning-conveyor': [
		testIo,
		{
			text: 'Przyciski: dioda `I0.0` ma się zapalać od `S1` (Start), a `I0.1` gaśnie po wciśnięciu `S2` (Stop, NC). Czy przewody trafiają na zaciski z dokumentacji?',
			done: (c) => wired(c, 'S1', 'main', 'I0.0') && wired(c, 'S2', 'main', 'I0.1')
		},
		{
			text: 'Czujnik `B1`: bez detalu wejście `I0.2` ma być 0. Co pokazuje dioda, gdy przed czujnikiem nic nie ma? (sprawdź ustawienie NC)',
			done: (c) => wired(c, 'B1', 'main', 'I0.2') && nc(c, 'B1') === false
		},
		{
			text: 'Styk pomocniczy `K1` — gdzie wraca potwierdzenie załączenia stycznika? Dokumentacja: `BeltFeedback` = `I0.3`.',
			done: (c) => wired(c, 'K1', 'aux', 'I0.3')
		},
		{
			text: 'Lampki: zielona `H1` = praca (`Q0.1`), czerwona `H2` = awaria (`Q0.2`). Zgadza się kolor ze znaczeniem?',
			done: (c) => wired(c, 'H1', 'main', 'Q0.1') && wired(c, 'H2', 'main', 'Q0.2')
		},
		checkIt
	],
	'commissioning-vfd': [
		testIo,
		{
			text: 'Sygnał RUN: program włącza `PumpRun` (`Q0.0`). Czy ten zacisk trafia na wejście RUN falownika `U1`?',
			done: (c) => wired(c, 'U1', 'main', 'Q0.0')
		},
		{
			text: 'Prędkość zadana: program pisze ją do `QW4`. Które słowo czyta falownik (pole AI1 na `U1`)?',
			done: (c) => vfdWord(c, 'U1', 'aiWord') === 'QW4' && vfdWord(c, 'U1', 'aoWord') === 'IW4'
		},
		{
			text: 'Awaria: przekaźnik FAULT falownika ma wracać na `I0.4` (`VfdFault`). Wywołaj awarię przyciskiem Trip i sprawdź diodę.',
			done: (c) => wired(c, 'U1', 'fault', 'I0.4')
		},
		checkIt
	],

	/* ---------- find the bug ---------- */
	'bug-double-coil': [
		observe('wciśnij w widoku Circuit najpierw `Button1`, potem `Button2`. Który działa?'),
		{
			text: 'Zostaw tylko jedną cewkę `Lamp` — ostatni zapis w cyklu wygrywa, więc dwie cewki na jednym wyjściu to błąd (zobacz też ostrzeżenia).',
			done: (c) => coils(c, 'COIL', 'Q0.0') === 1
		},
		{
			text: 'Przed tą cewką oba przyciski równolegle (LUB): `Button1` ⑂ `Button2`.',
			done: all(
				(c) => coils(c, 'COIL', 'Q0.0') === 1,
				rung({ parallel: [[['NO', 'I0.0']], [['NO', 'I0.1']]], coil: ['COIL', 'Q0.0'] })
			)
		},
		checkIt
	],
	'bug-set-reset-order': [
		observe('przytrzymaj `Start` i w tym czasie wciśnij `Stop`. Co robi silnik?'),
		{
			text: 'Spraw, żeby RESET był wykonywany po SET (zamień networki strzałkami ↑ / ↓) — albo dodaj styk NC `Stop` przed `(S) Motor`.',
			done: (c) => {
				const rungs = c.ladder.rungs;
				const set = rungs.findIndex((r) =>
					r.coils.some((k) => k.type === 'SET' && sameAddr(c, k.operand, 'Q0.0'))
				);
				const reset = rungs.findIndex((r) =>
					r.coils.some((k) => k.type === 'RESET' && sameAddr(c, k.operand, 'Q0.0'))
				);
				if (set < 0 || reset < 0) return false;
				return reset > set || hasContact(c, rungs[set].logic, ['NC', 'I0.1']);
			}
		},
		checkIt
	],
	'bug-flicker': [
		observe('przytrzymaj przycisk i patrz na lampkę oraz na wykres `Pulse`.'),
		{
			text: 'Zamień styk `Button` w networku 1 na styk zbocza narastającego `┤P├` (zaznacz go i zmień typ pod paletą).',
			done: (c) => anyContact(c, 'P', 'I0.0') && !anyContact(c, 'NO', 'I0.0')
		},
		checkIt
	],
	'bug-timer-edge': [
		observe('uruchom silnik i patrz na ET timera `T0`. Czy rośnie?'),
		{
			text: 'Wejście timera musi trwać: zamień styk zbocza `┤P├ Motor` na zwykły styk NO `Motor`.',
			done: all(
				rung({ contacts: [['NO', 'Q0.0']], timer: 'TON', coil: ['COIL', 'Q0.1'] }),
				(c) => !anyContact(c, 'P', 'Q0.0')
			)
		},
		checkIt
	],
	'bug-stop-nc': [
		observe('spójrz na panel I/O: jaką wartość ma `I0.1`, gdy nikt nie wciska Stop?'),
		{
			text: 'Puszczony Stop daje 1, więc w programie potrzebny jest styk NO `Stop` (a nie NC) — wciśnięcie albo zerwany przewód daje 0 i przerywa obwód.',
			done: all(
				rung({ contacts: [['NO', 'I0.1']], coil: ['COIL', 'Q0.0'] }),
				(c) => !anyContact(c, 'NC', 'I0.1')
			)
		},
		checkIt
	]
};
