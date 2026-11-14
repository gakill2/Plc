/**
 * Just-in-time tips: short notes that pop up the first time you do something
 * in the editor (first timer, a Stop contact, a drive in the circuit, …).
 * Each one links to the chapter that explains it properly.
 */
import type { Circuit } from '#lib/circuit/model.js';
import type { Hmi } from '#lib/hmi/model.js';
import type { Coil, Element, LadderProgram } from '#lib/ladder/model.js';
import type { SymbolMap } from '#lib/symbols/symbols.js';

export type TipInput = {
	ladder: LadderProgram;
	circuit: Circuit;
	/** Symbol name → address. */
	symbols: SymbolMap;
	hmi?: Hmi;
	language: 'ladder' | 'st';
	online: boolean;
	forces: number;
};

export type Tip = {
	id: string;
	title: string;
	text: string;
	/** Chapter slug with the full explanation. */
	chapter: string;
	when: (s: TipInput) => boolean;
};

/* ---------- helpers over the program ---------- */

function elements(program: LadderProgram): Element[] {
	const out: Element[] = [];
	const walk = (items: Element[]) => {
		for (const e of items) {
			out.push(e);
			if (e.kind === 'parallel') for (const b of e.branches) walk(b.items);
		}
	};
	for (const r of program.rungs) walk(r.logic.items);
	return out;
}

const coils = (program: LadderProgram): Coil[] => program.rungs.flatMap((r) => r.coils);

/** Every name an operand goes by: the text itself plus symbols for the same address. */
function names(operand: string, symbols: SymbolMap): string[] {
	const text = operand.trim();
	const address = (symbols.get(text) ?? text).toUpperCase();
	const out = [text];
	for (const [name, addr] of symbols) if (addr.toUpperCase() === address) out.push(name);
	return out;
}

const isStop = (operand: string, symbols: SymbolMap) =>
	names(operand, symbols).some((n) => /stop/i.test(n) && !/e.?stop|emerg|awar/i.test(n));

const hasDevice = (s: TipInput, ...types: string[]) =>
	s.circuit.devices.some((d) => types.includes(d.type));

/** Two plain coils writing the same address in different rungs. */
function doubleCoil(s: TipInput): boolean {
	const seen: string[] = [];
	for (const r of s.ladder.rungs) {
		const here = r.coils
			.filter((c) => c.type === 'COIL' || c.type === 'NCOIL')
			.map((c) => (s.symbols.get(c.operand.trim()) ?? c.operand.trim()).toUpperCase())
			.filter((a) => a);
		if (here.some((a) => seen.includes(a))) return true;
		seen.push(...here);
	}
	return false;
}

const ladder = (s: TipInput) => s.language === 'ladder';

/* ---------- the tips, roughly in the order a beginner meets them ---------- */

export const TIPS: Tip[] = [
	{
		id: 'first-run',
		title: 'Sterownik w trybie RUN',
		text: 'Program liczy się w kółko: odczyt wejść → program → zapis wyjść. Zielone styki to te, przez które „płynie prąd” w tym cyklu.',
		chapter: 'cykl-skanowania',
		when: (s) => s.online
	},
	{
		id: 'stop-nc-program',
		title: 'Styk NC na przycisku Stop?',
		text: 'Jeśli Stop jest podłączony stykiem NC (tak się robi — fail-safe), to w spoczynku na wejściu jest 1. W programie użyj wtedy zwykłego styku NO. Styk NC na NC to podwójna negacja: maszyna nie ruszy.',
		chapter: 'bezpieczenstwo',
		when: (s) =>
			ladder(s) &&
			elements(s.ladder).some(
				(e) => e.kind === 'contact' && e.type === 'NC' && isStop(e.operand, s.symbols)
			) &&
			!s.circuit.devices.some((d) => d.type === 'pushbutton' && /stop/i.test(d.label) && !d.nc)
	},
	{
		id: 'stop-wired-no',
		title: 'Stop podłączaj jako NC',
		text: 'Przycisk Stop w obwodzie jest podłączony stykiem NO. Gdy przewód się zerwie, maszyny nie da się zatrzymać. Zaznacz „NC” w ustawieniach przycisku i zmień styk w programie na NO.',
		chapter: 'bezpieczenstwo',
		when: (s) =>
			s.circuit.devices.some((d) => d.type === 'pushbutton' && /stop/i.test(d.label) && !d.nc)
	},
	{
		id: 'branch',
		title: 'Gałąź równoległa = LUB',
		text: 'Styki obok siebie w szeregu to I (AND), gałęzie równoległe to LUB (OR). Styk cewki równolegle do Startu to podtrzymanie.',
		chapter: 'logika',
		when: (s) => ladder(s) && elements(s.ladder).some((e) => e.kind === 'parallel')
	},
	{
		id: 'double-coil',
		title: 'Ta sama cewka w dwóch miejscach',
		text: 'Dwie cewki z tym samym adresem: wygrywa ta, która jest niżej w programie, a pierwsza „nic nie robi”. Połącz warunki gałęzią LUB w jednym networku.',
		chapter: 'logika',
		when: (s) => ladder(s) && doubleCoil(s)
	},
	{
		id: 'set-reset',
		title: 'SET i RESET pamiętają stan',
		text: 'SET włącza i zostawia włączone, RESET wyłącza. Gdy oba są aktywne w tym samym cyklu, wygrywa ten niżej w programie — Stop dawaj za Startem.',
		chapter: 'podtrzymanie',
		when: (s) => ladder(s) && coils(s.ladder).some((c) => c.type === 'SET' || c.type === 'RESET')
	},
	{
		id: 'edge',
		title: 'Zbocze to jeden cykl',
		text: 'Styk P daje 1 tylko w cyklu, w którym sygnał zmienił się z 0 na 1 (N — z 1 na 0). Idealny do liczenia i przełączania, ale nie do zasilania timera TON.',
		chapter: 'zbocza',
		when: (s) =>
			ladder(s) &&
			elements(s.ladder).some((e) => e.kind === 'contact' && (e.type === 'P' || e.type === 'N'))
	},
	{
		id: 'timer',
		title: 'TON, TOF czy TP?',
		text: 'TON — opóźnione włączenie (IN musi trwać cały czas PT). TOF — opóźnione wyłączenie. TP — impuls o stałej długości, nawet z krótkiego sygnału. ET pokazuje, ile już odliczył.',
		chapter: 'timery',
		when: (s) => ladder(s) && elements(s.ladder).some((e) => e.kind === 'timer')
	},
	{
		id: 'counter',
		title: 'Licznik liczy zbocza',
		text: 'CTU dodaje 1 przy każdym narastającym zboczu wejścia, wyjście Q włącza się przy CV ≥ PV. Nie zapomnij o kasowaniu (R) — np. na początku zmiany.',
		chapter: 'liczniki',
		when: (s) => ladder(s) && elements(s.ladder).some((e) => e.kind === 'counter')
	},
	{
		id: 'compare',
		title: 'Porównania na liczbach',
		text: 'Blok porównania przewodzi, gdy warunek jest spełniony. Porównuj słowa (IW, MW, DB) albo czas ET timera — tak buduje się progi i sekwencje.',
		chapter: 'liczby-i-analog',
		when: (s) => ladder(s) && elements(s.ladder).some((e) => e.kind === 'compare')
	},
	{
		id: 'move-math',
		title: 'Słowa, nie bity',
		text: 'MOVE i bloki matematyczne pracują na słowach 16-bitowych. Sygnał analogowy 0–10 V to 0–27648 — przelicz go na jednostki procesu (skalowanie).',
		chapter: 'liczby-i-analog',
		when: (s) => ladder(s) && elements(s.ladder).some((e) => e.kind === 'move' || e.kind === 'math')
	},
	{
		id: 'comments',
		title: 'Opisuj networki',
		text: 'Kilka networków bez komentarza to jeszcze nic, ale za pół roku (albo kolega z utrzymania ruchu) nie będziesz wiedzieć, co robią. Dodaj jedno zdanie nad każdym.',
		chapter: 'organizacja',
		when: (s) =>
			ladder(s) && s.ladder.rungs.length >= 5 && s.ladder.rungs.every((r) => !r.comment.trim())
	},
	{
		id: 'st',
		title: 'Structured Text',
		text: 'Ten sam sterownik, inny zapis: IF … THEN, pętle i wyrażenia. Wygodny do obliczeń i receptur; drabinka wygrywa w prostej logice i przy diagnozie na obiekcie.',
		chapter: 'structured-text',
		when: (s) => s.language === 'st'
	},
	{
		id: 'force',
		title: 'Wymuszenie to nie naprawa',
		text: 'Force nadpisuje sygnał niezależnie od programu i obiektu. Na uruchomieniu to przydatne narzędzie, ale zawsze zdejmij wymuszenia przed oddaniem maszyny.',
		chapter: 'uruchomienie',
		when: (s) => s.forces > 0
	},
	{
		id: 'contactor',
		title: 'Stycznik i styk zwrotny',
		text: 'Wyjście PLC nie zasila silnika — włącza cewkę stycznika. Styk pomocniczy stycznika na wejściu potwierdza, że naprawdę zadziałał.',
		chapter: 'elektryka',
		when: (s) => hasDevice(s, 'contactor')
	},
	{
		id: 'sensor',
		title: 'Czujnik PNP czy NPN',
		text: 'Czujniki indukcyjne i optyczne mają wyjście tranzystorowe. W Europie standardem jest PNP: przy wykryciu daje +24 V na wejście sterownika.',
		chapter: 'elektryka',
		when: (s) => hasDevice(s, 'sensor', 'limit')
	},
	{
		id: 'estop',
		title: 'E-stop to nie zwykły Stop',
		text: 'Wyłącznik awaryjny działa w osobnym obwodzie bezpieczeństwa (przekaźnik lub sterownik bezpieczeństwa). PLC tylko dostaje informację o jego stanie.',
		chapter: 'bezpieczenstwo',
		when: (s) => hasDevice(s, 'estop')
	},
	{
		id: 'vfd',
		title: 'Falownik w obwodzie',
		text: 'Do falownika idą RUN / REV i prędkość zadana w słowie analogowym (27648 = 50 Hz). Z powrotem: gotowość, awaria i prędkość rzeczywista. Błąd skasujesz tylko przy zdjętym RUN.',
		chapter: 'falownik',
		when: (s) => hasDevice(s, 'vfd')
	},
	{
		id: 'hmi',
		title: 'Panel pisze do markerów',
		text: 'Przycisk na HMI zapisuje bit M, nie wejście I. Program łączy go z przyciskami na szafie — a twardy Stop zawsze zostaje na szafie.',
		chapter: 'panel-hmi',
		when: (s) =>
			!!s.hmi?.widgets.some((w) => w.kind === 'button' || w.kind === 'switch' || w.kind === 'input')
	},
	{
		id: 'alarms',
		title: 'Alarm trzeba pokwitować',
		text: 'Alarm zostaje na liście, dopóki operator go nie pokwituje — nawet jeśli przyczyna już ustąpiła. Dzięki temu nic nie umknie zmianie.',
		chapter: 'panel-hmi',
		when: (s) => (s.hmi?.alarms.length ?? 0) > 0
	}
];

/** The first tip that applies and hasn't been seen yet. */
export const nextTip = (state: TipInput, seen: readonly string[]) =>
	TIPS.find((t) => !seen.includes(t.id) && t.when(state)) ?? null;

/* ---------- storage ---------- */

const SEEN = 'plcsim:tips-seen';
const OFF = 'plcsim:tips-off';

export function seenTips(storage: Pick<Storage, 'getItem'> = localStorage): string[] {
	try {
		const list = JSON.parse(storage.getItem(SEEN) ?? '[]');
		return Array.isArray(list) ? list.filter((x) => typeof x === 'string') : [];
	} catch {
		return [];
	}
}

export function markTipSeen(
	id: string,
	storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage
) {
	const list = seenTips(storage);
	if (!list.includes(id)) storage.setItem(SEEN, JSON.stringify([...list, id]));
}

export const tipsOff = (storage: Pick<Storage, 'getItem'> = localStorage) =>
	storage.getItem(OFF) === '1';

export const setTipsOff = (off: boolean, storage: Pick<Storage, 'setItem'> = localStorage) =>
	storage.setItem(OFF, off ? '1' : '0');
