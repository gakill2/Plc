import { CHAPTERS } from './chapters.js';

/*
 * Mixed review ("powtórka"): short sessions of questions drawn from the chapters you have
 * started, preferring questions you got wrong and ones you have not seen for a while —
 * a light version of spaced repetition. Stats live in localStorage.
 */

export interface ReviewItem {
	id: string;
	chapter: string;
	chapterTitle: string;
	question: string;
	options: string[];
	correct: number;
	explanation: string;
}

export interface ItemStats {
	right: number;
	wrong: number;
	/** ms timestamp of the last answer */
	seen: number;
}

type Extra = Omit<ReviewItem, 'id' | 'chapterTitle'>;

/** Questions only used in review — the chapters' own quizzes are reused too. */
const EXTRA: Extra[] = [
	{
		chapter: 'cykl-skanowania',
		question:
			'Przycisk na I0.0 zmienia stan w połowie wykonywania programu. Kiedy program to zobaczy?',
		options: [
			'Od razu, w następnej instrukcji',
			'Dopiero w następnym cyklu — wejścia są czytane raz, na początku cyklu',
			'Nigdy, jeśli zmiana trwała krócej niż 1 s'
		],
		correct: 1,
		explanation:
			'Program pracuje na **obrazie wejść** skopiowanym na początku cyklu. Zmiana na zacisku trafi do programu przy następnym odczycie.'
	},
	{
		chapter: 'cykl-skanowania',
		question: 'Dwa networki zapisują tę samą cewkę Q0.0. Co pojawi się na wyjściu?',
		options: [
			'Wynik pierwszego networku',
			'Wynik ostatniego networku — wcześniejszy zapis zostaje nadpisany w tym samym cyklu',
			'Suma logiczna (OR) obu'
		],
		correct: 1,
		explanation:
			'Wyjścia są wysyłane na zaciski dopiero na końcu cyklu, więc liczy się ostatni zapis. To dlatego „podwójna cewka” jest błędem.'
	},
	{
		chapter: 'adresowanie',
		question: 'Co ma wspólnego MW10 z MB11?',
		options: [
			'Nic, to różne obszary pamięci',
			'MW10 to bajty MB10 i MB11 — zapis do MW10 zmienia też MB11',
			'MB11 to bit 11 słowa MW10'
		],
		correct: 1,
		explanation:
			'Słowo (W) zajmuje 2 bajty: MW10 = MB10 + MB11. Kolejne słowo bez nakładania to MW12.'
	},
	{
		chapter: 'adresowanie',
		question: 'Ile bitów ma adres I0.7 i co oznacza „7”?',
		options: [
			'To bajt numer 7',
			'To jeden bit: bajt 0, bit 7 (ósmy i ostatni bit bajtu)',
			'To 7 bitów od I0.0 do I0.6'
		],
		correct: 1,
		explanation: 'Format bitu to bajt.bit, a bity w bajcie mają numery 0–7.'
	},
	{
		chapter: 'styki-i-cewki',
		question: 'Czujnik daje 1, gdy widzi detal. Jaki styk przewodzi, gdy detalu NIE ma?',
		options: ['Styk NO ┤ ├', 'Styk NC ┤/├', 'Cewka ( )'],
		correct: 1,
		explanation:
			'Styk rozwierny (NC) przewodzi, gdy jego bit = 0. Rodzaj styku w programie wybierasz według tego, kiedy ma przewodzić.'
	},
	{
		chapter: 'podtrzymanie',
		question:
			'Program: network 1 — Stop → (R) Motor, network 2 — Start → (S) Motor. Oba przyciski wciśnięte. Co robi silnik?',
		options: [
			'Stoi, bo RESET ma zawsze pierwszeństwo',
			'Pracuje, bo SET jest wykonany ostatni',
			'Na zmianę włącza się i wyłącza'
		],
		correct: 1,
		explanation:
			'Pierwszeństwo wynika z kolejności: wygrywa ostatni zapis w cyklu. Żeby Stop wygrywał, RESET musi być niżej (albo Stop ma blokować SET).'
	},
	{
		chapter: 'zbocza',
		question: 'Ile cykli trwa sygnał ze styku ┤P├, gdy przycisk trzymasz 2 sekundy?',
		options: [
			'Cały czas trzymania',
			'Dokładnie jeden cykl',
			'Dwa cykle: przy wciśnięciu i puszczeniu'
		],
		correct: 1,
		explanation: 'Zbocze narastające to 1 tylko w cyklu, w którym sygnał zmienił się z 0 na 1.'
	},
	{
		chapter: 'timery',
		question: 'Lampka ma świecić jeszcze 5 s po wyłączeniu wentylatora. Który timer?',
		options: ['TON', 'TOF', 'TP'],
		correct: 1,
		explanation:
			'TOF (opóźnione wyłączenie): wyjście jest 1 razem z wejściem i zostaje jeszcze przez PT po jego zaniku.'
	},
	{
		chapter: 'timery',
		question: 'Wejście TON (PT = 3 s) było włączone 2 s, potem na chwilę zgasło. Co z ET?',
		options: [
			'Zostaje 2 s i liczy dalej od tego miejsca',
			'Wraca do 0 — TON liczy tylko nieprzerwany czas',
			'Wyjście Q włącza się od razu'
		],
		correct: 1,
		explanation:
			'Zanik wejścia zeruje TON. Do zliczania czasu z przerwami służy inny blok (np. TONR w niektórych sterownikach).'
	},
	{
		chapter: 'liczniki',
		question: 'Co zeruje licznik CTU?',
		options: ['Osiągnięcie PV', 'Sygnał na wejściu R (reset)', 'Każdy nowy cykl PLC'],
		correct: 1,
		explanation: 'Po osiągnięciu PV licznik liczy dalej (Q = 1). Zeruje go dopiero wejście R.'
	},
	{
		chapter: 'structured-text',
		question: 'Który zapis w ST odpowiada networkowi ┤A├ ┤/B├ → (Y)?',
		options: ['Y := A OR NOT B;', 'Y := A AND NOT B;', 'IF A THEN Y := B; END_IF;'],
		correct: 1,
		explanation: 'Szeregowo = AND, styk NC = NOT.'
	},
	{
		chapter: 'bezpieczenstwo',
		question: 'Przewód od przycisku Stop (podłączonego NC) został przerwany. Co się stanie?',
		options: [
			'Nic — maszyna pracuje dalej',
			'Wejście dostaje 0, czyli tak jak wciśnięty Stop — maszyna się zatrzyma',
			'Sterownik zgłosi błąd i zrestartuje się'
		],
		correct: 1,
		explanation:
			'To właśnie zaleta podłączenia NC (fail-safe): każda typowa usterka okablowania prowadzi do stanu bezpiecznego.'
	},
	{
		chapter: 'sekwencje',
		question: 'W programie krokowym aktywne są naraz dwa kroki. Co jest najczęstszą przyczyną?',
		options: [
			'Za długi czas cyklu',
			'Przejście ustawia następny krok (S), ale nie kasuje bieżącego (R)',
			'Za mało markerów w pamięci'
		],
		correct: 1,
		explanation:
			'Każde przejście to para: SET następnego kroku i RESET bieżącego. Bez RESET kroki się „sumują”.'
	}
];

export function reviewItems(): ReviewItem[] {
	const title = (slug: string) => CHAPTERS.find((c) => c.slug === slug)?.title ?? slug;
	const fromChapters = CHAPTERS.flatMap((c) =>
		c.blocks
			.filter((b) => b.kind === 'quiz')
			.map((b, i) => ({
				id: `${c.slug}:${i}`,
				chapter: c.slug,
				chapterTitle: c.title,
				question: b.question,
				options: b.options,
				correct: b.correct,
				explanation: b.explanation
			}))
	);
	const extra = EXTRA.map((e, i) => ({
		...e,
		id: `x:${e.chapter}:${i}`,
		chapterTitle: title(e.chapter)
	}));
	return [...fromChapters, ...extra];
}

/**
 * Picks `count` questions. Chapters count as started when one of their quizzes was solved; with
 * nothing started yet, the first three chapters are used. Wrong answers and questions not seen
 * for a long time come first; `random` breaks ties (injectable for tests).
 */
export function pickReview(
	items: ReviewItem[],
	stats: Readonly<Record<string, ItemStats>>,
	solved: ReadonlySet<string>,
	count = 5,
	now = Date.now(),
	random: () => number = Math.random
): ReviewItem[] {
	const started = new Set([...solved].map((id) => id.split(':')[0]));
	const firstChapters = new Set(CHAPTERS.slice(0, 3).map((c) => c.slug));
	const pool = items.filter((it) => (started.size ? started : firstChapters).has(it.chapter));
	const DAY = 86_400_000;
	const score = (it: ReviewItem) => {
		const s = stats[it.id];
		if (!s) return 3; // never seen
		const days = Math.min(30, (now - s.seen) / DAY);
		return s.wrong * 2 - s.right + days / 3;
	};
	return pool
		.map((it) => ({ it, key: score(it) + random() * 0.5 }))
		.sort((a, b) => b.key - a.key)
		.slice(0, count)
		.map((x) => x.it);
}

/** The same question with its options shuffled — so the answer is read, not remembered by place. */
export function shuffled(item: ReviewItem, random: () => number = Math.random): ReviewItem {
	const order = item.options.map((_, i) => i).sort(() => random() - 0.5);
	return {
		...item,
		options: order.map((i) => item.options[i]),
		correct: order.indexOf(item.correct)
	};
}

const KEY = 'plcsim:review';
type Store = Pick<Storage, 'getItem' | 'setItem'>;

export function reviewStats(storage: Store = localStorage): Record<string, ItemStats> {
	try {
		const data = JSON.parse(storage.getItem(KEY) ?? '{}');
		return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
	} catch {
		return {};
	}
}

export function recordAnswer(
	id: string,
	right: boolean,
	storage: Store = localStorage,
	now = Date.now()
) {
	const all = reviewStats(storage);
	const s = all[id] ?? { right: 0, wrong: 0, seen: 0 };
	all[id] = { right: s.right + (right ? 1 : 0), wrong: s.wrong + (right ? 0 : 1), seen: now };
	storage.setItem(KEY, JSON.stringify(all));
}
