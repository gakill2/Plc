import type { Hardware } from '#lib/hw/hw.js';
import type { Sfc } from '#lib/sfc/sfc.js';
import type { FbdBox, FbdValue, Fbd } from '#lib/fbd/fbd.js';
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
	/** Structured Text source (ST lessons) */
	st?: string;
	/** Sequential function chart (SFC lessons) */
	sfc?: Sfc;
	/** Function block diagram (FBD lessons) */
	fbd?: Fbd;
	/** Statement List source (STL lessons) */
	stl?: string;
	/** the rack (hardware lessons) */
	hw?: Hardware;
	/** the safety program (F-CPU lessons) */
	safety?: string;
	/** saved versions of the project */
	history?: { name: string; comment: string }[];
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
	/** A MATH box with this function writing this destination. */
	math?: [string, string];
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
	if (spec.math) {
		const [fn, dst] = spec.math;
		if (!els.some((e) => e.kind === 'math' && e.fn === fn && sameAddr(c, e.dst, dst))) return false;
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

/** A numeric constant from the ST declarations, e.g. `Kp : REAL := 3.0;` */
const stParam = (c: GuideContext, name: string): number | null => {
	const m = new RegExp(`\\b${name}\\s*:\\s*REAL\\s*:=\\s*(-?[\\d.]+)`, 'i').exec(c.st ?? '');
	return m ? Number(m[1]) : null;
};
const inRange = (v: number | null, lo: number, hi: number) => v !== null && v >= lo && v <= hi;

/* ---------- SFC lessons ---------- */
const sfcStepOf = (c: GuideContext, name: string) =>
	c.sfc?.steps.find((s) => s.name.toUpperCase() === name.toUpperCase());
/** The step exists and has all these actions (qualifier, operand). */
const stepHas = (c: GuideContext, name: string, ...actions: [string, string][]) => {
	const s = sfcStepOf(c, name);
	return (
		!!s &&
		actions.every(([q, op]) =>
			s.actions.some((a) => a.qualifier === q && sameAddr(c, a.operand, op))
		)
	);
};
/** A transition from → to whose condition matches. */
const transitionIs = (c: GuideContext, from: string, to: string, cond: RegExp) =>
	!!c.sfc?.transitions.some(
		(t) =>
			t.from.some((n) => n.toUpperCase() === from.toUpperCase()) &&
			t.to.some((n) => n.toUpperCase() === to.toUpperCase()) &&
			cond.test(t.condition)
	);

/** The first SR flip-flop of the FBD diagram. */
const srBox = (c: GuideContext) => {
	const walk = (v: FbdValue): FbdBox | null => {
		if (v.kind !== 'box') return null;
		if (v.box.type.toUpperCase() === 'SR') return v.box;
		for (const p of v.box.inputs) {
			const r = walk(p.value);
			if (r) return r;
		}
		return null;
	};
	for (const n of c.fbd?.networks ?? []) {
		const r = walk(n.value);
		if (r) return r;
	}
	return null;
};

/** The first PID box in the program. */
const pidBlock = (c: GuideContext) => {
	for (const r of c.ladder.rungs)
		for (const e of deep(r.logic))
			if (e.kind === 'block' && e.type.toUpperCase() === 'PID') return e;
	return null;
};

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

	/* ---------- new plants ---------- */
	'crane-positioning': [
		{
			text: 'Stacja A: zbocze `GoA` → MOVE `2000` → `Target` i cewka SET `Moving`.',
			done: rung({ contacts: [['P', 'I0.5']], move: ['2000', 'MW10'], coil: ['SET', 'M0.0'] })
		},
		{
			text: 'Stacja B: tak samo z `GoB` i `8000`.',
			done: rung({ contacts: [['P', 'I0.6']], move: ['8000', 'MW10'], coil: ['SET', 'M0.0'] })
		},
		{
			text: 'Uchyb: `Moving` → MATH **SUB** `Position − Target` → `Error` (cewka np. `Calc`).',
			done: rung({ contacts: [['NO', 'M0.0']], math: ['SUB', 'MW12'] })
		},
		{
			text: 'Na miejscu: dwa porównania (`Error > −30` i `Error < 30`) → RESET `Moving`.',
			done: rung({ compares: ['MW12', 2], coil: ['RESET', 'M0.0'] })
		},
		{
			text: 'Stop: wciśnięty `Stop` (NC, więc styk NC w programie) → RESET `Moving`.',
			done: rung({ contacts: [['NC', 'I0.7']], coil: ['RESET', 'M0.0'] })
		},
		{
			text: 'W prawo: `Moving`, `HookTop`, `LimitRight`, `Error < −30` i blokada NC `Left` → `Right`.',
			done: rung({
				contacts: [
					['NO', 'M0.0'],
					['NO', 'I0.2'],
					['NO', 'I0.1'],
					['NC', 'Q0.0']
				],
				compares: ['MW12', 1],
				coil: ['COIL', 'Q0.1']
			})
		},
		{
			text: 'W lewo: lustrzanie — `LimitLeft`, `Error > 30`, blokada NC `Right` → `Left`.',
			done: rung({
				contacts: [
					['NO', 'M0.0'],
					['NO', 'I0.2'],
					['NO', 'I0.0'],
					['NC', 'Q0.1']
				],
				compares: ['MW12', 1],
				coil: ['COIL', 'Q0.0']
			})
		},
		{
			text: 'Szybki bieg, gdy daleko: `Error < −600` LUB `Error > 600` → `Fast`.',
			done: rung({ compares: ['MW12', 2], coil: ['COIL', 'Q0.2'] })
		},
		runIt('w widoku Process naciśnij GoB i GoA (Circuit), obserwuj hamowanie przed celem.'),
		checkIt
	],
	'oven-pid': [
		{
			text: 'Najpierw zobacz problem: uruchom PLC i obserwuj **trend** `Temperature` — przestrzał i bujanie.',
			done: (c) => c.online || c.passed,
			manual: true
		},
		{
			text: 'Zmniejsz wzmocnienie `Kp` (rozsądnie: 2 … 6) — mniejsze oscylacje.',
			done: (c) => inRange(stParam(c, 'Kp'), 2, 6)
		},
		{
			text: 'Wydłuż czas zdwojenia `Ti` (rozsądnie: 4 … 20 s) — całka nie przestrzeli.',
			done: (c) => inRange(stParam(c, 'Ti'), 4, 20)
		},
		{
			text: 'Blokada: `Heater := DoorClosed AND NOT OverTemp;`',
			done: (c) => /Heater\s*:=[^;]*DoorClosed[^;]*NOT\s+OverTemp/i.test(c.st ?? '')
		},
		runIt('w widoku Process włóż zimny wsad i otwórz drzwi.'),
		checkIt
	],

	'sfc-drilling': [
		{
			text: 'Krok `Dwell` z akcjami N `DrillLower`, N `Spindle`, N `Stopper` i przejście `Drill → Dwell` przy `DrillBottom`.',
			done: (c) =>
				stepHas(c, 'Dwell', ['N', 'Q0.2'], ['N', 'Q0.3'], ['N', 'Q0.1']) &&
				transitionIs(c, 'Drill', 'Dwell', /DrillBottom/i)
		},
		{
			text: 'Przejście `Dwell → Raise` po czasie: `Dwell.T >= T#1200ms`.',
			done: (c) => transitionIs(c, 'Dwell', 'Raise', /Dwell\.T\s*>=?\s*T#/i)
		},
		{
			text: 'Krok `Raise` tylko z N `Stopper` (wiertło wraca do góry) → `Release` przy `DrillTop`.',
			done: (c) =>
				stepHas(c, 'Raise', ['N', 'Q0.1']) &&
				!stepHas(c, 'Raise', ['N', 'Q0.2']) &&
				transitionIs(c, 'Raise', 'Release', /DrillTop/i)
		},
		{
			text: 'Krok `Release` **bez** `Stopper` → `Leave` przy `Release.T >= T#600ms`.',
			done: (c) =>
				!!sfcStepOf(c, 'Release') &&
				!stepHas(c, 'Release', ['N', 'Q0.1']) &&
				transitionIs(c, 'Release', 'Leave', /Release\.T\s*>=?\s*T#/i)
		},
		{
			text: 'Krok `Leave` z N `Stopper` i przejście `Leave → Wait` przy `NOT PartAtDrill` — pętla zamknięta.',
			done: (c) =>
				stepHas(c, 'Leave', ['N', 'Q0.1']) && transitionIs(c, 'Leave', 'Wait', /NOT\s+PartAtDrill/i)
		},
		runIt(
			'w widoku Program aktywny krok świeci na zielono — obserwuj cały cykl na kolejnych detalach.'
		),
		checkIt
	],

	'remote-pump': [
		{
			text: 'Watchdog: porównanie `Heartbeat == LastBeat` → TON `T#500ms` → cewka `CommFault`.',
			done: rung({ compares: ['IW6', 1], timer: 'TON', coil: ['COIL', 'M0.1'] })
		},
		{
			text: 'Pod nim: MOVE `Heartbeat` → `LastBeat` (każdy network potrzebuje cewki, np. `BeatCopied`).',
			done: rung({ move: ['IW6', 'MW20'] })
		},
		{
			text: 'Network `Run`: dodaj szeregowo styk NC `CommFault` — brak sieci kasuje podtrzymanie.',
			done: rung({ contacts: [['NC', 'M0.1']], coil: ['COIL', 'M0.0'] })
		},
		{
			text: 'Lampka `CommLamp` z `CommFault`.',
			done: rung({ contacts: [['NO', 'M0.1']], coil: ['COIL', 'Q0.0'] })
		},
		{
			text: '`PumpLamp` tylko ze świeżych danych: `PumpRunning` I NIE `CommFault`.',
			done: rung({
				contacts: [
					['NO', 'I2.0'],
					['NC', 'M0.1']
				],
				coil: ['COIL', 'Q0.1']
			})
		},
		runIt(
			'w widoku Process przerwij kabel i podłącz go z powrotem — obserwuj Heartbeat i LastBeat.'
		),
		checkIt
	],

	'two-hand-press': [
		{
			text: 'Tylko jedna ręka: gałęzie `Left` I NIE `Right` ⑂ NIE `Left` I `Right` → TON `T#500ms` → SET `Blocked`.',
			done: rung({
				parallel: [
					[
						['NO', 'I0.0'],
						['NC', 'I0.1']
					],
					[
						['NC', 'I0.0'],
						['NO', 'I0.1']
					]
				],
				timer: 'TON',
				coil: ['SET', 'M0.0']
			})
		},
		{
			text: 'Puszczona jedna ręka w trakcie pracy: `WasPressing` I (NIE `Left` ⑂ NIE `Right`) → SET `Blocked`.',
			done: rung({ contacts: [['NO', 'M0.1']], coil: ['SET', 'M0.0'] })
		},
		{
			text: 'Obie puszczone: NIE `Left` I NIE `Right` → RESET `Blocked`.',
			done: rung({
				contacts: [
					['NC', 'I0.0'],
					['NC', 'I0.1']
				],
				coil: ['RESET', 'M0.0']
			})
		},
		{
			text: 'Prasa: `Left` I `Right` I NIE `Blocked` → `Press` oraz `WasPressing`.',
			done: all(
				rung({
					contacts: [
						['NO', 'I0.0'],
						['NO', 'I0.1'],
						['NC', 'M0.0']
					],
					coil: ['COIL', 'Q0.0']
				}),
				rung({ contacts: [['NC', 'M0.0']], coil: ['COIL', 'M0.1'] })
			)
		},
		runIt('naciśnij przyciski w różnej kolejności i z opóźnieniem (przytrzymaj ● w panelu I/O).'),
		checkIt
	],

	'drive-profidrive': [
		{
			text: 'Sekwencja załączenia: gdy `Run` = 0, wysyłaj `STW1 := 16#047E;` (w gałęzi ELSE) — napęd przejdzie do „gotowy do załączenia”.',
			done: (c) => /ELSE\s+STW1\s*:=\s*16#047E/i.test(c.st ?? '')
		},
		{
			text: 'Błąd z napędu: `Fault := (ZSW1 AND 16#0008) <> 0;` i `AND NOT Fault` w podtrzymaniu `Run`.',
			done: (c) =>
				/ZSW1\s+AND\s+16#0*8\b/i.test(c.st ?? '') && /Run\s*:=[^;]*NOT\s+Fault/i.test(c.st ?? '')
		},
		{
			text: 'Kwitowanie: `IF Ack THEN STW1 := STW1 OR 16#0080; END_IF;`',
			done: (c) => /STW1\s+OR\s+16#0*80\b/i.test(c.st ?? '')
		},
		{
			text: 'Prędkość: `Fast` → `NSOLL_A := 16#4000` (50 Hz), inaczej `16#2000` (25 Hz).',
			done: (c) =>
				/16#4000/i.test(c.st ?? '') && /16#2000/i.test(c.st ?? '') && /IF\s+Fast/i.test(c.st ?? '')
		},
		{
			text: 'Lampka pracy ze statusu napędu: `LampRun := (ZSW1 AND 16#0004) <> 0;`',
			done: (c) => /LampRun\s*:=[^;]*ZSW1[^;]*16#0*4\b/i.test(c.st ?? '')
		},
		runIt(
			'w widoku Process obserwuj stan S1 → S2 → S3 → S4 i bity STW1 / ZSW1; wywołaj błąd i skwituj go.'
		),
		checkIt
	],

	'fb-motor': [
		{
			text: 'W bloku: timer kontroli `check(IN := Run AND NOT Feedback, PT := T#1s);`',
			done: (c) => /check\s*\(\s*IN\s*:=\s*Run\s+AND\s+NOT\s+Feedback/i.test(c.st ?? '')
		},
		{
			text: 'Po czasie ustaw błąd: `IF check.Q THEN Fault := TRUE; … END_IF;`',
			done: (c) => /check\.Q\s+THEN[^]*?Fault\s*:=\s*TRUE/i.test(c.st ?? '')
		},
		{
			text: 'Błąd zatrzymuje (`AND NOT Fault` w podtrzymaniu), a `Stop` go kasuje (`Fault := FALSE`).',
			done: (c) =>
				/Run\s*:=[^;]*NOT\s+Fault/i.test(c.st ?? '') && /Fault\s*:=\s*FALSE/i.test(c.st ?? '')
		},
		{
			text: 'Program główny: zadeklaruj `m2 : Motor;` i `m3 : Motor;` i wywołaj je dla taśm 2 i 3.',
			done: (c) =>
				/m2\s*:\s*Motor/i.test(c.st ?? '') &&
				/m3\s*:\s*Motor/i.test(c.st ?? '') &&
				/m2\s*\(/i.test(c.st ?? '') &&
				/m3\s*\(/i.test(c.st ?? '')
		},
		runIt(
			'w Watch podejrzyj m1.Run, m2.Fault… — każda instancja ma swoje zmienne. Wyłącz Fb2 i uruchom taśmę 2.'
		),
		checkIt
	],

	'capstone-mixer': [
		{
			text: 'Sekwencja: `CASE step OF` z krokami dozowania A i B, grzania, mieszania i spustu.',
			done: (c) =>
				/CASE\s+\w+\s+OF/i.test(c.st ?? '') &&
				/Outlet\s*:=/i.test(c.st ?? '') &&
				/Heater\s*:=/i.test(c.st ?? '')
		},
		{
			text: 'Receptury z `RecipeNo` (1 i 2) i alarm przy złym numerze.',
			done: (c) =>
				/RecipeNo/i.test(c.st ?? '') && /22118/.test(c.st ?? '') && /16589/.test(c.st ?? '')
		},
		{
			text: 'Alarmy: 32767, `LevelOk`, grzanie > `T#120s`; kwitowanie `Ack`; lampka `Alarm`.',
			done: (c) =>
				/32767/.test(c.st ?? '') && /T#120s/i.test(c.st ?? '') && /Alarm\s*:=/i.test(c.st ?? '')
		},
		{
			text: 'Licznik partii w `VAR RETAIN`, wystawiony na `BatchCount`.',
			done: (c) => /VAR\s+RETAIN/i.test(c.st ?? '') && /BatchCount\s*:=/i.test(c.st ?? '')
		},
		{
			text: 'Panel HMI: pole receptury i alarmy z opisem dla operatora (widok HMI).',
			done: (c) => (c.hmi?.alarms.length ?? 0) >= 2
		},
		checkIt
	],

	'stl-pump': [
		{
			text: 'Nawias `A(` … `)` wokół Startu i podtrzymania, Stop za nawiasem.',
			done: (c) => {
				const code = (c.stl ?? '').replace(/\/\/.*$/gm, '');
				return /A\s*\(/i.test(code) && /\)\s*\n\s*A\s+"?Stop/i.test(code);
			}
		},
		checkIt
	],
	'brownfield-press': [
		{
			text: 'ZM-17/1: `Auto` (`I1.1`) uruchamia cykl obok Startu (nawias `A(` … `O I 1.1` … `)`).',
			done: (c) => /O\s+(I\s*1\.1|"?Auto"?)\b/i.test(c.stl ?? '')
		},
		{
			text: 'Warunek startu sprawdza detal `I 0.4` (PartPresent).',
			done: (c) => /A\s+(I\s*0\.4|"?PartPresent"?)\b/i.test(c.stl ?? '')
		},
		{
			text: 'ZM-17/2: licznik — `L MW 50`, `+I`, `T MW 50` raz na koniec cyklu.',
			done: (c) => /T\s+(MW\s*50|"?PartsGood"?)\b/i.test(c.stl ?? '') && /\+I/i.test(c.stl ?? '')
		},
		{
			text: 'Każda zmiana oznaczona komentarzem `ZM-17`.',
			done: (c) => ((c.stl ?? '').match(/ZM-17/g) ?? []).length >= 2
		},
		checkIt
	],

	'hw-config': [
		{
			text: 'Slot 3 (DQ 16) od adresu 0 — zawory pod `Q0.0` … `Q0.4`, jak w programie.',
			done: (c) => c.hw?.modules.find((m) => m.slot === 3)?.start === 0
		},
		{
			text: 'Karta AI od `IW64`; kanał 0 „4–20 mA” z diagnostyką przerwy.',
			done: (c) => {
				const m = c.hw?.modules.find((x) => x.slot === 4);
				return m?.start === 64 && m.ai?.[0]?.mode === 'I_4_20' && m.ai[0].diag;
			}
		},
		{
			text: 'Kanał 1 „RTD Pt100”, kanały 2 i 3 wyłączone.',
			done: (c) => {
				const ai = c.hw?.modules.find((x) => x.slot === 4)?.ai;
				return ai?.[1]?.mode === 'RTD' && ai[2]?.mode === 'off' && ai[3]?.mode === 'off';
			}
		},
		checkIt
	],

	'f-estop': [
		{
			text: 'Program standardowy nie pisze `K1` — steruje tylko `RunRequest`.',
			done: (c) =>
				!/\bK1\s*:=/i.test((c.st ?? '').replace(/\/\/.*$/gm, '')) &&
				/RunRequest\s*:=/i.test(c.st ?? '')
		},
		{
			text: 'Program F: `ESTOP1` z `F_EStop` i `ACK_NEC := TRUE`.',
			done: (c) =>
				/:\s*ESTOP1\b/i.test(c.safety ?? '') && /E_STOP\s*:=\s*F_EStop/i.test(c.safety ?? '')
		},
		{
			text: 'Program F: `FDBACK` z `FEEDBACK := NOT K1_FB` i `K1 := fdbK1.Q`.',
			done: (c) =>
				/:\s*FDBACK\b/i.test(c.safety ?? '') &&
				/FEEDBACK\s*:=\s*NOT\s+K1_FB/i.test(c.safety ?? '') &&
				/\bK1\s*:=/i.test(c.safety ?? '')
		},
		{
			text: 'Po kwitowaniu taśma nie rusza sama: `run` gaśnie, gdy `eStop1.Q = 0`.',
			done: (c) => /eStop1\.Q/i.test((c.st ?? '').replace(/\/\/.*$/gm, ''))
		},
		checkIt
	],

	'alarm-flood': [
		{
			text: 'Usuń „Zawór B zamknięty” — to stan, nie alarm.',
			done: (c) =>
				!!c.hmi?.alarms.length && !c.hmi.alarms.some((a) => a.tag.toUpperCase() === 'VALVEBCLOSED')
		},
		{
			text: '„Poziom powyżej 80 %”: opóźnienie przyjścia (≥ 2 s) przeciw miganiu.',
			done: (c) => {
				const a = c.hmi?.alarms.find((x) => x.tag.toUpperCase() === 'LEVELHIGH');
				return !!c.hmi?.alarms.length && (!a || (a.onDelayMs ?? 0) >= 2000);
			}
		},
		{
			text: '„Mieszadło nie pracuje”: tłumienie bitem `NotMixing`.',
			done: (c) => {
				const a = c.hmi?.alarms.find((x) => x.tag.toUpperCase() === 'STIRREROFF');
				return (
					!!c.hmi?.alarms.length && (!a || a.suppressTag?.trim().toUpperCase() === 'NOTMIXING')
				);
			}
		},
		{
			text: 'Każdy alarm ma reakcję operatora; najwyżej dwa P1, przepełnienie P1.',
			done: (c) => {
				const al = c.hmi?.alarms ?? [];
				return (
					al.length > 0 &&
					al.every((a) => a.action?.trim()) &&
					al.filter((a) => (a.priority ?? (a.kind === 'alarm' ? 2 : 3)) === 1).length <= 2 &&
					al.some((a) => a.tag.toUpperCase() === 'ALMOVERFILL' && a.priority === 1)
				);
			}
		},
		checkIt
	],

	'recipe-db': [
		{
			text: 'Typ `Recipe` (`TYPE … STRUCT`) z polem `Name : STRING[16]`.',
			done: (c) => /TYPE\s+Recipe\s*:/i.test(c.st ?? '') && /Name\s*:\s*STRING/i.test(c.st ?? '')
		},
		{
			text: 'Blok danych `Recipes` z `Items : ARRAY[1..3] OF Recipe` (RETAIN) i `Active : Recipe`.',
			done: (c) =>
				/DATA_BLOCK\s+Recipes/i.test(c.st ?? '') &&
				/Items\s*:\s*ARRAY\s*\[\s*1\s*\.\.\s*3\s*\]\s*OF\s+Recipe/i.test(c.st ?? '') &&
				/Active\s*:\s*Recipe/i.test(c.st ?? '')
		},
		{
			text: 'Receptury fabryczne w `OB100`, w tym `Krem`.',
			done: (c) => /ORGANIZATION_BLOCK\s+OB100/i.test(c.st ?? '') && /'Krem'/.test(c.st ?? '')
		},
		{
			text: 'Start kopiuje całą recepturę: `Recipes.Active := Recipes.Items[RecipeNo];`, kroki czytają `Recipes.Active`.',
			done: (c) =>
				/Recipes\.Active\s*:=\s*Recipes\.Items\s*\[/i.test(c.st ?? '') &&
				/Recipes\.Active\.LevelA/i.test(c.st ?? '') &&
				!/CASE\s+RecipeNo/i.test(c.st ?? '')
		},
		checkIt
	],

	'motion-pickplace': [
		{
			text: 'Osobne instancje `MC_MoveAbsolute` do odbioru (100 mm) i odkładania (800 mm), `Execute` z numeru kroku.',
			done: (c) =>
				((c.st ?? '').match(/:\s*MC_MoveAbsolute\s*;/gi) ?? []).length >= 2 &&
				/800\.0/.test(c.st ?? '')
		},
		{
			text: 'Chwytak: `Gripper := TRUE` w kroku chwytania, czekaj na `GripperClosed`, `FALSE` przy odkładaniu.',
			done: (c) =>
				/Gripper\s*:=\s*TRUE/i.test(c.st ?? '') &&
				/GripperClosed/i.test(c.st ?? '') &&
				/Gripper\s*:=\s*FALSE/i.test(c.st ?? '')
		},
		{
			text: 'Stop: `MC_Stop` w osobnym kroku i wznowienie od zapamiętanego kroku.',
			done: (c) => /:\s*MC_Stop\s*;/i.test(c.st ?? '') && /resume/i.test(c.st ?? '')
		},
		{
			text: 'Błąd osi: krok błędu, `MC_Reset` z `Ack`, lampka `AxisFault`.',
			done: (c) => /:\s*MC_Reset\s*;/i.test(c.st ?? '') && /AxisFault\s*:=/i.test(c.st ?? '')
		},
		checkIt
	],

	'change-management': [
		{
			text: 'Nadzór ruchu znów 2 s: `PT := T#2s`.',
			done: (c) => /moveTime\s*\([^;]*PT\s*:=\s*T#2s\s*\)/i.test(c.st ?? '')
		},
		{
			text: 'Brak powietrza w cyklu znów prowadzi do kroku błędu: `(moveTime.Q OR NOT AirOk)`.',
			done: (c) => /moveTime\.Q\s+OR\s+NOT\s+AirOk/i.test(c.st ?? '')
		},
		{
			text: 'Licznik ZM-12 (`PartsDone`) został.',
			done: (c) => /PartsDone\s*:=\s*PartsDone\s*\+\s*1/i.test(c.st ?? '')
		},
		{
			text: 'Nowa wersja zapisana, z opisem zmiany.',
			done: (c) => (c.history?.length ?? 0) >= 3 && !!c.history?.at(-1)?.comment.trim()
		},
		checkIt
	],

	'std-motor': [
		{
			text: '`Ready := Permit AND NOT Interlock AND NOT Fault;` i kasowanie alarmu: `IF Ack AND NOT Run THEN Fault := FALSE; END_IF;`',
			done: (c) =>
				/Ready\s*:=\s*Permit\s+AND\s+NOT\s+Interlock/i.test(c.st ?? '') &&
				/Ack\s+AND\s+NOT\s+Run/i.test(c.st ?? '')
		},
		{
			text: 'Tryb ręczny: zatrzask `manOn` z `ManStart` (tylko gdy `Ready`) i `ManStop`.',
			done: (c) =>
				/manOn\s*:=\s*TRUE/i.test(c.st ?? '') && /ManStart\s+AND\s+Ready/i.test(c.st ?? '')
		},
		{
			text: 'Rozkaz: blokada i alarm zatrzymują zawsze, w Auto `Run := Run OR Ready;`.',
			done: (c) => /Run\s*:=\s*Run\s+OR\s+Ready/i.test(c.st ?? '')
		},
		{
			text: 'Nadzór stycznika: `fbTimer(IN := Run AND NOT Feedback, PT := T#2s);` → `Fault := TRUE;`',
			done: (c) =>
				/fbTimer\s*\(\s*IN\s*:=\s*Run\s+AND\s+NOT\s+Feedback/i.test(c.st ?? '') &&
				/Fault\s*:=\s*TRUE/i.test(c.st ?? '')
		},
		runIt(
			'sprawdź tryby przełącznikami w Circuit: zabierz wodę w trakcie pracy, potem daj za wysokie ciśnienie.'
		),
		checkIt
	],

	'std-conveyors': [
		{
			text: 'Instancja C3 jako pierwsza: `c3(AutoCmd := lineOn, Permit := TRUE, Feedback := Fb3, …, Run => K3);`',
			done: (c) => /c3\s*\(\s*AutoCmd\s*:=\s*lineOn/i.test(c.st ?? '')
		},
		{
			text: 'Permisywy: `Permit := c3.Running` dla C2 i `Permit := c2.Running` dla C1.',
			done: (c) =>
				/Permit\s*:=\s*c3\.Running/i.test(c.st ?? '') &&
				/Permit\s*:=\s*c2\.Running/i.test(c.st ?? '')
		},
		{
			text: 'Blokady kaskady: `Interlock := c2.Run AND NOT c3.Running` i analogicznie dla C1.',
			done: (c) =>
				/Interlock\s*:=\s*c2\.Run\s+AND\s+NOT\s+c3\.Running/i.test(c.st ?? '') &&
				/Interlock\s*:=\s*c1\.Run\s+AND\s+NOT\s+c2\.Running/i.test(c.st ?? '')
		},
		{
			text: '`FaultLamp := c1.Fault OR c2.Fault OR c3.Fault;`',
			done: (c) => /FaultLamp\s*:=\s*c1\.Fault\s+OR\s+c2\.Fault\s+OR\s+c3\.Fault/i.test(c.st ?? '')
		},
		runIt('uruchom linię, potem w Circuit wyłącz Fb3 — zobacz, w jakiej kolejności stają taśmy.'),
		checkIt
	],

	'tank-fbd': [
		{
			text: 'Zaznacz pole wejścia networku i kliknij **SR** na palecie bloków.',
			done: (c) => !!srBox(c)
		},
		{
			text: 'Wejście `S1` = `Low` z **negacją** (zaznacz pin S1 → „¬ negacja”).',
			done: (c) => {
				const p = srBox(c)?.inputs.find((x) => x.name === 'S1');
				return !!p?.negated && p.value.kind === 'operand' && sameAddr(c, p.value.text, 'I0.0');
			}
		},
		{
			text: 'Wejście `R` = `High`.',
			done: (c) => {
				const p = srBox(c)?.inputs.find((x) => x.name === 'R');
				return !!p && p.value.kind === 'operand' && sameAddr(c, p.value.text, 'I0.1');
			}
		},
		runIt('obserwuj w widoku Process, jak pompa włącza się przy Low i wyłącza przy High.'),
		checkIt
	],

	'press-packml': [
		{
			text: 'Stop (NC) po `CASE`: ze stanów 15, 4 i 6 do `PackState := 7`, a w Stopping `7: IF home THEN PackState := 2;`.',
			done: (c) => /PackState\s*:=\s*7/i.test(c.st ?? '') && /7\s*:\s*IF\s+home/i.test(c.st ?? '')
		},
		{
			text: 'Abort: `NOT AirOk` → `PackState := 9`, z Aborted przez Reset do Clearing (1), potem Stopped.',
			done: (c) =>
				/PackState\s*:=\s*9/i.test(c.st ?? '') && /PackState\s*:=\s*1\s*;/i.test(c.st ?? '')
		},
		{
			text: 'Blokady na końcu: `IF NOT A_Extended THEN Press := FALSE;` i `IF NOT B_Retracted THEN Clamp := TRUE;`.',
			done: (c) =>
				/NOT\s+A_Extended\s+THEN\s+Press\s*:=\s*FALSE/i.test(c.st ?? '') &&
				/NOT\s+B_Retracted\s+THEN\s+Clamp\s*:=\s*TRUE/i.test(c.st ?? '')
		},
		{
			text: 'Tryb ręczny: `UnitMode` zmieniany tylko w Stopped, w ręcznym Execute `Clamp := JogClamp; Press := JogPress;`.',
			done: (c) =>
				/UnitMode\s*:=\s*3/i.test(c.st ?? '') && /Press\s*:=\s*JogPress/i.test(c.st ?? '')
		},
		{
			text: 'Zanik zasilania: `VAR RETAIN` dla `partsGood` i `PackState := 2` w OB100.',
			done: (c) =>
				/VAR\s+RETAIN/i.test(c.st ?? '') && /ORGANIZATION_BLOCK\s+OB100/i.test(c.st ?? '')
		},
		checkIt
	],

	'pneumatic-press': [
		{
			text: 'Dokończ kroki: `20` czeka na `B_Extended`, `30` na `B_Retracted`, `40` na `A_Retracted`.',
			done: (c) =>
				/20\s*:\s*IF\s+B_Extended/i.test(c.st ?? '') &&
				/30\s*:\s*IF\s+B_Retracted/i.test(c.st ?? '') &&
				/40\s*:\s*IF\s+A_Retracted/i.test(c.st ?? '')
		},
		{
			text: 'Nadzór ruchu: timer `moveTime` z `PT := T#2s`, restartowany przy zmianie kroku.',
			done: (c) => /moveTime\s*\(/i.test(c.st ?? '') && /PT\s*:=\s*T#2s/i.test(c.st ?? '')
		},
		{
			text: 'Krok błędu `99`: alarm, a po `Ack` i z powietrzem powrót do `30`.',
			done: (c) =>
				/step\s*:=\s*99/i.test(c.st ?? '') &&
				/99\s*:\s*IF[^;]*Ack/i.test(c.st ?? '') &&
				/Alarm\s*:=\s*step\s*=\s*99/i.test(c.st ?? '')
		},
		{
			text: 'Tryb `Auto`: start także bez przycisku — `(startEdge.Q OR Auto) AND …`.',
			done: (c) => /OR\s+Auto\b/i.test(c.st ?? '')
		},
		runIt(
			'w widoku Process włącz Auto, potem w „Czujniki i usterki” wyłącz powietrze w trakcie cyklu.'
		),
		checkIt
	],

	'mixer-batch': [
		{
			text: 'Krok `Heat` z akcjami N `Stirrer` i N `Heater`, przejście z `FillB` przy `Level >= 22118`.',
			done: (c) => {
				const h = c.sfc?.steps.find((s) => s.name.toUpperCase() === 'HEAT');
				const ops = h?.actions.map((a) => a.operand.toUpperCase()) ?? [];
				return ops.includes('STIRRER') && ops.includes('HEATER');
			}
		},
		{
			text: 'Krok `Mix` (N `Stirrer`), przejście `Heat → Mix` przy `Temperature >= 500`, a dalej `Mix.T >= T#5s`.',
			done: (c) =>
				!!c.sfc?.transitions.some((t) => /Temperature\s*>=\s*500/i.test(t.condition)) &&
				!!c.sfc?.transitions.some((t) => /Mix\.T\s*>=\s*T#5s/i.test(t.condition))
		},
		{
			text: 'Krok `Drain` (N `Outlet`) i powrót do `Idle` przy `Level <= 276`.',
			done: (c) =>
				!!c.sfc?.steps.some(
					(s) =>
						s.name.toUpperCase() === 'DRAIN' && s.actions.some((a) => /Outlet/i.test(a.operand))
				) && !!c.sfc?.transitions.some((t) => t.to.some((n) => /Idle/i.test(n)))
		},
		{
			text: 'Logika stała: alarm przy `Level >= 32767`, a przy alarmie zamknięte zawory i wyłączona grzałka.',
			done: (c) =>
				/32767/.test(c.sfc?.logic ?? '') &&
				/ValveA\s*:=\s*FALSE/i.test(c.sfc?.logic ?? '') &&
				/Heater\s*:=\s*FALSE/i.test(c.sfc?.logic ?? '')
		},
		runIt('zrób partię, a przy następnej zerwij przewód IW4 w „Czujniki i usterki”.'),
		checkIt
	],

	'recipe-index': [
		{
			text: 'Sprawdź zakres przed indeksem: `IF RecipeNo >= 1 AND RecipeNo <= 3 THEN …`',
			done: (c) => /RecipeNo\s*>=\s*1/i.test(c.st ?? '') && /RecipeNo\s*<=\s*3/i.test(c.st ?? '')
		},
		{
			text: 'Przy złej wartości zapal `BadRecipe`, przy dobrej zgaś.',
			done: (c) =>
				/BadRecipe\s*:=\s*TRUE/i.test(c.st ?? '') && /BadRecipe\s*:=\s*FALSE/i.test(c.st ?? '')
		},
		{
			text: 'Dodaj siatkę bezpieczeństwa: `ORGANIZATION_BLOCK OB121` … `END_ORGANIZATION_BLOCK`.',
			done: (c) => /ORGANIZATION_BLOCK\s+OB121/i.test(c.st ?? '')
		},
		runIt(
			'w widoku Diagnostics zobacz bufor diagnostyczny; wpisz w Watch RecipeNo = 7 — CPU pracuje dalej.'
		),
		checkIt
	],

	'oven-filter': [
		{
			text: 'W `CYCLIC_INTERRUPT` zapisz próbkę: `buf[pos] := Temperature;` i przesuń `pos` z powrotem do 0 po 9.',
			done: (c) =>
				/buf\s*\[\s*pos\s*\]\s*:=\s*Temperature/i.test(c.st ?? '') &&
				/pos\s*:=\s*0/i.test(c.st ?? '')
		},
		{
			text: 'Policz średnią: suma w pętli `FOR i := 0 TO 9` i `Avg := DINT_TO_INT(sum / 10);`',
			done: (c) => /FOR\s+i\s*:=\s*0\s+TO\s+9/i.test(c.st ?? '') && /Avg\s*:=/i.test(c.st ?? '')
		},
		{
			text: 'Alarm z histerezą: włącz powyżej `2500`, wyłącz poniżej `2300`.',
			done: (c) => /2500/.test(c.st ?? '') && /2300/.test(c.st ?? '')
		},
		{
			text: 'Licznik `alarms` przenieś do `VAR RETAIN` i zwiększaj go na zboczu alarmu (`R_TRIG`).',
			done: (c) =>
				/VAR\s+RETAIN((?!END_VAR)[^])*\balarms\s*:/i.test(c.st ?? '') &&
				/alarms\s*:=\s*alarms\s*\+\s*1/i.test(c.st ?? '')
		},
		runIt(
			'włącz HeatOn i obserwuj Temperature i Avg w Watch; obok statusu PLC widać licznik OB30. Zatrzymaj i uruchom PLC — AlarmCount zostaje.'
		),
		checkIt
	],

	'oven-pid-lad': [
		{
			text: 'Wstaw blok **PID** (paleta „Blocks → FB…”) w nowym networku z cewką, np. `PidOn`.',
			done: (c) => !!pidBlock(c)
		},
		{
			text: 'Piny procesu: `PV` = `Temperature`, `OUT ⇒` `HeaterPower`, `SP` = `1800`, `OUT_HI` = `27648.0`.',
			done: (c) => {
				const b = pidBlock(c);
				return (
					!!b &&
					sameAddr(c, b.pins.PV ?? '', 'IW4') &&
					sameAddr(c, b.pins['>OUT'] ?? '', 'QW4') &&
					Number(b.pins.SP) === 1800 &&
					Number(b.pins.OUT_HI) === 27648
				);
			}
		},
		{
			text: 'Nastawy: `KP` między 40 a 170, `TI` między 4 a 20 s.',
			done: (c) => {
				const b = pidBlock(c);
				return !!b && inRange(Number(b.pins.KP), 40, 170) && inRange(Number(b.pins.TI), 4, 20);
			}
		},
		runIt('w widoku Process obserwuj temperaturę i trend; włóż zimny wsad.'),
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
