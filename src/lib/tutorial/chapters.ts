import {
	coil,
	compare,
	contact,
	counterBox,
	parallel,
	rung,
	timer,
	type LadderProgram
} from '#lib/ladder/model.js';
import type { Chapter } from './types.js';

const program = (...rungs: ReturnType<typeof rung>[]): LadderProgram => ({ version: 1, rungs });

export const CHAPTERS: Chapter[] = [
	/* ------------------------------------------------------------------ 1 */
	{
		slug: 'czym-jest-plc',
		title: 'Czym jest sterownik PLC',
		summary: 'Wejścia, wyjścia, program — i czym PLC różni się od Arduino.',
		minutes: 5,
		blocks: [
			{
				kind: 'text',
				text: `**PLC** (Programmable Logic Controller, po polsku **sterownik programowalny**) to komputer przemysłowy, który steruje maszyną albo procesem: taśmociągiem, windą, mieszalnikiem, sygnalizacją świetlną. Zastąpił dawne szafy pełne przekaźników — zamiast przerabiać okablowanie, zmienia się program.

Każdy sterownik ma trzy części, które zobaczysz też w tym symulatorze:

- **wejścia** — tu podłącza się czujniki i przyciski; sterownik czyta z nich stan 0 albo 1,
- **program** — logika napisana przez Ciebie, wykonywana w kółko,
- **wyjścia** — tu podłącza się lampki, styczniki silników, zawory; sterownik je włącza i wyłącza.`
			},
			{ kind: 'plc-overview' },
			{
				kind: 'text',
				text: `Czym PLC różni się od mikrokontrolera, np. Arduino? Logicznie robi to samo — czyta wejścia i ustawia wyjścia. Różnica leży w przeznaczeniu:`
			},
			{
				kind: 'table',
				head: ['', 'PLC', 'Arduino / mikrokontroler'],
				rows: [
					[
						'Sygnały',
						'24 V DC, wejścia odporne na zakłócenia, wyjścia przekaźnikowe',
						'3,3 / 5 V, wymaga dodatkowych układów'
					],
					['Niezawodność', 'lata pracy 24/7, certyfikaty, watchdog', 'zależy od projektu'],
					['Programowanie', 'języki normy IEC 61131-3 (LAD, ST, FBD …)', 'C/C++'],
					[
						'Diagnostyka',
						'podgląd programu „na żywo”, wymuszanie sygnałów',
						'zwykle printf / debugger'
					],
					['Model działania', 'stały cykl skanowania', 'dowolny (pętla, przerwania)']
				]
			},
			{
				kind: 'callout',
				tone: 'info',
				title: 'Języki IEC 61131-3',
				text: `Norma IEC 61131-3 opisuje kilka języków programowania sterowników. Najpopularniejsze to **drabinka** (Ladder, LAD) — graficzna, przypomina schemat przekaźnikowy — i **tekst strukturalny** (ST) — tekstowy, podobny do Pascala. W PLC Sim możesz pisać w obu.`
			},
			{
				kind: 'quiz',
				question: 'Do której części sterownika podłączysz czujnik krańcowy bramy?',
				options: ['Do wyjścia', 'Do wejścia', 'Do pamięci M'],
				correct: 1,
				explanation: `Czujnik **informuje** sterownik o stanie obiektu, więc trafia na **wejście** (np. \`I0.0\`). Na wyjścia podłącza się to, czym sterownik **steruje** — np. silnik bramy.`
			}
		]
	},

	/* ------------------------------------------------------------------ 2 */
	{
		slug: 'cykl-skanowania',
		title: 'Cykl skanowania',
		summary: 'Najważniejsza idea PLC: odczyt wejść → program → zapis wyjść, w kółko.',
		minutes: 6,
		blocks: [
			{
				kind: 'text',
				text: `Program w sterowniku nie „czeka” na zdarzenia. Wykonuje się w **nieskończonej pętli** zwanej **cyklem skanowania** (scan cycle). Każdy cykl ma trzy fazy:

- **odczyt wejść** — stany wszystkich wejść są kopiowane do **obrazu procesu wejść** (pamięć \`I\`),
- **wykonanie programu** — od pierwszej do ostatniej instrukcji; program czyta tylko obraz wejść i zapisuje **obraz wyjść** (\`Q\`),
- **zapis wyjść** — obraz wyjść jest kopiowany na fizyczne zaciski.

Typowy cykl trwa kilka milisekund. W PLC Sim — 10 ms.`
			},
			{ kind: 'scan-cycle' },
			{
				kind: 'text',
				text: `Po co te „obrazy procesu”? Dzięki nim **w czasie jednego cyklu wejścia się nie zmieniają** — cały program widzi spójny stan obiektu. Gdyby przycisk zmienił się w połowie programu, pierwsza część programu widziałaby go wciśniętego, a druga nie.

Druga konsekwencja: **reakcja sterownika nie jest natychmiastowa**. Od zmiany na wejściu do zmiany na wyjściu mija od jednego do dwóch cykli.`
			},
			{
				kind: 'callout',
				tone: 'warn',
				title: 'Watchdog',
				text: `Jeżeli program wpadnie w nieskończoną pętlę (np. \`WHILE TRUE DO … END_WHILE\`), cykl nigdy się nie skończy, a wyjścia przestaną być odświeżane. Dlatego sterownik ma **watchdog** — gdy cykl trwa za długo, przechodzi w stan błędu (STOP / FAULT) i wyłącza wyjścia. PLC Sim robi to samo.`
			},
			{
				kind: 'quiz',
				question:
					'Przycisk wciśnięto w połowie fazy „wykonanie programu”. Kiedy program po raz pierwszy zobaczy go jako wciśnięty?',
				options: [
					'Natychmiast, w tym samym cyklu',
					'W następnym cyklu, po fazie odczytu wejść',
					'Dopiero po zapisie wyjść w tym cyklu'
				],
				correct: 1,
				explanation: `Program czyta **obraz wejść**, a ten jest aktualizowany tylko w fazie odczytu wejść — na początku **następnego** cyklu.`
			},
			{
				kind: 'quiz',
				question: 'Co się stanie, gdy cykl programu będzie trwał zbyt długo?',
				options: [
					'Sterownik zwolni zegar',
					'Watchdog zatrzyma sterownik i wyłączy wyjścia',
					'Nic, sterownik poczeka'
				],
				correct: 1,
				explanation: `Watchdog pilnuje maksymalnego czasu cyklu. Przekroczenie oznacza błąd — sterownik przechodzi w STOP/FAULT, a wyjścia są wyłączane, żeby maszyna nie pracowała bez kontroli.`
			}
		]
	},

	/* ------------------------------------------------------------------ 3 */
	{
		slug: 'adresowanie',
		title: 'Adresy i pamięć',
		summary: 'I, Q, M, bity, bajty i słowa — co oznacza I0.3 albo MW10.',
		minutes: 6,
		blocks: [
			{
				kind: 'text',
				text: `Każdy sygnał w sterowniku ma **adres**. PLC Sim używa zapisu jak w sterownikach Siemens S7:

- **litera obszaru**: \`I\` — wejścia, \`Q\` — wyjścia, \`M\` — markery (pamięć wewnętrzna), \`T\` — timery, \`C\` — liczniki,
- **numer bajtu** i **numer bitu** po kropce dla pojedynczego sygnału: \`I0.3\` = wejście, bajt 0, bit 3,
- dla liczb **rozmiar** zamiast bitu: \`MB\` — bajt, \`MW\` — słowo (2 bajty), \`MD\` — podwójne słowo (4 bajty).

Bity numeruje się od 0 do 7, więc po \`I0.7\` jest \`I1.0\`, a nie \`I0.8\`.`
			},
			{ kind: 'address-explorer' },
			{
				kind: 'table',
				head: ['Adres', 'Typ', 'Zakres', 'Przykład użycia'],
				rows: [
					['I0.0', 'BOOL (bit)', '0 / 1', 'przycisk Start'],
					['Q0.0', 'BOOL (bit)', '0 / 1', 'stycznik silnika'],
					['M0.0', 'BOOL (bit)', '0 / 1', 'flaga „cykl trwa”'],
					['MB4', 'BYTE', '0 … 255', 'numer kroku'],
					['MW10', 'INT', '−32 768 … 32 767', 'licznik sztuk'],
					['MD20', 'DINT / REAL', '±2·10⁹ / ułamki', 'temperatura, czas w ms']
				]
			},
			{
				kind: 'callout',
				tone: 'tip',
				title: 'Symbole zamiast adresów',
				text: `Nikt nie pamięta, co robi \`I0.3\`. Dlatego w **tablicy symboli** nadaje się adresom nazwy: \`Start → I0.0\`, \`Silnik → Q0.0\`. W programie można wtedy pisać nazwy, a edytor pokazuje pod nimi adres. W PLC Sim urządzenia podłączone w widoku „Circuit” dostają symbole automatycznie.`
			},
			{
				kind: 'quiz',
				question: 'Który adres wskazuje ostatni bit pierwszego bajtu wyjść?',
				options: ['Q0.8', 'Q0.7', 'Q1.0', 'QB1'],
				correct: 1,
				explanation: `Bajt ma bity od 0 do 7, a pierwszy bajt ma numer 0 — więc to \`Q0.7\`. Następny bit to już \`Q1.0\`.`
			},
			{
				kind: 'quiz',
				question: 'Dlaczego używanie jednocześnie MW10 i MW11 to zły pomysł?',
				options: [
					'MW11 nie istnieje',
					'Słowa zachodzą na siebie — oba używają bajtu MB11',
					'Słowa muszą mieć parzysty numer, inaczej sterownik zgłosi błąd'
				],
				correct: 1,
				explanation: `\`MW10\` to bajty \`MB10\` i \`MB11\`, a \`MW11\` to \`MB11\` i \`MB12\`. Zapis do jednego zmienia drugie. Słowa adresuj co 2 bajty, podwójne słowa co 4.`
			}
		]
	},

	/* ------------------------------------------------------------------ 4 */
	{
		slug: 'styki-i-cewki',
		title: 'Styki i cewki',
		summary: 'Podstawowe elementy drabinki: styk zwierny, styk rozwierny i cewka.',
		minutes: 7,
		blocks: [
			{
				kind: 'text',
				text: `Program w drabince (LAD) wygląda jak schemat elektryczny. Po lewej jest **szyna zasilająca**, po prawej **szyna powrotna**, a między nimi **szczeble** (sieci, ang. networks). Prąd „płynie” od lewej do prawej przez **styki**, a na końcu zasila **cewkę**.

- **Styk zwierny** \`┤ ├\` (normally open, NO) — przewodzi, gdy jego bit ma wartość **1**.
- **Styk rozwierny** \`┤/├\` (normally closed, NC) — przewodzi, gdy jego bit ma wartość **0**.
- **Cewka** \`( )\` — w każdym cyklu zapisuje do swojego bitu, czy dotarł do niej prąd: 1 albo 0.

To nie jest prawdziwy prąd — to wynik logiczny. Ale „przepływ prądu” bardzo ułatwia czytanie programu i dlatego PLC Sim podświetla go na zielono.`
			},
			{
				kind: 'sim',
				title: 'Ten sam przycisk, dwa rodzaje styków',
				ladder: () =>
					program(
						rung(
							[contact('NO', 'Przycisk')],
							[coil('COIL', 'LampaNO')],
							'Styk zwierny — przewodzi, gdy Przycisk = 1'
						),
						rung(
							[contact('NC', 'Przycisk')],
							[coil('COIL', 'LampaNC')],
							'Styk rozwierny — przewodzi, gdy Przycisk = 0'
						)
					),
				inputs: [{ address: 'I0.0', label: 'Przycisk' }],
				outputs: [
					{ address: 'Q0.0', label: 'LampaNO', color: 'green' },
					{ address: 'Q0.1', label: 'LampaNC', color: 'amber' }
				],
				caption:
					'Przytrzymaj przycisk. Zwróć uwagę, które styki przewodzą (zielone) i jak zmienia się wynik na cewkach.'
			},
			{
				kind: 'callout',
				tone: 'warn',
				title: 'Styk w programie ≠ przycisk na obiekcie',
				text: `To najczęstsze źródło pomyłek. **Rodzaj styku w programie nie musi być taki sam jak rodzaj przycisku na obiekcie.** Styk w programie pyta tylko: „czy na wejściu jest 1?” (zwierny) albo „czy jest 0?” (rozwierny). To, czy przycisk daje 1 po wciśnięciu, czy po puszczeniu, zależy od jego budowy i podłączenia. Wrócimy do tego w rozdziale o bezpieczeństwie.`
			},
			{
				kind: 'quiz',
				question: 'Na wejściu I0.0 jest 0. Które styki przewodzą?',
				options: ['Tylko zwierny ┤ ├ I0.0', 'Tylko rozwierny ┤/├ I0.0', 'Oba', 'Żaden'],
				correct: 1,
				explanation: `Styk rozwierny przewodzi, gdy bit = 0. Zwierny przewodzi dopiero przy 1.`
			},
			{ kind: 'lesson', slug: 'first-rung', text: 'Zbuduj swój pierwszy szczebel w edytorze.' }
		]
	},

	/* ------------------------------------------------------------------ 5 */
	{
		slug: 'logika',
		title: 'Logika: AND, OR, NOT',
		summary: 'Styki szeregowo to AND, równolegle to OR.',
		minutes: 6,
		blocks: [
			{
				kind: 'text',
				text: `Z prostych styków buduje się całą logikę:

- styki połączone **szeregowo** — prąd przejdzie tylko, gdy przewodzą **wszystkie**: to **AND** (iloczyn),
- styki połączone **równolegle** (gałęzie) — wystarczy, że przewodzi **którykolwiek**: to **OR** (suma),
- styk **rozwierny** odwraca sygnał: to **NOT** (negacja).

Z tych trzech da się zbudować każdą funkcję logiczną, np. **XOR** — „dokładnie jeden z dwóch”.`
			},
			{
				kind: 'sim',
				title: 'Bramki logiczne z dwóch przełączników',
				ladder: () =>
					program(
						rung(
							[contact('NO', 'A'), contact('NO', 'B')],
							[coil('COIL', 'Wynik_AND')],
							'AND — szeregowo'
						),
						rung(
							[parallel([[contact('NO', 'A')], [contact('NO', 'B')]])],
							[coil('COIL', 'Wynik_OR')],
							'OR — równolegle'
						),
						rung([contact('NC', 'A')], [coil('COIL', 'Wynik_NOT')], 'NOT A — styk rozwierny'),
						rung(
							[
								parallel([
									[contact('NO', 'A'), contact('NC', 'B')],
									[contact('NC', 'A'), contact('NO', 'B')]
								])
							],
							[coil('COIL', 'Wynik_XOR')],
							'XOR — (A i nie B) lub (nie A i B)'
						)
					),
				inputs: [
					{ address: 'I0.0', label: 'A', kind: 'toggle' },
					{ address: 'I0.1', label: 'B', kind: 'toggle' }
				],
				outputs: [
					{ address: 'Q0.0', label: 'Wynik_AND', color: 'green' },
					{ address: 'Q0.1', label: 'Wynik_OR', color: 'green' },
					{ address: 'Q0.2', label: 'Wynik_NOT', color: 'amber' },
					{ address: 'Q0.3', label: 'Wynik_XOR', color: 'blue' }
				],
				truthTable: true,
				caption: 'Przełączaj A i B — w tabeli prawdy podświetla się aktualny wiersz.'
			},
			{
				kind: 'callout',
				tone: 'tip',
				title: 'Przykład z życia: oburęczne sterowanie',
				text: `Prasa może ruszyć tylko, gdy operator trzyma **oba** przyciski — wtedy na pewno nie ma rąk pod stemplem. To zwykłe AND dwóch wejść. Lampka ostrzegawcza świeci, gdy wciśnięty jest **którykolwiek** — to OR.`
			},
			{
				kind: 'quiz',
				question: 'Jak zbudować warunek „Start wciśnięty i drzwi zamknięte”?',
				options: ['Dwa styki równolegle', 'Dwa styki szeregowo', 'Jeden styk rozwierny'],
				correct: 1,
				explanation: `„I” to AND, czyli styki połączone szeregowo — prąd przejdzie tylko, gdy oba warunki są spełnione.`
			},
			{ kind: 'lesson', slug: 'and-or', text: 'Zaprogramuj prasę z oburęcznym sterowaniem.' },
			{
				kind: 'lesson',
				slug: 'bug-double-coil',
				text: 'Znajdź błąd: dwa przyciski, jedna lampka — a działa tylko jeden.'
			}
		]
	},

	/* ------------------------------------------------------------------ 6 */
	{
		slug: 'podtrzymanie',
		title: 'Podtrzymanie oraz SET / RESET',
		summary: 'Jak sterownik „zapamiętuje”, że silnik ma pracować po puszczeniu przycisku.',
		minutes: 8,
		blocks: [
			{
				kind: 'text',
				text: `Przycisk Start wciska się na chwilę, a silnik ma pracować dalej. Potrzebna jest **pamięć**. W drabince są na to dwa klasyczne sposoby.

**1. Samopodtrzymanie** (self-holding, latch). Równolegle do przycisku Start dajemy styk **samego wyjścia** silnika. Gdy silnik raz się włączy, jego własny styk „podtrzymuje” zasilanie cewki. Szeregowo dodajemy Stop, który przerywa obwód.`
			},
			{
				kind: 'sim',
				title: 'Samopodtrzymanie',
				ladder: () =>
					program(
						rung(
							[
								parallel([[contact('NO', 'Start')], [contact('NO', 'Silnik')]]),
								contact('NC', 'Stop')
							],
							[coil('COIL', 'Silnik')],
							'Start uruchamia, styk Silnik podtrzymuje, Stop przerywa'
						)
					),
				inputs: [
					{ address: 'I0.0', label: 'Start' },
					{ address: 'I0.1', label: 'Stop' }
				],
				outputs: [{ address: 'Q0.0', label: 'Silnik', color: 'green' }],
				trace: [{ address: 'Start' }, { address: 'Stop' }, { address: 'Silnik' }],
				caption: 'Krótko wciśnij Start — silnik zostaje włączony. Wciśnij oba naraz: wygrywa Stop.'
			},
			{
				kind: 'text',
				text: `**2. Cewki SET i RESET.** Cewka \`(S)\` ustawia bit na 1, gdy dotrze do niej prąd — i **nie kasuje go**, gdy prąd zniknie. Cewka \`(R)\` kasuje bit na 0. Bit „pamięta” swój stan między cyklami.`
			},
			{
				kind: 'sim',
				title: 'SET / RESET',
				ladder: () =>
					program(
						rung([contact('NO', 'Start')], [coil('SET', 'Silnik')], 'Start ustawia'),
						rung(
							[contact('NO', 'Stop')],
							[coil('RESET', 'Silnik')],
							'Stop kasuje — jest niżej, więc ma pierwszeństwo'
						)
					),
				inputs: [
					{ address: 'I0.0', label: 'Start' },
					{ address: 'I0.1', label: 'Stop' }
				],
				outputs: [{ address: 'Q0.0', label: 'Silnik', color: 'green' }]
			},
			{
				kind: 'callout',
				tone: 'info',
				title: 'Kto wygrywa, gdy oba przyciski są wciśnięte?',
				text: `Program wykonuje się z góry na dół, a na wyjście trafia **ostatni zapis** w cyklu. Jeśli RESET jest niżej niż SET, wygrywa RESET — mówi się o **dominacji wyłączania**. Przy maszynach prawie zawsze chcemy, żeby wygrywał Stop.`
			},
			{
				kind: 'quiz',
				question:
					'Co się stanie w obwodzie samopodtrzymania, gdy usuniesz styk „Silnik” równoległy do Startu?',
				options: [
					'Silnik będzie pracował tylko, dopóki trzymasz Start',
					'Silnik nie da się wyłączyć',
					'Nic się nie zmieni'
				],
				correct: 0,
				explanation: `Ten styk to właśnie **podtrzymanie**. Bez niego cewka dostaje prąd tylko przez przycisk Start — puszczasz przycisk, silnik staje.`
			},
			{ kind: 'lesson', slug: 'self-holding', text: 'Zaprogramuj start/stop silnika w edytorze.' },
			{
				kind: 'lesson',
				slug: 'bug-set-reset-order',
				text: 'Znajdź błąd: Stop, który przegrywa ze Startem.'
			}
		]
	},

	/* ------------------------------------------------------------------ 7 */
	{
		slug: 'zbocza',
		title: 'Zbocza sygnałów',
		summary: 'Dlaczego przytrzymany przycisk ma liczyć się tylko raz.',
		minutes: 7,
		blocks: [
			{
				kind: 'text',
				text: `Sterownik wykonuje program co 10 ms. Jeśli trzymasz przycisk przez pół sekundy, program widzi go wciśniętego w **50 kolejnych cyklach**. Czasem właśnie o to chodzi (lampka świeci, dopóki trzymasz), ale czasem chcemy zareagować **raz** — na samą chwilę wciśnięcia.

Do tego służy **zbocze**:

- **zbocze narastające** \`┤P├\` (rising edge) — przewodzi przez **jeden cykl**, gdy sygnał zmienia się z 0 na 1,
- **zbocze opadające** \`┤N├\` (falling edge) — przez jeden cykl, gdy sygnał zmienia się z 1 na 0.

Poniżej dwa przełączniki „jeden przycisk — włącz/wyłącz”. Górny działa bez zbocza, dolny ze zboczem.`
			},
			{
				kind: 'sim',
				title: 'Przełączanie bez zbocza i ze zboczem',
				ladder: () =>
					program(
						rung(
							[
								parallel([
									[contact('NO', 'Przycisk'), contact('NC', 'BezZbocza')],
									[contact('NC', 'Przycisk'), contact('NO', 'BezZbocza')]
								])
							],
							[coil('COIL', 'BezZbocza')],
							'BEZ zbocza: lampa przełącza się w każdym cyklu, dopóki trzymasz przycisk'
						),
						rung(
							[contact('P', 'Przycisk')],
							[coil('COIL', 'Impuls')],
							'Impuls trwa dokładnie jeden cykl'
						),
						rung(
							[
								parallel([
									[contact('NO', 'Impuls'), contact('NC', 'ZeZboczem')],
									[contact('NC', 'Impuls'), contact('NO', 'ZeZboczem')]
								])
							],
							[coil('COIL', 'ZeZboczem')],
							'ZE zboczem: jedno przełączenie na jedno wciśnięcie'
						)
					),
				inputs: [{ address: 'I0.0', label: 'Przycisk' }],
				outputs: [
					{ address: 'Q0.0', label: 'BezZbocza', color: 'red' },
					{ address: 'Q0.1', label: 'ZeZboczem', color: 'green' }
				],
				symbols: [{ label: 'Impuls', address: 'M0.0' }],
				trace: [
					{ address: 'Przycisk' },
					{ address: 'Impuls' },
					{ address: 'BezZbocza' },
					{ address: 'ZeZboczem' }
				],
				caption:
					'Wciśnij kilka razy. Włącz 🐢 ×0,1 i ustaw okno wykresu na 1 s — zobaczysz, że Impuls trwa jeden cykl, a lampa „bez zbocza” migocze co cykl.'
			},
			{
				kind: 'callout',
				tone: 'tip',
				title: 'Liczniki mają zbocze wbudowane',
				text: `Bloki CTU/CTD same reagują na zbocze narastające na wejściu zliczającym — nie trzeba im dodawać styku P. Zbocza przydają się wszędzie tam, gdzie zdarzenie ma wykonać akcję raz: przełączanie, dodanie liczby, start sekwencji.`
			},
			{
				kind: 'quiz',
				question: 'Jak długo przewodzi styk zbocza narastającego ┤P├?',
				options: ['Dopóki sygnał ma wartość 1', 'Przez jeden cykl programu', 'Przez 1 sekundę'],
				correct: 1,
				explanation: `Styk P „pamięta” stan z poprzedniego cyklu i przewodzi tylko w tym jednym cyklu, w którym sygnał zmienił się z 0 na 1.`
			},
			{ kind: 'lesson', slug: 'toggle', text: 'Zbuduj przełącznik jednym przyciskiem.' },
			{
				kind: 'lesson',
				slug: 'bug-flicker',
				text: 'Znajdź błąd: lampka, która miga przy trzymanym przycisku.'
			}
		]
	},

	/* ------------------------------------------------------------------ 8 */
	{
		slug: 'timery',
		title: 'Timery: TON, TOF, TP',
		summary: 'Opóźnione załączenie, opóźnione wyłączenie i impuls — na wykresie czasowym.',
		minutes: 9,
		blocks: [
			{
				kind: 'text',
				text: `**Timer** (przekaźnik czasowy) odmierza czas. Norma IEC 61131-3 definiuje trzy podstawowe:

- **TON** — opóźnione **załączenie**: wyjście Q włącza się, gdy wejście IN jest włączone **nieprzerwanie** przez czas PT. Gdy IN zniknie wcześniej, odliczanie zaczyna się od nowa.
- **TOF** — opóźnione **wyłączenie**: Q włącza się od razu z IN, a wyłącza dopiero po czasie PT od wyłączenia IN.
- **TP** — **impuls**: zbocze narastające na IN daje impuls o długości dokładnie PT, niezależnie od tego, jak długo trzymasz IN.

Każdy timer ma też wyjście **ET** (elapsed time) — ile czasu już upłynęło.`
			},
			{
				kind: 'sim',
				title: 'Trzy timery na tym samym wejściu (PT = 2 s)',
				ladder: () =>
					program(
						rung(
							[contact('NO', 'Wejscie'), timer('TON', 'T0', 'T#2s')],
							[coil('COIL', 'Lampa_TON')],
							'TON — opóźnione załączenie'
						),
						rung(
							[contact('NO', 'Wejscie'), timer('TOF', 'T1', 'T#2s')],
							[coil('COIL', 'Lampa_TOF')],
							'TOF — opóźnione wyłączenie'
						),
						rung(
							[contact('NO', 'Wejscie'), timer('TP', 'T2', 'T#2s')],
							[coil('COIL', 'Lampa_TP')],
							'TP — impuls'
						)
					),
				inputs: [{ address: 'I0.0', label: 'Wejscie' }],
				outputs: [
					{ address: 'Q0.0', label: 'Lampa_TON', color: 'green' },
					{ address: 'Q0.1', label: 'Lampa_TOF', color: 'amber' },
					{ address: 'Q0.2', label: 'Lampa_TP', color: 'blue' }
				],
				trace: [
					{ address: 'Wejscie' },
					{ address: 'Lampa_TON' },
					{ address: 'Lampa_TOF' },
					{ address: 'Lampa_TP' },
					{ address: 'T0', format: 'DEC' }
				],
				caption:
					'Spróbuj: krótko (< 2 s), długo (> 2 s) i kilka razy szybko po sobie. Porównaj przebiegi na wykresie.'
			},
			{
				kind: 'table',
				head: ['Timer', 'Kiedy Q = 1', 'Typowe zastosowanie'],
				rows: [
					[
						'TON',
						'IN trwa ≥ PT',
						'odfiltrowanie drgań czujnika, opóźniony start, „przytrzymaj 3 s”'
					],
					[
						'TOF',
						'IN = 1 oraz PT po wyłączeniu IN',
						'wentylator chłodzący po wyłączeniu silnika, światło na klatce'
					],
					['TP', 'przez PT od zbocza IN', 'impuls na siłownik, sygnał dźwiękowy o stałej długości']
				]
			},
			{
				kind: 'quiz',
				question:
					'Wentylator ma pracować jeszcze 30 s po wyłączeniu pieca. Który timer wybierzesz?',
				options: ['TON', 'TOF', 'TP'],
				correct: 1,
				explanation: `**TOF** włącza wyjście razem z wejściem i wyłącza je z opóźnieniem PT — dokładnie „pracuj jeszcze 30 s po wyłączeniu”.`
			},
			{
				kind: 'quiz',
				question:
					'TON z PT = 5 s. Wejście było włączone 3 s, wyłączone na chwilę i znów włączone. Po ilu sekundach od ponownego włączenia zapali się Q?',
				options: ['Po 2 s', 'Po 5 s', 'Od razu'],
				correct: 1,
				explanation: `Przerwa na wejściu **zeruje** TON. Odliczanie zaczyna się od początku, więc trzeba znowu 5 s.`
			},
			{ kind: 'lesson', slug: 'traffic-light', text: 'Zbuduj sygnalizację świetlną na timerze.' },
			{
				kind: 'lesson',
				slug: 'bug-timer-edge',
				text: 'Znajdź błąd: timer, który nigdy nie dolicza.'
			}
		]
	},

	/* ------------------------------------------------------------------ 9 */
	{
		slug: 'liczniki',
		title: 'Liczniki i porównania',
		summary: 'Zliczanie sztuk na taśmie i porównywanie liczb.',
		minutes: 7,
		blocks: [
			{
				kind: 'text',
				text: `**Licznik** zlicza zbocza narastające sygnału:

- **CTU** — w górę: każde zbocze na CU zwiększa wartość **CV** o 1; wyjście Q = 1, gdy CV ≥ PV (wartość zadana); wejście R zeruje licznik,
- **CTD** — w dół: każde zbocze zmniejsza CV; Q = 1, gdy CV ≤ 0; wejście LD wpisuje do CV wartość PV.

Wartość licznika to zwykła liczba, więc można ją **porównywać** blokiem CMP: \`=\`, \`<>\`, \`<\`, \`>\`, \`<=\`, \`>=\`. Porównanie działa jak styk — przewodzi, gdy warunek jest spełniony.`
			},
			{
				kind: 'sim',
				title: 'Zliczanie paczek',
				ladder: () =>
					program(
						rung(
							[contact('NO', 'Czujnik'), counterBox('CTU', 'C0', '3', 'Kasuj')],
							[coil('COIL', 'Komplet')],
							'Po 3 paczkach — komplet'
						),
						rung([compare('>=', 'C0', '1')], [coil('COIL', 'Cos_jest')], 'Porównanie: CV ≥ 1')
					),
				inputs: [
					{ address: 'I0.0', label: 'Czujnik' },
					{ address: 'I0.1', label: 'Kasuj' }
				],
				outputs: [
					{ address: 'Q0.0', label: 'Komplet', color: 'green' },
					{ address: 'Q0.1', label: 'Cos_jest', color: 'blue' }
				],
				trace: [{ address: 'Czujnik' }, { address: 'C0', format: 'DEC' }, { address: 'Komplet' }],
				caption:
					'Każde wciśnięcie Czujnika to jedna paczka. Przytrzymanie liczy się raz — licznik reaguje na zbocze.'
			},
			{
				kind: 'quiz',
				question:
					'CTU ma PV = 10. Ile razy trzeba wcisnąć przycisk na wejściu CU, żeby Q = 1, jeśli trzymasz go za każdym razem 2 sekundy?',
				options: ['10 razy', '1 raz — 2 s to setki cykli', '20 razy'],
				correct: 0,
				explanation: `Licznik liczy **zbocza narastające**, a nie cykle, w których wejście jest włączone. Każde wciśnięcie to jedno zbocze, niezależnie od długości.`
			},
			{
				kind: 'lesson',
				slug: 'sorting-conveyor',
				text: 'Liczniki i impulsy na prawdziwym taśmociągu.'
			}
		]
	},

	/* ------------------------------------------------------------------ 10 */
	{
		slug: 'structured-text',
		title: 'Tekst strukturalny (ST)',
		summary: 'Ten sam program w drabince i w tekście.',
		minutes: 8,
		blocks: [
			{
				kind: 'text',
				text: `**Structured Text** (ST, w Siemensie nazywany SCL) to tekstowy język z normy IEC 61131-3, podobny do Pascala. Drabinka jest czytelna dla elektryków i dobra do logiki bitowej; ST lepiej sprawdza się przy obliczeniach, pętlach i rozbudowanych warunkach. Oba języki robią to samo — w PLC Sim kompilują się nawet do tych samych instrukcji.

Najważniejsze elementy składni:

- przypisanie: \`Silnik := Start AND NOT Stop;\` — każda instrukcja kończy się średnikiem,
- warunki: \`IF … THEN … ELSIF … ELSE … END_IF;\`,
- zmienne deklaruje się w bloku \`VAR … END_VAR\`,
- timery i liczniki to **instancje bloków funkcyjnych**: deklarujesz \`t : TON;\`, wywołujesz \`t(IN := …, PT := T#2s);\`, a wynik czytasz jako \`t.Q\` i \`t.ET\`.`
			},
			{
				kind: 'table',
				head: ['Drabinka (LAD)', 'Structured Text'],
				rows: [
					['styki szeregowo', 'A AND B'],
					['styki równolegle', 'A OR B'],
					['styk rozwierny', 'NOT A'],
					['cewka ( )', 'Wyjscie := warunek;'],
					['cewki (S) / (R)', 'IF warunek THEN Wyjscie := TRUE; END_IF;'],
					['TON T0 PT T#2s', 't(IN := warunek, PT := T#2s);  … t.Q'],
					['porównanie CMP >=', 'MW10 >= 5']
				]
			},
			{
				kind: 'sim',
				title: 'Samopodtrzymanie z opóźnioną lampką — w ST',
				st: `VAR
  opoznienie : TON;
END_VAR

// samopodtrzymanie, Stop ma pierwszeństwo
Silnik := (Start OR Silnik) AND NOT Stop;

// lampka "Gotowe" 2 s po starcie silnika
opoznienie(IN := Silnik, PT := T#2s);
Gotowe := opoznienie.Q;`,
				inputs: [
					{ address: 'I0.0', label: 'Start' },
					{ address: 'I0.1', label: 'Stop' }
				],
				outputs: [
					{ address: 'Q0.0', label: 'Silnik', color: 'green' },
					{ address: 'Q0.1', label: 'Gotowe', color: 'blue' }
				],
				trace: [{ address: 'Silnik' }, { address: 'Gotowe' }]
			},
			{
				kind: 'callout',
				tone: 'tip',
				title: 'Spróbuj w edytorze',
				text: `W edytorze PLC Sim przełącz widok programu na **Structured Text**. Dostaniesz podpowiedzi (Ctrl+Spacja), podświetlanie składni i błędy zaznaczone w linii. Każdą lekcję możesz rozwiązać w drabince albo w ST.`
			},
			{
				kind: 'quiz',
				question:
					'Jak w ST zapiszesz szczebel: styk zwierny A, szeregowo styk rozwierny B, cewka Y?',
				options: ['Y := A OR NOT B;', 'Y := A AND NOT B;', 'Y := NOT A AND B;'],
				correct: 1,
				explanation: `Szeregowo to AND, styk rozwierny to NOT: \`Y := A AND NOT B;\`.`
			}
		]
	},

	/* ------------------------------------------------------------------ 11 */
	{
		slug: 'bezpieczenstwo',
		title: 'Bezpieczeństwo i dobre praktyki',
		summary: 'Dlaczego Stop podłącza się jako styk NC i inne zasady z praktyki.',
		minutes: 8,
		blocks: [
			{
				kind: 'text',
				text: `Przycisk Stop prawie zawsze podłącza się **stykiem rozwiernym (NC)**: gdy nikt go nie dotyka, obwód jest zamknięty i na wejściu jest **1**. Wciśnięcie **przerywa** obwód — wejście spada do 0.

Po co to odwrócenie? Bo tak samo zachowuje się **przerwany przewód**, wyrwana wtyczka czy przepalony bezpiecznik. Jeśli Stop byłby podłączony stykiem zwiernym, uszkodzony przewód oznaczałby, że **Stop przestaje działać** — a maszyna o tym nie wie. Przy podłączeniu NC usterka natychmiast zatrzymuje maszynę. To zasada **fail-safe** — „bezpieczna w razie awarii”.

W programie odwracamy to z powrotem: skoro wejście Stop to 1 = „wszystko w porządku”, używamy **styku zwiernego**.`
			},
			{
				kind: 'sim',
				title: 'Stop podłączony stykiem NC (fail-safe)',
				ladder: () =>
					program(
						rung(
							[
								parallel([[contact('NO', 'Start')], [contact('NO', 'Silnik')]]),
								contact('NO', 'Stop')
							],
							[coil('COIL', 'Silnik')],
							'Stop to przycisk NC, więc w programie styk ZWIERNY: 1 = wolno pracować'
						)
					),
				inputs: [
					{ address: 'I0.0', label: 'Start' },
					{ address: 'I0.1', label: 'Stop', nc: true, breakable: true }
				],
				outputs: [{ address: 'Q0.0', label: 'Silnik', color: 'green' }],
				caption:
					'Uruchom silnik, a potem zaznacz „przerwany przewód” przy Stop. Silnik zatrzyma się sam — i nie da się go uruchomić, dopóki usterka nie zostanie usunięta.'
			},
			{
				kind: 'callout',
				tone: 'warn',
				title: 'Wyłącznik awaryjny to nie tylko program',
				text: `Wyłącznik bezpieczeństwa (grzybek STOP AWARYJNY) w prawdziwej maszynie **odcina zasilanie elementów wykonawczych sprzętowo**, przez przekaźnik bezpieczeństwa — niezależnie od programu PLC. Sterownik dostaje tylko informację, że go wciśnięto. Program może mieć błąd; obwód bezpieczeństwa nie może od niego zależeć.`
			},
			{
				kind: 'text',
				text: `Jeszcze jedna pułapka: **podwójna cewka**. Jeśli to samo wyjście zapiszesz w dwóch szczeblach, liczy się tylko **ostatni** — pierwszy jest po cichu nadpisywany w każdym cyklu.`
			},
			{
				kind: 'sim',
				title: 'Podwójna cewka — błąd, który łatwo przeoczyć',
				ladder: () =>
					program(
						rung(
							[contact('NO', 'A')],
							[coil('COIL', 'Lampa')],
							'Ten szczebel nie ma żadnego znaczenia…'
						),
						rung(
							[contact('NO', 'B')],
							[coil('COIL', 'Lampa')],
							'…bo ten zapisuje Lampę później w tym samym cyklu'
						)
					),
				inputs: [
					{ address: 'I0.0', label: 'A', kind: 'toggle' },
					{ address: 'I0.1', label: 'B', kind: 'toggle' }
				],
				outputs: [{ address: 'Q0.0', label: 'Lampa', color: 'amber' }],
				caption:
					'Włącz A — lampa nie świeci, choć szczebel 1 przewodzi. Poprawnie: jeden szczebel z A i B równolegle.'
			},
			{
				kind: 'text',
				text: `Kilka zasad, które warto stosować od początku:

- jedno wyjście = **jedna cewka** (albo para SET/RESET),
- nazywaj sygnały w **tablicy symboli**, komentuj szczeble,
- przyciski zatrzymujące i czujniki bezpieczeństwa podłączaj **NC**,
- po każdej zmianie programu przetestuj także przypadki „złe”: oba przyciski naraz, przerwany przewód, zanik sygnału.`
			},
			{
				kind: 'quiz',
				question:
					'Stop jest podłączony stykiem NC. Jakiego styku użyjesz dla niego w programie, żeby silnik pracował tylko wtedy, gdy Stop nie jest wciśnięty?',
				options: ['Rozwiernego ┤/├', 'Zwiernego ┤ ├', 'Zbocza ┤P├'],
				correct: 1,
				explanation: `Przycisk NC daje **1**, gdy nie jest wciśnięty. Warunek „wolno pracować” to więc „Stop = 1” — styk **zwierny**.`
			},
			{
				kind: 'quiz',
				question: 'Dlaczego przycisk Stop podłącza się stykiem NC?',
				options: [
					'Bo jest tańszy',
					'Bo przerwany przewód zachowa się jak wciśnięty Stop i zatrzyma maszynę',
					'Bo sterownik nie obsługuje styków NO'
				],
				correct: 1,
				explanation: `To zasada **fail-safe**: każda typowa usterka okablowania daje 0 na wejściu, czyli zatrzymanie — maszyna przechodzi w stan bezpieczny.`
			},
			{ kind: 'lesson', slug: 'tank-level', text: 'Sprawdź się w regulacji poziomu w zbiorniku.' },
			{
				kind: 'lesson',
				slug: 'bug-stop-nc',
				text: 'Znajdź błąd: silnik nie rusza, choć Stop jest podłączony podręcznikowo.'
			}
		]
	},

	/* ------------------------------------------------------------------ 12 */
	{
		slug: 'sekwencje',
		title: 'Sterowanie sekwencyjne (kroki)',
		summary: 'Jak zaprogramować maszynę, która robi „najpierw to, potem tamto”.',
		minutes: 10,
		blocks: [
			{
				kind: 'text',
				text: `Większość maszyn działa w **krokach**: napełnij → wymieszaj → spuść, albo zatrzymaj detal → wierć → wypuść. Taki program to **sekwencja**.

Sposób, który zawsze działa:

1. Każdy krok to jeden **marker** (np. \`S1\`, \`S2\`, \`S3\`). Marker = 1 znaczy „jesteśmy w tym kroku”.
2. **Przejście** do następnego kroku: gdy jesteśmy w kroku *n* **i** spełniony jest warunek przejścia → \`(S)\` krok *n+1*, \`(R)\` krok *n*.
3. **Akcje** (wyjścia) zależą tylko od kroków: \`┤S1├ → (Napelnianie)\`.

Dzięki temu w każdej chwili aktywny jest dokładnie jeden krok, a każdą akcję łatwo znaleźć.`
			},
			{
				kind: 'table',
				head: ['Krok', 'Akcja (wyjście)', 'Warunek przejścia dalej'],
				rows: [
					['— (spoczynek)', '—', 'wciśnięty Start'],
					['S1 napełnianie', 'Napelnianie', 'czujnik Pelny'],
					['S2 pranie', 'Pranie', 'minęły 3 s (TON)'],
					['S3 spust', 'Spust', 'czujnik Pusty → koniec']
				]
			},
			{
				kind: 'sim',
				title: 'Mała pralka w trzech krokach',
				ladder: () =>
					program(
						rung(
							[
								contact('NO', 'Start'),
								contact('NC', 'S1'),
								contact('NC', 'S2'),
								contact('NC', 'S3')
							],
							[coil('SET', 'S1')],
							'Start, gdy nic nie pracuje → krok 1'
						),
						rung(
							[contact('NO', 'S1'), contact('NO', 'Pelny')],
							[coil('SET', 'S2'), coil('RESET', 'S1')],
							'Krok 1 → 2: zbiornik pełny'
						),
						rung(
							[contact('NO', 'S2'), timer('TON', 'T0', 'T#3s')],
							[coil('SET', 'S3'), coil('RESET', 'S2')],
							'Krok 2 → 3: po 3 s prania'
						),
						rung(
							[contact('NO', 'S3'), contact('NO', 'Pusty')],
							[coil('RESET', 'S3')],
							'Krok 3 → koniec: pusto'
						),
						rung(
							[contact('NO', 'S1')],
							[coil('COIL', 'Napelnianie')],
							'Akcje zależą tylko od kroków'
						),
						rung([contact('NO', 'S2')], [coil('COIL', 'Pranie')]),
						rung([contact('NO', 'S3')], [coil('COIL', 'Spust')])
					),
				inputs: [
					{ address: 'I0.0', label: 'Start' },
					{ address: 'I0.1', label: 'Pelny', kind: 'toggle' },
					{ address: 'I0.2', label: 'Pusty', kind: 'toggle' }
				],
				outputs: [
					{ address: 'Q0.0', label: 'Napelnianie', color: 'blue' },
					{ address: 'Q0.1', label: 'Pranie', color: 'green' },
					{ address: 'Q0.2', label: 'Spust', color: 'amber' }
				],
				symbols: [
					{ label: 'S1', address: 'M0.0' },
					{ label: 'S2', address: 'M0.1' },
					{ label: 'S3', address: 'M0.2' }
				],
				trace: [{ address: 'S1' }, { address: 'S2' }, { address: 'S3' }],
				caption:
					'Wciśnij Start, potem przełącz Pelny. Po 3 s prania przełącz Pusty. Na wykresie widać, że zawsze świeci jeden krok.'
			},
			{
				kind: 'callout',
				tone: 'info',
				title: 'SFC / GRAFCET',
				text: 'Norma IEC 61131-3 ma do tego osobny język graficzny: **SFC** (Sequential Function Chart), w Europie znany też jako **GRAFCET**. Kroki rysuje się jako prostokąty, przejścia jako kreski z warunkami. W Ladder robisz dokładnie to samo markerami — tak programuje się sekwencje na wielu sterownikach.'
			},
			{
				kind: 'callout',
				tone: 'warn',
				title: 'Typowy błąd',
				text: 'Wyjście sterowane w kilku miejscach (np. cewka Pranie w dwóch networkach) — działa tylko ostatnia cewka. Z krokami każde wyjście ma jedną cewkę, a w jej warunku stoją kroki (połączone LUB, jeśli akcja trwa w kilku krokach).'
			},
			{
				kind: 'quiz',
				question: 'Dlaczego przejście robi się parą (S) następny krok + (R) bieżący krok?',
				options: [
					'Bo inaczej program się nie skompiluje',
					'Żeby krok pamiętał się sam, choć warunek przejścia (np. czujnik) zaraz zniknie, i żeby aktywny był zawsze tylko jeden krok',
					'Bo cewki SET są szybsze od zwykłych'
				],
				correct: 1,
				explanation:
					'Warunek przejścia jest zwykle chwilowy — czujnik albo koniec czasu. SET zapamiętuje nowy krok, a RESET kasuje poprzedni, więc maszyna jest zawsze w dokładnie jednym kroku.'
			},
			{
				kind: 'quiz',
				question: 'W kroku S2 ma się kręcić silnik, a w S3 też. Jak to zapisać?',
				options: [
					'Dwie cewki Silnik: jedna za ┤S2├, druga za ┤S3├',
					'Jedna cewka Silnik za rozgałęzieniem ┤S2├ LUB ┤S3├',
					'SET Silnik w S2 i drugi SET w S3'
				],
				correct: 1,
				explanation:
					'Dwie zwykłe cewki na jednym wyjściu to „podwójna cewka” — wygrywa ostatnia. Jedna cewka z warunkiem LUB działa poprawnie i od razu widać, kiedy wyjście jest włączone.'
			},
			{
				kind: 'lesson',
				slug: 'drilling-station',
				text: 'Zaprogramuj stację wiercenia na linii produkcyjnej — prawdziwą sekwencję z czujnikami krańcowymi.'
			}
		]
	}
];

export const getChapter = (slug: string) => CHAPTERS.find((c) => c.slug === slug) ?? null;

export const quizCount = (c: Chapter) => c.blocks.filter((b) => b.kind === 'quiz').length;
