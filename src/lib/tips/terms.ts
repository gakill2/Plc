/**
 * Abbreviations that get a hover / focus explanation wherever they appear
 * in tutorial prose, lesson text and tips.
 */
export type Term = { name: string; text: string; chapter?: string };

export const TERMS: Record<string, Term> = {
	PLC: {
		name: 'Programmable Logic Controller',
		text: 'Sterownik programowalny — komputer przemysłowy, który w stałym cyklu czyta wejścia, liczy program i ustawia wyjścia.',
		chapter: 'czym-jest-plc'
	},
	HMI: {
		name: 'Human–Machine Interface',
		text: 'Panel operatorski: ekran z przyciskami, wartościami i alarmami.',
		chapter: 'panel-hmi'
	},
	SCADA: {
		name: 'Supervisory Control and Data Acquisition',
		text: 'System nadrzędny: wizualizacja i archiwizacja całego zakładu na komputerach.',
		chapter: 'panel-hmi'
	},
	VFD: {
		name: 'Variable Frequency Drive',
		text: 'Falownik — zmienia częstotliwość zasilania silnika, a więc jego prędkość.',
		chapter: 'falownik'
	},
	NO: {
		name: 'Normally Open',
		text: 'Styk normalnie otwarty: przewodzi, gdy sygnał = 1.',
		chapter: 'styki-i-cewki'
	},
	NC: {
		name: 'Normally Closed',
		text: 'Styk normalnie zamknięty: przewodzi, gdy sygnał = 0. Przycisk Stop podłącza się NC (fail-safe).',
		chapter: 'styki-i-cewki'
	},
	TON: {
		name: 'Timer On-delay',
		text: 'Opóźnione włączenie: Q = 1, gdy IN trwa nieprzerwanie przez czas PT.',
		chapter: 'timery'
	},
	TOF: {
		name: 'Timer Off-delay',
		text: 'Opóźnione wyłączenie: Q zostaje 1 jeszcze przez PT po zaniku IN.',
		chapter: 'timery'
	},
	TP: {
		name: 'Timer Pulse',
		text: 'Impuls: zbocze na IN daje Q = 1 przez dokładnie PT.',
		chapter: 'timery'
	},
	CTU: {
		name: 'Count Up',
		text: 'Licznik w górę: +1 na każde zbocze narastające, Q = 1 przy CV ≥ PV.',
		chapter: 'liczniki'
	},
	CTD: {
		name: 'Count Down',
		text: 'Licznik w dół: −1 na każde zbocze, Q = 1 przy CV ≤ 0.',
		chapter: 'liczniki'
	},
	PT: { name: 'Preset Time', text: 'Czas zadany timera, np. T#3s.', chapter: 'timery' },
	ET: { name: 'Elapsed Time', text: 'Czas, który timer już odliczył.', chapter: 'timery' },
	PV: {
		name: 'Preset Value / Process Value',
		text: 'W licznikach: wartość zadana. W regulacji: wartość mierzona procesu.',
		chapter: 'liczniki'
	},
	CV: { name: 'Current Value', text: 'Bieżący stan licznika.', chapter: 'liczniki' },
	SP: {
		name: 'Setpoint',
		text: 'Wartość zadana — do jakiej wartości regulator ma doprowadzić proces.',
		chapter: 'regulacja'
	},
	PID: {
		name: 'Proportional–Integral–Derivative',
		text: 'Regulator ciągły: liczy wyjście z uchybu, jego całki i pochodnej.',
		chapter: 'regulacja'
	},
	RLO: {
		name: 'Result of Logic Operation',
		text: 'Wynik operacji logicznej — „czy prąd dopłynął” do danego miejsca networku.',
		chapter: 'styki-i-cewki'
	},
	PNP: {
		name: 'czujnik „plusujący”',
		text: 'Wyjście czujnika podaje +24 V przy wykryciu. Standard w Europie.',
		chapter: 'elektryka'
	},
	NPN: {
		name: 'czujnik „minusujący”',
		text: 'Wyjście czujnika zwiera do 0 V przy wykryciu. Częsty w Azji.',
		chapter: 'elektryka'
	},
	FB: {
		name: 'Function Block',
		text: 'Blok funkcyjny z własną pamięcią (instancją) — jak timer.',
		chapter: 'organizacja'
	},
	FC: { name: 'Function', text: 'Funkcja bez pamięci między wywołaniami.', chapter: 'organizacja' },
	OB: {
		name: 'Organization Block',
		text: 'Blok wywoływany przez system sterownika, np. OB1 — główny cykl.',
		chapter: 'organizacja'
	},
	DB: {
		name: 'Data Block',
		text: 'Blok danych — nazwane zmienne programu.',
		chapter: 'organizacja'
	},
	ST: {
		name: 'Structured Text',
		text: 'Tekstowy język IEC 61131-3 podobny do Pascala.',
		chapter: 'structured-text'
	},
	LAD: {
		name: 'Ladder Diagram',
		text: 'Drabinka — graficzny język styków i cewek.',
		chapter: 'styki-i-cewki'
	},
	FBD: {
		name: 'Function Block Diagram',
		text: 'Język bloków funkcyjnych (bramki i bloki połączone liniami).',
		chapter: 'organizacja'
	},
	SFC: {
		name: 'Sequential Function Chart',
		text: 'Język sekwencji: kroki i przejścia (GRAFCET).',
		chapter: 'sekwencje'
	},
	IEC: {
		name: 'International Electrotechnical Commission',
		text: 'Norma IEC 61131-3 opisuje języki programowania PLC.',
		chapter: 'czym-jest-plc'
	},
	FAT: {
		name: 'Factory Acceptance Test',
		text: 'Odbiór u producenta — test maszyny przed wysyłką.',
		chapter: 'uruchomienie'
	},
	SAT: {
		name: 'Site Acceptance Test',
		text: 'Odbiór na obiekcie, po montażu u klienta.',
		chapter: 'uruchomienie'
	},
	ACK: { name: 'Acknowledge', text: 'Pokwitowanie alarmu przez operatora.', chapter: 'panel-hmi' },
	PWM: {
		name: 'Pulse Width Modulation',
		text: 'Sterowanie mocą przez szybkie włączanie i wyłączanie z regulowanym wypełnieniem.',
		chapter: 'liczby-i-analog'
	},
	EDM: {
		name: 'External Device Monitoring',
		text: 'Sprzężenie zwrotne styczników do przekaźnika bezpieczeństwa: zgrzany stycznik blokuje reset.',
		chapter: 'bezpieczenstwo-maszyn'
	},
	SIL: {
		name: 'Safety Integrity Level',
		text: 'Poziom nienaruszalności bezpieczeństwa (IEC 62061), odpowiednik PL z ISO 13849.',
		chapter: 'bezpieczenstwo-maszyn'
	},
	GSDML: {
		name: 'General Station Description Markup Language',
		text: 'Plik opisu urządzenia Profinet — importujesz go do projektu sterownika.',
		chapter: 'komunikacja'
	},
	MBAP: {
		name: 'Modbus Application Protocol header',
		text: 'Nagłówek Modbus TCP: ID transakcji, protokół, długość, ID jednostki.',
		chapter: 'komunikacja'
	},
	SSR: {
		name: 'Solid State Relay',
		text: 'Przekaźnik półprzewodnikowy — bez styków, do częstego przełączania (np. grzałek).',
		chapter: 'elektryka'
	}
};

export type TermPart = { t: string; term?: Term; key?: string };

const RE = new RegExp(`(?<![\\p{L}\\d_])(${Object.keys(TERMS).join('|')})(?![\\p{L}\\d_])`, 'gu');

/** Split plain text into pieces, marking known abbreviations. */
export function splitTerms(text: string): TermPart[] {
	const out: TermPart[] = [];
	let last = 0;
	for (const m of text.matchAll(RE)) {
		if (m.index > last) out.push({ t: text.slice(last, m.index) });
		out.push({ t: m[0], term: TERMS[m[0]], key: m[0] });
		last = m.index + m[0].length;
	}
	if (last < text.length) out.push({ t: text.slice(last) });
	return out;
}
