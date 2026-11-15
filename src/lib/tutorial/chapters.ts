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
				text: `Jeżeli program wpadnie w nieskończoną pętlę (np. \`WHILE TRUE DO … END_WHILE\`), cykl nigdy się nie skończy, a wyjścia przestaną być odświeżane. Dlatego sterownik ma **watchdog** — gdy cykl trwa za długo, przechodzi w stan błędu (STOP / FAULT) i wyłącza wyjścia. PLC Sim robi to samo: maksymalny czas cyklu to 150 ms, a powód zatrzymania zobaczysz w buforze diagnostycznym (widok **Diagnostics**).`
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

	/* ------------------------------------------------------------------ elektryka */
	{
		slug: 'elektryka',
		title: 'Podłączenie PLC: zasilanie, czujniki, wyjścia',
		summary:
			'24 V DC, czujniki PNP i NPN, wejścia sink/source, wyjścia przekaźnikowe i tranzystorowe.',
		minutes: 10,
		blocks: [
			{
				kind: 'text',
				text: `Program to połowa pracy — druga to **okablowanie**. W szafie sterowniczej prawie wszystko pracuje na **24 V DC**:

- **L+** (często czerwony przewód) to +24 V z zasilacza, **M** (niebieski) to 0 V,
- sterownik ma osobne zaciski zasilania (np. *L+ / M*) i moduły wejść (DI) oraz wyjść (DQ),
- wejścia mają **wspólny zacisk** (np. *1M*) — od tego, gdzie go podłączysz, zależy, jakie czujniki zadziałają.

Wejście PLC to w środku **transoptor**: dioda, przez którą musi popłynąć prąd (kilka mA). Prąd płynie tylko wtedy, gdy między zaciskiem wejścia (np. *I0.0*) a wspólnym *1M* jest **różnica napięć** 24 V.`
			},
			{
				kind: 'text',
				text: `Czujniki zbliżeniowe i optyczne mają zwykle **3 przewody**: brązowy **BN** (+24 V), niebieski **BU** (0 V) i czarny **BK** (sygnał). W środku jest tranzystor, który przełącza czarny przewód:

- **PNP** — przy wykryciu podaje na sygnał **+24 V** („daje plus”),
- **NPN** — przy wykryciu zwiera sygnał do **0 V** („daje minus”).

Sprawdź sam, która kombinacja działa:`
			},
			{ kind: 'wiring' },
			{
				kind: 'table',
				head: ['Czujnik', 'Wejście PLC', 'Wspólny zacisk 1M', 'Gdzie spotkasz'],
				rows: [
					['PNP (daje +24 V)', 'sink („pobiera” prąd)', 'na 0 V (M)', 'Europa — standard'],
					[
						'NPN (daje 0 V)',
						'source („oddaje” prąd)',
						'na +24 V (L+)',
						'Azja, USA, starsze maszyny'
					]
				]
			},
			{
				kind: 'callout',
				tone: 'warn',
				title: 'Czujnik świeci, a PLC nic nie widzi',
				text: 'Klasyczny problem przy uruchomieniu: dioda w czujniku się zapala, a wejście PLC nie. Najczęściej to **niepasujący typ** (NPN na wejściu sink) albo brak połączenia wspólnego zacisku 1M. Zawsze sprawdź **diodę wejścia na module** — to ona mówi, co widzi sterownik.'
			},
			{
				kind: 'text',
				text: `**Wyjścia** są dwóch rodzajów:

- **przekaźnikowe** — w środku jest mały przekaźnik, więc przełączysz prawie wszystko: 24 V DC albo 230 V AC, ale powoli (najwyżej kilka razy na sekundę) i styk się zużywa,
- **tranzystorowe** — tylko prąd stały 24 V i niewielki prąd (ok. 0,5 A), za to bardzo szybko i bez zużycia.

Wyjście PLC **nie zasila silnika** bezpośrednio. Steruje cewką **stycznika** (albo przekaźnika pośredniczącego), a dopiero styki stycznika załączają silnik 400 V. Między stycznikiem a silnikiem jest jeszcze zabezpieczenie (wyłącznik silnikowy / przekaźnik termiczny).`
			},
			{
				kind: 'table',
				head: ['Co załączasz', 'Wyjście przekaźnikowe', 'Wyjście tranzystorowe'],
				rows: [
					['Lampka 24 V DC', '✓', '✓'],
					['Cewka stycznika 230 V AC', '✓', '✗ — przez przekaźnik pośredniczący'],
					['Grzałka sterowana PWM (np. 1 Hz)', '✗ — szybko się zużyje', '✓ (przez przekaźnik SSR)'],
					['Silnik 3 × 400 V', 'tylko przez stycznik', 'tylko przez stycznik']
				]
			},
			{
				kind: 'callout',
				tone: 'tip',
				title: 'Dioda gasząca',
				text: 'Cewka przekaźnika lub stycznika to indukcyjność — przy wyłączeniu daje skok napięcia, który niszczy wyjścia tranzystorowe. Dlatego cewki DC mają **diodę gaszącą** (a AC — układ RC lub warystor).'
			},
			{
				kind: 'callout',
				tone: 'info',
				title: 'Potwierdzenie z obiektu',
				text: 'Wyjście = 1 nie znaczy, że silnik się kręci: stycznik może się nie załączyć, a termik zadziałać. Dlatego styk pomocniczy stycznika wraca na **wejście** PLC jako potwierdzenie. W widoku Circuit znajdziesz urządzenie *Contactor + feedback* z przyciskiem *Trip* do symulowania awarii.'
			},
			{
				kind: 'quiz',
				question: 'Masz czujnik PNP. Gdzie podłączysz wspólny zacisk 1M modułu wejść (typu sink)?',
				options: ['Do +24 V (L+)', 'Do 0 V (M)', 'Do czarnego przewodu czujnika'],
				correct: 1,
				explanation:
					'PNP podaje +24 V na wejście, więc po drugiej stronie transoptora (1M) musi być **0 V** — wtedy płynie prąd.'
			},
			{
				kind: 'quiz',
				question:
					'Grzałkę 230 V chcesz włączać i wyłączać co sekundę (PWM). Które rozwiązanie jest dobre?',
				options: [
					'Wyjście przekaźnikowe PLC bezpośrednio',
					'Wyjście tranzystorowe PLC → przekaźnik półprzewodnikowy (SSR) → grzałka',
					'Wyjście tranzystorowe PLC bezpośrednio do grzałki'
				],
				correct: 1,
				explanation:
					'Przekaźnik mechaniczny zużyje się po kilku dniach takiej pracy, a wyjście tranzystorowe nie przełączy 230 V AC. SSR przełącza szybko, bez styków, a steruje się go z 24 V DC.'
			},
			{
				kind: 'quiz',
				question:
					'Wyjście Q0.0 = 1, lampka na module świeci, a silnik stoi. Co sprawdzisz najpierw?',
				options: [
					'Program — na pewno ma błąd',
					'Obwód za wyjściem: cewkę stycznika, jej zasilanie, zabezpieczenie silnika (termik)',
					'Wymienisz sterownik'
				],
				correct: 1,
				explanation:
					'Skoro wyjście jest załączone, program zrobił swoje. Problem jest dalej — dlatego warto mieć styk zwrotny stycznika na wejściu i wykrywać „wysterowany, a brak potwierdzenia”.'
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

	/* ------------------------------------------------------------------ liczby */
	{
		slug: 'liczby-i-analog',
		title: 'Liczby i sygnały analogowe',
		summary: 'Typy danych, przepełnienie, 4–20 mA i 0–10 V, skalowanie na stopnie i bary.',
		minutes: 9,
		blocks: [
			{
				kind: 'text',
				text: `Do tej pory wszystko było 0 albo 1. Ale temperatura, ciśnienie, prędkość czy liczba sztuk to **liczby** — i każda ma swój **typ danych**, czyli ile miejsca zajmuje w pamięci i jakie wartości mieści.`
			},
			{
				kind: 'table',
				head: ['Typ', 'Rozmiar', 'Zakres', 'Adres / przykład'],
				rows: [
					['BOOL', '1 bit', '0 / 1', 'I0.0, M0.0'],
					['BYTE', '8 bitów', '0 … 255', 'MB4'],
					['INT', '16 bitów', '−32 768 … 32 767', 'MW10 — liczniki, wartości analogowe'],
					['DINT', '32 bity', '±2 147 483 647', 'MD20 — duże liczniki, czas w ms'],
					['REAL', '32 bity', 'ułamki, ~7 cyfr', 'MD24 — temperatury, wyniki obliczeń'],
					['TIME', '32 bity', 'T#5s, T#1m30s', 'czasy timerów']
				]
			},
			{
				kind: 'callout',
				tone: 'warn',
				title: 'Przepełnienie',
				text: 'INT mieści najwyżej 32 767. Dodaj 1 — i dostaniesz **−32 768**, bo liczba „przekręca się” jak licznik w samochodzie. Licznik sztuk, który działa latami, trzymaj w DINT. A przy dzieleniu liczb całkowitych pamiętaj: `7 / 2 = 3` — ułamek ginie, więc do obliczeń z ułamkami używaj REAL.'
			},
			{
				kind: 'text',
				text: `**Sygnał analogowy** to wartość ciągła, np. z czujnika temperatury albo ciśnienia. W przemyśle najczęściej spotkasz:

- **4–20 mA** — prąd w pętli; 4 mA = początek zakresu, 20 mA = koniec. Odporny na zakłócenia i długie kable,
- **0–10 V** — napięcie; prostszy, ale wrażliwszy na spadki napięcia na długich przewodach.

Karta wejść analogowych zamienia sygnał na liczbę całkowitą. W sterownikach Siemens pełny zakres to **0 … 27 648** (w innych np. 0 … 32 000 albo 0 … 4095). Tę surową wartość program musi **przeskalować** na jednostki: °C, bary, procenty.`
			},
			{ kind: 'analog' },
			{
				kind: 'code',
				title: 'Skalowanie w ST',
				code: `VAR
    raw   : INT;    (* surowa wartość z karty, np. IW64 *)
    temp  : REAL;   (* °C *)
    alarm : BOOL;
END_VAR

(* zakres czujnika 0 … 150 °C, karta 0 … 27648 *)
temp := INT_TO_REAL(raw) / 27648.0 * 150.0;

(* zerwanie przewodu 4–20 mA: karta podaje 32767 *)
alarm := raw = 32767;`
			},
			{
				kind: 'callout',
				tone: 'tip',
				title: 'Dlaczego 4 mA, a nie 0?',
				text: 'To tzw. **żywe zero**. Przy 4–20 mA prąd zawsze płynie, więc 0 mA oznacza awarię: zerwany przewód albo brak zasilania czujnika — sterownik od razu to wykrywa. Przy 0–10 V zerwany przewód wygląda jak poprawny pomiar „0”.'
			},
			{
				kind: 'quiz',
				question: 'Czujnik ciśnienia 0–10 bar, sygnał 4–20 mA. Jakie ciśnienie oznacza 12 mA?',
				options: ['6 bar', '5 bar', '1,2 bar'],
				correct: 1,
				explanation:
					'12 mA to połowa zakresu 4–20 mA ((12 − 4) / 16 = 50 %), więc połowa z 0–10 bar = **5 bar**.'
			},
			{
				kind: 'quiz',
				question: 'Licznik w MW10 (INT) ma wartość 32 767. Co się stanie po dodaniu 1?',
				options: ['Zostanie 32 767', 'Będzie −32 768 (przepełnienie)', 'Sterownik się zatrzyma'],
				correct: 1,
				explanation:
					'INT ma 16 bitów — po 32 767 liczba przechodzi na −32 768. Do dużych wartości używaj DINT.'
			},
			{
				kind: 'quiz',
				question: 'Dlaczego w przemyśle wybiera się 4–20 mA zamiast 0–20 mA?',
				options: [
					'Bo jest tańsze',
					'Bo prąd poniżej 4 mA oznacza awarię (np. zerwany przewód), którą sterownik wykryje',
					'Bo czujniki nie potrafią podać 0 mA'
				],
				correct: 1,
				explanation:
					'Żywe zero: każda wartość z zakresu ma przepływ prądu, a jego brak to diagnoza.'
			},
			{
				kind: 'lesson',
				slug: 'crane-positioning',
				text: 'Suwnica z enkoderem: pozycjonowanie z dwiema prędkościami, uchyb liczony blokiem SUB, krańcówki i blokady.'
			}
		]
	},

	/* ------------------------------------------------------------------ podstawy automatyki */
	{
		slug: 'podstawy-automatyki',
		title: 'Podstawy automatyki: sprzężenie zwrotne i obiekty regulacji',
		summary:
			'Układ otwarty i zamknięty, typowe obiekty (inercja, opóźnienie, całkowanie, oscylacje), odczyt K, T i τ z odpowiedzi skokowej i pierwsze nastawy regulatora.',
		minutes: 12,
		blocks: [
			{
				kind: 'text',
				text: `**Sterowanie w układzie otwartym**: wysyłasz rozkaz i nie sprawdzasz efektu (grzałka na 50 % „i jakoś to będzie”). **Regulacja w układzie zamkniętym**: mierzysz wielkość regulowaną (PV), porównujesz z zadaną (SP), a **uchyb** e = SP − PV decyduje o sterowaniu. To jest **sprzężenie zwrotne** — działa nawet wtedy, gdy obiekt się zmienia albo przychodzą zakłócenia (otwarte drzwi pieca, zimny wsad).

Zanim dobierzesz regulator, poznaj **obiekt**. Najprostszy eksperyment: zmień skokowo sterowanie i zapisz, co się dzieje — to **odpowiedź skokowa**.`
			},
			{
				kind: 'table',
				head: ['Obiekt', 'Odpowiedź na skok', 'Przykład'],
				rows: [
					[
						'Proporcjonalny z inercją',
						'rośnie wykładniczo i się ustala',
						'temperatura pieca, prędkość taśmy'
					],
					[
						'Z opóźnieniem (martwy czas τ)',
						'przez chwilę nic, potem reakcja',
						'transport materiału taśmą, długa rura'
					],
					[
						'Całkujący',
						'rośnie bez końca (aż do ograniczenia)',
						'poziom w zbiorniku przy stałym dopływie, pozycja osi'
					],
					[
						'Oscylacyjny II rzędu',
						'przestrzeliwuje i się buja',
						'ramię dźwigu, słabo tłumiony napęd'
					]
				]
			},
			{ kind: 'step-lab' },
			{
				kind: 'text',
				text: `**Jak czytać wykres** obiektu z inercją i opóźnieniem:

- **K** (wzmocnienie) — o ile zmieniło się wyjście po ustaleniu, na jednostkę skoku wejścia,
- **τ** (opóźnienie) — ile czasu nic się nie działo,
- **T** (stała czasowa) — czas od końca opóźnienia do osiągnięcia **63 %** zmiany końcowej.

Im większy stosunek **τ / T**, tym trudniej regulować: regulator „nie widzi” skutków swoich decyzji. Dlatego krótkie przewody pomiarowe, czujnik blisko elementu wykonawczego i szybkie pomiary to połowa sukcesu.

**Reguła SIMC** daje bezpieczne nastawy regulatora PI wprost z K, T i τ: **Kp = T / (K · 2τ)**, **Ti = min(T, 8τ)**. To dobry punkt startu — potem stroisz na obiekcie.`
			},
			{
				kind: 'callout',
				tone: 'tip',
				title: 'Zasady na obiekcie',
				text: 'Zmieniaj jedną nastawę naraz. Za duże Kp → oscylacje; za małe Ti → przeregulowanie i „bujanie” całki. Obiekt całkujący (poziom) często wystarczy regulator P albo dwustawny z histerezą. Przy regulatorze zawsze sprawdź kierunek działania: czy wzrost sterowania podnosi czy obniża wartość mierzoną.'
			},
			{
				kind: 'quiz',
				question:
					'Po skoku mocy temperatura przez 3 s się nie zmienia, potem rośnie i po kolejnych 12 s osiąga 63 % zmiany. Ile wynoszą τ i T?',
				options: [
					'τ = 3 s, T = 12 s',
					'τ = 15 s, T = 12 s',
					'τ = 3 s, T = 15 s',
					'τ = 0, T = 15 s'
				],
				correct: 0,
				explanation:
					'Opóźnienie to czas bez reakcji (3 s), stałą czasową liczy się od końca opóźnienia do 63 % (12 s).'
			},
			{
				kind: 'quiz',
				question: 'Który obiekt jest całkujący?',
				options: [
					'Piec: przy stałej mocy temperatura się ustala',
					'Zbiornik: przy stałej nadwyżce dopływu poziom rośnie bez końca',
					'Taśma: prędkość ustala się po rampie',
					'Wentylator: przepływ zależy od prędkości'
				],
				correct: 1,
				explanation:
					'Wyjście obiektu całkującego to suma (całka) wejścia w czasie — nie ma stanu ustalonego przy niezerowym wejściu.'
			}
		]
	},
	/* ------------------------------------------------------------------ regulacja */
	{
		slug: 'regulacja',
		title: 'Regulacja: dwustawna i PID',
		summary: 'Jak utrzymać temperaturę: włącz/wyłącz z histerezą, a potem regulator PID.',
		minutes: 12,
		blocks: [
			{
				kind: 'text',
				text: `**Regulacja** to utrzymywanie wielkości (temperatury, poziomu, ciśnienia) na zadanej wartości mimo zakłóceń. Zawsze są te same elementy:

- **SP** (*setpoint*) — wartość zadana, np. 120 °C,
- **PV** (*process value*) — wartość zmierzona, np. z czujnika przez kartę analogową,
- **uchyb** e = SP − PV — o ile się mylimy,
- **wyjście regulatora** — co robimy z obiektem, np. moc grzałki 0–100 %.

Najprostszy sposób to **regulacja dwustawna**: za zimno → grzałka 100 %, za ciepło → 0 %. Żeby grzałka nie przełączała się co cykl, dodaje się **histerezę**: włącz poniżej SP − h/2, wyłącz powyżej SP + h/2. Tak samo działa żelazko i termostat w lodówce — i tak sterowałeś pompą w zbiorniku.`
			},
			{ kind: 'control', initial: 'onoff' },
			{
				kind: 'callout',
				tone: 'info',
				title: 'Zobacz na wykresie',
				text: 'Temperatura **przestrzeliwuje** granice histerezy, bo grzałka i powietrze mają bezwładność: po wyłączeniu gorąca grzałka dalej grzeje. Zmniejsz histerezę do 0 — grzałka zacznie przełączać się bardzo często (to niszczy styczniki), a wahania i tak nie znikną.'
			},
			{
				kind: 'text',
				text: `Gdy wahania są niedopuszczalne, stosuje się **regulator PID**. Jego wyjście to suma trzech składników:

- **P** (proporcjonalny) = Kp · e — im większy uchyb, tym mocniej grzeje. Sam P zostawia jednak **uchyb ustalony**: temperatura stanie trochę poniżej SP,
- **I** (całkujący) — sumuje uchyb w czasie i dokłada mocy tak długo, aż uchyb zniknie. Im mniejszy **Ti**, tym szybciej (ale łatwiej o oscylacje),
- **D** (różniczkujący) — reaguje na szybkość zmian; hamuje, gdy temperatura szybko rośnie, i zmniejsza przeregulowanie. Mocno wzmacnia szumy, więc używa się go ostrożnie.

Spróbuj: ustaw **Ti = wył.** (sam P) i zobacz uchyb ustalony. Potem włącz Ti = 60 s. Na koniec zmniejsz Ti do 15 s i zwiększ Kp — pojawią się oscylacje.`
			},
			{ kind: 'control', initial: 'pid' },
			{
				kind: 'callout',
				tone: 'tip',
				title: 'Jak stroić w praktyce',
				text: '1. Zacznij od samego P, zwiększaj Kp, aż odpowiedź będzie szybka, ale bez dużych oscylacji. 2. Dodaj I, żeby usunąć uchyb ustalony — zacznij od dużego Ti i zmniejszaj. 3. D tylko jeśli trzeba ograniczyć przeregulowanie. Wyjście PID 0–100 % na grzałkę z wyjścia cyfrowego zamienia się na **PWM**: np. 30 % = grzałka włączona 3 s z każdych 10 s (przez SSR, patrz rozdział o podłączeniach).'
			},
			{
				kind: 'callout',
				tone: 'warn',
				title: 'Anti-windup',
				text: 'Gdy wyjście jest już na 100 %, a temperatura wciąż za niska (np. przy rozgrzewaniu), część I rosłaby bez końca i potem długo „odwijała się” z dużym przeregulowaniem. Dobre regulatory — także ten na wykresie — zatrzymują wtedy całkowanie.'
			},
			{
				kind: 'quiz',
				question:
					'Regulator P (bez I) utrzymuje 115 °C przy zadanej 120 °C. Co pomoże najbardziej?',
				options: ['Dodanie członu I (całkującego)', 'Zwiększenie histerezy', 'Dodanie członu D'],
				correct: 0,
				explanation:
					'Sam P potrzebuje uchybu, żeby w ogóle dawać moc — stąd uchyb ustalony. Człon I sumuje uchyb i dokłada mocy, aż uchyb spadnie do zera.'
			},
			{
				kind: 'quiz',
				question: 'Po co histereza w regulacji dwustawnej?',
				options: [
					'Żeby temperatura była dokładniejsza',
					'Żeby grzałka nie przełączała się bez przerwy wokół wartości zadanej',
					'Żeby regulator działał szybciej'
				],
				correct: 1,
				explanation:
					'Bez histerezy szum czujnika i drobne wahania przełączałyby wyjście co chwilę — styczniki i przekaźniki szybko by się zużyły.'
			},
			{
				kind: 'quiz',
				question: 'Temperatura mocno oscyluje wokół SP. Który ruch najpewniej ją uspokoi?',
				options: ['Zmniejszenie Ti', 'Zmniejszenie Kp albo zwiększenie Ti', 'Zwiększenie Kp'],
				correct: 1,
				explanation:
					'Oscylacje to zwykle zbyt „agresywny” regulator: za duże Kp albo za mały Ti (za silne całkowanie).'
			},
			{
				kind: 'lesson',
				slug: 'oven-pid',
				text: 'Dostrój prawdziwy regulator PI pieca w Structured Text: Kp, Ti, anti-windup i blokada drzwi.'
			},
			{
				kind: 'lesson',
				slug: 'oven-pid-lad',
				text: 'Ten sam piec w drabince — gotowy blok PID z biblioteki, jak PID_Compact w TIA Portal.'
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
			},
			{
				kind: 'text',
				text: `Trzeci język „do logiki” to **FBD** (Function Block Diagram, w Siemensie **FUP**). Program to bloki połączone liniami: bramka **&** (AND), **>=1** (OR), porównania, timery i liczniki. Sygnał płynie od wejść po lewej do przypisań po prawej, a **kółko** na wejściu bloku to negacja (jak styk rozwierny). Elektronikom FBD przypomina schemat bramek — w wielu firmach (energetyka, wod-kan, procesy ciągłe) to podstawowy język.`
			},
			{
				kind: 'table',
				head: ['Drabinka (LAD)', 'FBD', 'ST'],
				rows: [
					['styki szeregowo', 'blok & (AND)', 'A AND B'],
					['styki równolegle', 'blok >=1 (OR)', 'A OR B'],
					['styk rozwierny', 'kółko na wejściu', 'NOT A'],
					['cewki (S) i (R)', 'przerzutnik SR / RS albo wyjście S, R', 'IF … THEN … := TRUE'],
					['timer TON', 'blok TON z IN i PT', 't(IN := …, PT := …)']
				]
			},
			{
				kind: 'lesson',
				slug: 'tank-fbd',
				text: 'Zbiornik w FBD: przerzutnik SR z negacją na wejściu zamiast dwóch cewek S / R.'
			}
		]
	},

	/* ------------------------------------------------------------------ organizacja */
	{
		slug: 'organizacja',
		title: 'Organizacja programu: bloki i struktura',
		summary: 'OB, FC, FB, DB, instancje — i jak ułożyć większy program, żeby dało się go utrzymać.',
		minutes: 9,
		blocks: [
			{
				kind: 'text',
				text: `Prawdziwa maszyna ma setki wejść i wyjść. Jeden długi program byłby nie do ogarnięcia, dlatego norma IEC 61131-3 (i każdy producent) dzieli program na **bloki**:

- **OB** (*organization block*) — wywołuje je system sterownika. **OB1** to program cykliczny (to, co do tej pory pisałeś), **OB100** wykonuje się raz przy starcie, inne — co zadany czas albo przy przerwaniu,
- **FC** (*function*) — funkcja **bez pamięci**: dla tych samych wejść zawsze ten sam wynik, np. skalowanie wartości analogowej,
- **FB** (*function block*) — blok **z pamięcią** (zmienne statyczne). Każde użycie to osobna **instancja** z własnymi danymi, np. sterowanie jednym silnikiem,
- **DB** (*data block*) — pamięć na dane: instancji FB albo wspólne (receptury, liczniki produkcji).`
			},
			{
				kind: 'table',
				head: ['Blok', 'Pamięć między cyklami', 'Przykład'],
				rows: [
					['OB1', '—', 'Program główny, wywołuje resztę'],
					['FC', 'nie', 'Skalowanie 4–20 mA → °C, przeliczanie jednostek'],
					[
						'FB + instancja (DB)',
						'tak',
						'Silnik: start/stop, czas pracy, alarm braku potwierdzenia'
					],
					['DB globalny', 'tak', 'Receptury, parametry, statystyki']
				]
			},
			{
				kind: 'text',
				text: `Znasz już FB — to **TON**, **CTU**, **R_TRIG**! Kiedy w ST piszesz \`t1 : TON;\` i \`t2 : TON;\`, tworzysz dwie instancje tego samego bloku. Każda ma własne ET i Q, dlatego dwa timery nie przeszkadzają sobie nawzajem:`
			},
			{
				kind: 'sim',
				title: 'Dwie instancje jednego bloku',
				st: `VAR
    t1 : TON;
    t2 : TON;
END_VAR

t1(IN := A, PT := T#2s);
t2(IN := B, PT := T#2s);

LampaA := t1.Q;
LampaB := t2.Q;`,
				inputs: [
					{ address: 'I0.0', label: 'A', kind: 'toggle' },
					{ address: 'I0.1', label: 'B', kind: 'toggle' }
				],
				outputs: [
					{ address: 'Q0.0', label: 'LampaA', color: 'green' },
					{ address: 'Q0.1', label: 'LampaB', color: 'amber' }
				],
				trace: [{ address: 'A' }, { address: 'LampaA' }, { address: 'B' }, { address: 'LampaB' }],
				caption: 'Włącz A, a po sekundzie B — każdy timer odlicza swoje 2 s osobno.'
			},
			{
				kind: 'code',
				title: 'Własny blok FB w ST (np. w TIA Portal, CODESYS)',
				code: `FUNCTION_BLOCK FB_Silnik
VAR_INPUT
    Start, Stop, Potwierdzenie : BOOL;
END_VAR
VAR_OUTPUT
    Stycznik, Awaria : BOOL;
END_VAR
VAR
    brakPotw : TON;          (* pamięć instancji *)
END_VAR

Stycznik := (Start OR Stycznik) AND NOT Stop AND NOT Awaria;
brakPotw(IN := Stycznik AND NOT Potwierdzenie, PT := T#2s);
IF brakPotw.Q THEN Awaria := TRUE; END_IF;
END_FUNCTION_BLOCK

(* w OB1 — trzy silniki, trzy instancje, jeden kod: *)
Pompa1(Start := S1, Stop := P1, Potwierdzenie := K1_FB);
Pompa2(Start := S2, Stop := P2, Potwierdzenie := K2_FB);
Wentylator(Start := S3, Stop := P3, Potwierdzenie := K3_FB);`
			},
			{
				kind: 'callout',
				tone: 'info',
				title: 'W PLC Sim',
				text: 'W ST piszesz własne `FUNCTION_BLOCK`, `FUNCTION` i `STRUCT` (w widoku **Blocks** — biblioteka projektu, bloki widać potem w palecie drabinki). Do tego tablice, `VAR RETAIN` i przerwanie cykliczne — poniżej.'
			},
			{
				kind: 'text',
				text: `Dobre praktyki, które docenisz przy pierwszej awarii o 3 w nocy:

1. **Kolejność w programie**: najpierw odczyt i obróbka wejść (skalowanie, filtry), potem logika i sekwencje, na końcu zapis wyjść — każde wyjście w **jednym** miejscu.
2. **Symbole zamiast adresów** i spójne nazwy, np. \`M01_Pompa_Start\`, \`B12_Poziom_Max\` — z oznaczeniem urządzenia ze schematu elektrycznego.
3. **Komentarz do każdego networku**: *po co*, a nie *co* („Stop ma pierwszeństwo — wymóg bezpieczeństwa”).
4. **Jeden typowy problem = jeden blok**: silnik, zawór, siłownik z krańcówkami. Raz przetestowany blok używasz wiele razy.
5. **Alarmy i diagnostyka** od początku: brak potwierdzenia, przekroczony czas ruchu, zerwanie przewodu analogowego.`
			},
			{
				kind: 'quiz',
				question: 'Masz 10 identycznych zaworów z krańcówkami. Co napiszesz?',
				options: [
					'10 kopii tej samej logiki z innymi adresami',
					'Jeden blok FB i 10 jego instancji',
					'Jedną funkcję FC, bo zawory nie potrzebują pamięci'
				],
				correct: 1,
				explanation:
					'Zawór ma stan (np. czas ruchu, alarm), więc to FB z pamięcią. 10 instancji = 10 kompletów danych i jeden kod — poprawka w jednym miejscu działa wszędzie.'
			},
			{
				kind: 'quiz',
				question: 'Czym różni się FC od FB?',
				options: [
					'FC jest szybsza',
					'FB ma pamięć między wywołaniami (instancję), FC nie',
					'FC można wywołać tylko z OB1'
				],
				correct: 1,
				explanation:
					'Funkcja (FC) liczy wynik z wejść i niczego nie pamięta. Blok funkcyjny (FB) ma zmienne statyczne zapisane w swojej instancji.'
			},
			{
				kind: 'quiz',
				question: 'Który komentarz do networku jest najbardziej przydatny?',
				options: [
					'„Styk I0.1 NC w szeregu z Q0.0”',
					'„Stop ma pierwszeństwo — wymóg bezpieczeństwa, nie zmieniać kolejności”',
					'„Network 3”'
				],
				correct: 1,
				explanation:
					'Co robi network, widać na schemacie. Komentarz powinien wyjaśniać **dlaczego** — szczególnie rzeczy, których nie wolno „poprawić”.'
			},
			{
				kind: 'code',
				title: 'FUNCTION_BLOCK w Structured Text — tak piszesz go w tym symulatorze',
				code: `FUNCTION_BLOCK Motor
VAR_INPUT
  Start, Stop : BOOL;
END_VAR
VAR_OUTPUT
  Run : BOOL;
END_VAR
Run := (Start OR Run) AND Stop;
END_FUNCTION_BLOCK

VAR
  m1 : Motor;           // instancja = własna pamięć
  m2 : Motor;
END_VAR
m1(Start := S1, Stop := S2, Run => K1);
m2(Start := S3, Stop := S4);
K2 := m2.Run;           // wyjście czytasz też przez kropkę`
			},
			{
				kind: 'text',
				text: 'Działają też `FUNCTION Nazwa : TYP` (wynik przypisujesz do nazwy funkcji, wywołujesz w wyrażeniu) i typy `TYPE … : STRUCT … END_STRUCT END_TYPE`. Wewnętrzne zmienne bloku (VAR) są niewidoczne z zewnątrz, a wyjść (VAR_OUTPUT) nie da się zapisać spoza bloku — kompilator to sprawdza.'
			},
			{
				kind: 'lesson',
				slug: 'fb-motor',
				text: 'Napisz blok silnika z kontrolą styku zwrotnego i użyj go w trzech instancjach.'
			},
			{
				kind: 'text',
				text: `Na obiekcie każdy silnik, zawór i siłownik ma **ten sam blok** — tak zwany standard urządzenia (w procesach: *Control Module* z ISA-88). Dzięki temu operator wszędzie obsługuje urządzenie tak samo, a utrzymanie ruchu wie, gdzie szukać. Typowy interfejs:

- **tryby**: Auto (sterowanie z sekwencji), Ręczny (z panelu), czasem Serwis i Lokalny (z kasety przy maszynie),
- **permisywy** — warunki potrzebne do *startu* (jest woda, zawór otwarty, taśma za mną pracuje); ich zanik nie zatrzymuje pracującego urządzenia,
- **blokady (interlocki)** — warunki, które *zatrzymują natychmiast*, w każdym trybie (za wysokie ciśnienie, otwarta osłona, taśma za mną stanęła),
- **nadzór**: rozkaz bez potwierdzenia (styk pomocniczy, krańcówka) w zadanym czasie = alarm, kwitowany przez operatora,
- **stany dla HMI**: gotowy, pracuje, alarm, tryb — zawsze te same kolory i symbole na wszystkich ekranach.

Różnica między permisywem a blokadą to klasyczne pytanie na rozmowie kwalifikacyjnej.`
			},
			{
				kind: 'quiz',
				question:
					'Pompa pracuje. Poziom w zbiorniku ssawnym spadł poniżej czujnika „woda jest” (warunek startu). Co robi standardowy blok silnika?',
				options: [
					'Zatrzymuje pompę, bo warunek zniknął',
					'Pompa pracuje dalej — permisyw jest potrzebny tylko do startu; zatrzymać ją może blokada',
					'Przełącza się w tryb ręczny'
				],
				correct: 1,
				explanation:
					'Permisyw sprawdza się przy starcie. Jeśli zanik ma zatrzymać pompę (np. ochrona przed suchobiegiem), to jest to **blokada** — osobne wejście bloku, działające zawsze.'
			},
			{
				kind: 'lesson',
				slug: 'std-motor',
				text: 'Napisz standardowy blok silnika: tryby, permisywy, blokady, nadzór stycznika i kwitowanie.'
			},
			{
				kind: 'lesson',
				slug: 'std-conveyors',
				text: 'Użyj go trzy razy w ciągu taśm: start od końca linii i kaskadowe zatrzymanie.'
			},
			{
				kind: 'text',
				text: `Trzy rzeczy, bez których nie obejdzie się żaden większy program:

1. **Tablice** — \`ARRAY[1..10] OF INT\`, także tablice struktur i instancji FB (\`motors : ARRAY[1..3] OF Motor;\` i \`motors[i](…)\` w pętli). Indeks może być zmienną. Typowe zastosowania: receptury, bufor ostatnich próbek, rejestr przesuwny śledzący detale na taśmie. Indeks spoza zakresu to w prawdziwym CPU błąd dostępu — pilnuj granic.
2. **Pamięć retencyjna** — zmienne z \`VAR RETAIN\` przeżywają zanik zasilania i ponowne ładowanie programu (w TIA Portal: kolumna *Retain* w interfejsie bloku). Liczniki sztuk, godziny pracy, ostatnia receptura. Zwykłe zmienne po restarcie wracają do wartości początkowych.
3. **Przerwanie cykliczne** (OB30 … OB38 w S7, zadanie cykliczne w CODESYS) — kod wywoływany co **stały** czas, np. 100 ms, niezależnie od tego, jak długo trwa cykl OB1. Tam umieszcza się regulatory PID i filtry, bo ich obliczenia zakładają stały czas próbkowania.`
			},
			{
				kind: 'code',
				title: 'Tablica, RETAIN i przerwanie cykliczne w PLC Sim',
				code: `VAR RETAIN
  parts : DINT;                       // zostaje po Stop → Run
END_VAR
VAR
  recipe : ARRAY[1..3] OF INT := [180, 200, 220];
  sel : INT := 1;
END_VAR
Setpoint := recipe[sel];

CYCLIC_INTERRUPT T#100ms               // jak OB30: co 100 ms
  (* próbkowanie, filtr, PID … *)
END_CYCLIC_INTERRUPT`
			},
			{
				kind: 'quiz',
				question: 'Dlaczego regulator PID umieszcza się w przerwaniu cyklicznym, a nie w OB1?',
				options: [
					'Bo OB1 nie może zapisywać wyjść analogowych',
					'Bo całkowanie i różniczkowanie zakładają stały czas próbkowania, a cykl OB1 się waha',
					'Bo przerwanie wykonuje się szybciej'
				],
				correct: 1,
				explanation:
					'Czas cyklu OB1 zależy od tego, które gałęzie programu akurat się wykonują i od komunikacji. Przerwanie cykliczne daje stałe Δt, na którym opierają się nastawy Ti i Td.'
			},
			{
				kind: 'lesson',
				slug: 'oven-filter',
				text: 'Filtr średniej kroczącej w przerwaniu cyklicznym, bufor w tablicy i licznik alarmów w RETAIN.'
			},
			{
				kind: 'text',
				text: `Sterownik nie jest idealnym kalkulatorem. Trzy rzeczy, które widać dopiero na obiekcie:

1. **Czas cyklu się zmienia.** Ustawia się *minimalny* czas cyklu (w PLC Sim 10 ms), ale gdy program liczy dłużej — długa pętla, rzadko wykonywana gałąź — cykl się wydłuża. Timery liczą prawdziwy czas, więc działają dalej poprawnie, ale wejścia są czytane rzadziej. Powyżej **maksymalnego czasu cyklu** (tu 150 ms) CPU wywołuje **OB80** (błąd czasu), a bez niego przechodzi w STOP.
2. **Błędy programowania** — indeks tablicy poza zakresem, odwołanie do nieistniejących danych — wywołują **OB121**. Na S7-1500 brak OB121 oznacza STOP całej maszyny z powodu jednej złej liczby z panelu operatorskiego.
3. **Bufor diagnostyczny** zapisuje zmiany trybu, wgrania programu i każdy błąd z czasem i numerem instrukcji. Przy awarii to pierwsze miejsce, do którego zagląda automatyk — w PLC Sim widok **Diagnostics**.

**OB100** (rozruch) wykonuje się raz przed pierwszym cyklem — tam ustawia się stan początkowy maszyny, np. „wszystkie siłowniki w pozycji bazowej”.`
			},
			{
				kind: 'quiz',
				question:
					'Operator wpisał na panelu numer receptury 7, a tablica ma 3 elementy. Co zrobi S7-1500 bez OB121?',
				options: [
					'Weźmie ostatni element tablicy',
					'Zapisze błąd w buforze diagnostycznym i przejdzie w STOP',
					'Zignoruje instrukcję i pojedzie dalej'
				],
				correct: 1,
				explanation:
					'Błąd dostępu to błąd programowania. Bez OB121 CPU S7-1500 zatrzymuje się, a wyjścia gasną. Dlatego dane z zewnątrz (HMI, sieć) zawsze sprawdza się przed użyciem jako indeksu.'
			},
			{
				kind: 'lesson',
				slug: 'recipe-index',
				text: 'Znajdź błąd: zły numer receptury zatrzymuje CPU. Bufor diagnostyczny, kontrola zakresu i OB121.'
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
			},
			{
				kind: 'lesson',
				slug: 'sfc-drilling',
				text: 'Ta sama stacja wiercenia jako diagram SFC / GRAFCET: kroki, akcje N i przejścia z czasem kroku.'
			},
			{
				kind: 'text',
				text: `**Pneumatyka** to chleb powszedni automatyka: siłowniki dociskają, przesuwają, wypychają. Sterownik nie steruje siłownikiem, tylko **zaworem**:

- **5/2 monostabilny** — cewka załączona = wysuw, wyłączona = sprężyna wraca zawór i siłownik się chowa. Zanik zasilania = siłownik wraca (dobre dla prasy, złe dla docisku trzymającego detal).
- **5/2 bistabilny** — dwie cewki, zawór pamięta ostatnie położenie. Po zaniku zasilania siłownik zostaje, gdzie był.
- **Kontaktrony** na cylindrze (magnes w tłoku) potwierdzają krańcowe położenia. Krok sekwencji czeka na kontaktron, a nie na czas — i każdy ruch ma **nadzór czasu**: jeśli kontaktron nie przyjdzie w 2 s, coś jest nie tak (brak powietrza, zablokowany siłownik, przesunięty kontaktron).

W notacji pneumatycznej sekwencję zapisuje się jako **A+ B+ B− A−** (+ wysuw, − powrót).`
			},
			{
				kind: 'lesson',
				slug: 'pneumatic-press',
				text: 'Prasa z dociskiem: sekwencja A+ B+ B− A− w CASE, nadzór ruchu i krok błędu.'
			},
			{
				kind: 'lesson',
				slug: 'mixer-batch',
				text: 'Mieszalnik wsadowy w SFC: dozowanie po poziomie, grzanie, blokady i zerwany przewód 4–20 mA.'
			}
		]
	},
	/* ------------------------------------------------------------------ panel HMI */
	{
		slug: 'panel-hmi',
		title: 'Panel operatorski (HMI) i alarmy',
		summary: 'Jak operator steruje maszyną z panelu i jak sterownik zgłasza awarie.',
		minutes: 8,
		blocks: [
			{
				kind: 'text',
				text: `Operator rzadko patrzy na sterownik — patrzy na **panel HMI** (*Human–Machine Interface*): ekran dotykowy obok maszyny. Panel nie ma własnej logiki: czyta i zapisuje **tagi** sterownika.

- **lampki, wartości, paski** — tylko czytają (np. \`Motor\`, temperatura z karty analogowej),
- **przyciski, przełączniki, pola liczbowe** — zapisują do sterownika, zawsze do **markerów M** (np. \`M10.0\`), nigdy do wejść I — te nadpisuje cykl PLC.

W programie przycisk z panelu łączysz LUB z przyciskiem na obiekcie: \`(Start OR HMI_Start)\`. W PLC Sim panel znajdziesz w zakładce **HMI** — projekt demo ma gotowy ekran.`
			},
			{
				kind: 'callout',
				tone: 'warn',
				title: 'Bezpieczeństwo',
				text: 'Wyłącznik awaryjny **nigdy** nie jest przyciskiem na panelu — panel może się zawiesić, a komunikacja zerwać. E-stop to fizyczny przycisk w obwodzie bezpieczeństwa. Panel może najwyżej pokazać, że został wciśnięty.'
			},
			{
				kind: 'text',
				text: `**Alarmy** to najważniejsza część panelu. Alarm to bit w sterowniku (np. \`Fault\`) z przypisanym tekstem. Każdy wpis ma stany:

- **C** (*came*) — przyszedł: bit = 1,
- **G** (*gone*) — ustąpił: bit wrócił do 0,
- **A** (*acknowledged*) — operator go **pokwitował** (ACK).

Alarm znika z listy dopiero, gdy ustąpił **i** został pokwitowany — dzięki temu krótkiej awarii w nocy nikt nie przeoczy. Przy kwitowaniu panel może dać impuls na bit \`ACK\`, którym program kasuje zapamiętane (SET) awarie.`
			},
			{
				kind: 'table',
				head: ['Klasa', 'Kolor', 'Przykład', 'Reakcja'],
				rows: [
					[
						'Alarm (awaria)',
						'czerwony',
						'zadziałał termik silnika',
						'maszyna staje, potrzebne kwitowanie'
					],
					[
						'Ostrzeżenie',
						'żółty',
						'zbliża się przegląd, niski poziom oleju',
						'praca dalej, informacja'
					],
					['Komunikat', 'szary / niebieski', 'tryb ręczny włączony', 'tylko informacja']
				]
			},
			{
				kind: 'callout',
				tone: 'tip',
				title: 'Dobry ekran (ISA-101)',
				text: 'Nowoczesne panele są **szare i spokojne**, a kolor oznacza tylko nieprawidłowość: czerwony = awaria, żółty = ostrzeżenie. Jeśli wszystko świeci na zielono i czerwono, operator nie zauważy tego jednego ważnego alarmu.'
			},
			{
				kind: 'quiz',
				question: 'Przycisk „Start” na panelu HMI powinien zapisywać…',
				options: [
					'bezpośrednio wejście I0.0, tak jak przycisk na szafie',
					'marker, np. M10.0, który program łączy LUB z przyciskiem na obiekcie',
					'wyjście Q0.0 silnika'
				],
				correct: 1,
				explanation:
					'Wejścia I są nadpisywane w każdym cyklu z zacisków, a pisanie prosto w wyjścia omija logikę i blokady programu. Panel pisze marker, a program decyduje.'
			},
			{
				kind: 'quiz',
				question: 'Awaria trwała 2 sekundy w nocy i ustąpiła. Co rano zobaczy operator?',
				options: [
					'Nic — alarm już nieaktywny',
					'Alarm w stanie „ustąpił, niepokwitowany”, który musi pokwitować',
					'Panel się zatrzyma'
				],
				correct: 1,
				explanation:
					'Alarm zostaje na liście do pokwitowania, nawet gdy ustąpił. Do tego służy kwitowanie — żeby nic nie umknęło.'
			},
			{
				kind: 'lesson',
				slug: 'hmi-start',
				text: 'Dodaj start i stop z panelu do działającej maszyny — bez psucia przycisków na szafie.'
			}
		]
	},

	/* ------------------------------------------------------------------ uruchomienie */
	{
		slug: 'uruchomienie',
		title: 'Uruchomienie maszyny',
		summary: 'Test sygnałów, typowe usterki okablowania i jak je znaleźć, zanim maszyna ruszy.',
		minutes: 8,
		blocks: [
			{
				kind: 'text',
				text: `**Uruchomienie** (*commissioning*) to moment, gdy program spotyka prawdziwą maszynę. Zwykle są dwa etapy:

- **FAT** (*Factory Acceptance Test*) — test u producenta maszyny, przed wysyłką,
- **SAT** (*Site Acceptance Test*) — test u klienta, po montażu i podłączeniu.

Zanim maszyna ruszy w automacie, robi się **test sygnałów** (*loop check*): każde wejście i wyjście po kolei, z dokumentacją w ręku — schematem elektrycznym i **listą I/O** (to Twoja tablica symboli).`
			},
			{
				kind: 'table',
				head: ['Co sprawdzasz', 'Jak', 'Typowa usterka'],
				rows: [
					[
						'Wejście cyfrowe',
						'wciśnij przycisk / zasłoń czujnik, patrz na diodę i adres',
						'zamienione przewody, NC zamiast NO, PNP na wejściu sink'
					],
					[
						'Wyjście cyfrowe',
						'wymuś wyjście (force) i patrz, co się załącza',
						'zamienione lampki, brak zasilania cewki'
					],
					[
						'Potwierdzenia',
						'załącz stycznik, sprawdź styk pomocniczy',
						'styk na złym wejściu, brak mostka'
					],
					[
						'Analog',
						'podaj znaną wartość (np. 12 mA), porównaj ze skalą',
						'zły zakres, zła polaryzacja, złe słowo'
					],
					['Napęd', 'ruch krokowo, kierunek obrotów, krańcówki', 'odwrócony kierunek, zła rampa']
				]
			},
			{
				kind: 'callout',
				tone: 'warn',
				title: 'Wymuszenia (force) z głową',
				text: 'Forsowanie wyjścia omija program — i jego blokady. Na prawdziwej maszynie przed wymuszeniem upewnij się, że nikogo nie ma w strefie i ruch nie spowoduje kolizji. Po teście **usuń wszystkie wymuszenia** — zapomniany force to klasyczna przyczyna „duchów” w działaniu maszyny.'
			},
			{
				kind: 'text',
				text: `Ćwiczenia „Uruchomienie” w PLC Sim działają jak prawdziwe: **program jest dobry**, a okablowanie ma ukryte błędy. Masz zakładkę **Test I/O** z listą sygnałów z dokumentacji, ich stanem na żywo i tym, co faktycznie jest podłączone. Testy na końcu sprawdzają maszynę przez obwód — więc przejdą dopiero, gdy poprawisz przewody.`
			},
			{
				kind: 'quiz',
				question:
					'Na teście sygnałów: nic nie wciskasz, a dioda wejścia czujnika B1 świeci. Najbardziej prawdopodobna przyczyna?',
				options: [
					'Błąd w programie',
					'Czujnik ustawiony / podłączony jako NC zamiast NO (albo coś stoi przed czujnikiem)',
					'Zbyt długi cykl PLC'
				],
				correct: 1,
				explanation:
					'Dioda wejścia pokazuje stan zacisku, niezależnie od programu. Świeci bez obiektu = czujnik daje sygnał w spoczynku: zły typ styku albo coś go zasłania.'
			},
			{
				kind: 'quiz',
				question: 'Dlaczego test sygnałów robi się przed uruchomieniem programu w automacie?',
				options: [
					'Bo tak każe norma, ale nic nie zmienia',
					'Żeby błąd okablowania nie spowodował niespodziewanego ruchu i żeby szybko odróżnić usterki elektryczne od błędów programu',
					'Żeby rozgrzać sterownik'
				],
				correct: 1,
				explanation:
					'Gdy wiesz, że każdy sygnał jest poprawny, problemy w automacie są już tylko w logice. A zamienione przewody w automacie mogą uruchomić nie ten napęd.'
			},
			{
				kind: 'lesson',
				slug: 'commissioning-conveyor',
				text: 'Uruchom przenośnik: program jest dobry, w okablowaniu kryją się cztery usterki.'
			}
		]
	},

	/* ------------------------------------------------------------------ falownik */
	{
		slug: 'falownik',
		title: 'Falownik: sterowanie prędkością silnika',
		summary:
			'Częstotliwość, rampy, sterowanie z PLC przez wejścia cyfrowe i analogowe, błędy napędu.',
		minutes: 8,
		blocks: [
			{
				kind: 'text',
				text: `Silnik asynchroniczny podłączony prosto do sieci kręci się zawsze z jedną prędkością (przy 50 Hz np. ok. 1450 obr/min). **Falownik** (*przemiennik częstotliwości, VFD*) zasila go napięciem o regulowanej częstotliwości — a prędkość silnika jest do niej proporcjonalna. 25 Hz ≈ połowa prędkości.

Do tego falownik daje: **łagodny rozruch i hamowanie** (rampy, np. 0 → 50 Hz w 3 s), zmianę kierunku, oszczędność energii (pompy, wentylatory) i własną diagnostykę — zabezpiecza silnik przed przeciążeniem.`
			},
			{
				kind: 'table',
				head: ['Sygnał', 'Kierunek', 'Typ', 'Znaczenie'],
				rows: [
					['RUN (DI1)', 'PLC → falownik', 'cyfrowy', 'praca w prawo'],
					['REV (DI2)', 'PLC → falownik', 'cyfrowy', 'praca w lewo'],
					['RESET (DI3)', 'PLC → falownik', 'cyfrowy (zbocze)', 'kasowanie błędu'],
					['Prędkość zadana (AI1)', 'PLC → falownik', 'analog, QW', '0 … 27648 = 0 … 50 Hz'],
					[
						'READY / FAULT / AT SPEED',
						'falownik → PLC',
						'cyfrowe (przekaźniki)',
						'gotowy / błąd / osiągnął prędkość'
					],
					['Prędkość rzeczywista (AO1)', 'falownik → PLC', 'analog, IW', '0 … 27648 = 0 … 50 Hz']
				]
			},
			{
				kind: 'text',
				text: `W większych maszynach te same informacje idą **siecią** (Profinet, EtherCAT, Modbus): sterownik wysyła *słowo sterujące* i prędkość, a dostaje *słowo statusowe* i prędkość rzeczywistą. Zasada się nie zmienia — tylko zamiast przewodów są bity w słowach.

W PLC Sim falownik dodasz w widoku Circuit (*Frequency inverter*). Ma przycisk **Trip** do symulowania awarii.`
			},
			{
				kind: 'callout',
				tone: 'warn',
				title: 'Typowe pułapki',
				text: '**RUN i REV naraz** w czasie pracy to błąd (falownik zgłosi awarię). **Reset** działa zwykle tylko przy wyłączonym RUN — więc program musi najpierw zdjąć RUN. Po awarii falownik **wybiega** (silnik zwalnia swobodnie), a nie hamuje rampą.'
			},
			{
				kind: 'quiz',
				question:
					'Prędkość zadana to słowo QW4, pełny zakres 27648 = 50 Hz. Co wpisać, żeby silnik pracował z 30 Hz?',
				options: ['30', '16589', '27648'],
				correct: 1,
				explanation: '30 / 50 · 27648 = **16589** (60 % zakresu).'
			},
			{
				kind: 'quiz',
				question:
					'Falownik zgłosił FAULT. Program wysyła RESET, ale błąd nie znika. Co sprawdzisz?',
				options: [
					'Czy w tym czasie RUN jest wyłączony — wiele falowników kasuje błąd tylko bez polecenia pracy',
					'Czy prędkość zadana jest większa od zera',
					'Nic, trzeba wymienić falownik'
				],
				correct: 0,
				explanation:
					'Kasowanie zwykle wymaga zbocza RESET przy zdjętym RUN (i usuniętej przyczynie błędu). Dlatego w programie awaria najpierw zrzuca RUN.'
			},
			{
				kind: 'lesson',
				slug: 'vfd-fan',
				text: 'Zaprogramuj wentylator z falownikiem: dwie prędkości, kierunek, kasowanie awarii.'
			},
			{
				kind: 'lesson',
				slug: 'commissioning-vfd',
				text: 'Uruchom pompę z falownikiem: trzy usterki w podłączeniu napędu.'
			}
		]
	},
	/* ------------------------------------------------------------------ falownik od środka */
	{
		slug: 'falownik-wnetrze',
		title: 'Falownik od środka: prostownik, obwód DC, IGBT i PWM',
		summary:
			'Skąd falownik bierze zmienną częstotliwość, dlaczego napięcie rośnie razem z nią (U/f) i czym się różni sterowanie wektorowe.',
		minutes: 10,
		blocks: [
			{
				kind: 'text',
				text: `Falownik ma trzy części:

- **Prostownik** — sześć diod zamienia sieć 3 × 400 V AC na napięcie stałe.
- **Obwód pośredni DC** — kondensatory wygładzają napięcie do ok. **560 V** (400 V × √2). To magazyn energii falownika.
- **Falownik właściwy** — sześć tranzystorów **IGBT** przełącza obwód DC na zaciski silnika kilka tysięcy razy na sekundę (częstotliwość nośna 4 … 16 kHz).

Tranzystory nie „robią” sinusoidy — dają prostokątne impulsy o pełnym napięciu DC. Sztuczka to **PWM** (modulacja szerokości impulsów): szerokość impulsów zmienia się jak sinusoida, a indukcyjność uzwojeń silnika wygładza prąd. Zmieniając tempo tej sinusoidy, zmieniamy częstotliwość, a więc prędkość silnika.`
			},
			{ kind: 'pwm' },
			{
				kind: 'text',
				text: `**Prędkość silnika asynchronicznego**: n = 60 · f / p · (1 − s), gdzie p to liczba par biegunów, a s to poślizg (kilka procent). Silnik 4-biegunowy (p = 2) przy 50 Hz kręci się ok. 1450 obr/min, przy 25 Hz — ok. 720.

**U/f = const**: strumień magnetyczny w silniku zależy od stosunku napięcia do częstotliwości. Przy 25 Hz falownik daje więc ok. połowę napięcia. Gdyby dał pełne 400 V, silnik by się nasycił i pobierał ogromny prąd. Powyżej 50 Hz napięcia już nie przybywa — to **osłabienie pola**, moment maleje.`
			},
			{
				kind: 'table',
				head: ['Tryb sterowania', 'Jak działa', 'Gdzie'],
				rows: [
					[
						'U/f (skalarny)',
						'napięcie proporcjonalne do częstotliwości, bez modelu silnika',
						'pompy, wentylatory, proste taśmy'
					],
					[
						'Wektorowy bez enkodera (SLVC)',
						'model silnika wylicza strumień i moment z prądów',
						'taśmy, mieszadła, duży moment przy niskich obrotach'
					],
					[
						'Wektorowy z enkoderem',
						'model + rzeczywista prędkość z enkodera',
						'dźwigi, nawijarki, moment przy zerowej prędkości'
					],
					[
						'Serwo',
						'silnik synchroniczny z magnesami, enkoder, pętla położenia',
						'osie CNC, roboty, pozycjonowanie'
					]
				]
			},
			{
				kind: 'callout',
				tone: 'warn',
				title: 'Praktyka: kabel silnikowy',
				text: 'Strome zbocza impulsów PWM to zakłócenia (EMC). Kabel od falownika do silnika ma być **ekranowany**, ekran podłączony obejmą na 360° po obu stronach, a przewody sygnałowe prowadzone osobno. Po wyłączeniu falownika kondensatory DC są naładowane jeszcze kilka minut — czas rozładowania jest na tabliczce.'
			},
			{
				kind: 'quiz',
				question:
					'Silnik 4-biegunowy, tabliczka: 1450 obr/min przy 50 Hz. Ile mniej więcej przy 30 Hz?',
				options: ['ok. 1450 obr/min', 'ok. 870 obr/min', 'ok. 2400 obr/min', 'ok. 300 obr/min'],
				correct: 1,
				explanation: 'Prędkość jest proporcjonalna do częstotliwości: 1450 · 30 / 50 ≈ 870 obr/min.'
			},
			{
				kind: 'quiz',
				question: 'Dlaczego przy 10 Hz falownik nie podaje na silnik pełnych 400 V?',
				options: [
					'Żeby oszczędzać energię',
					'Strumień ~ U/f: pełne napięcie przy niskiej częstotliwości nasyciłoby silnik i dało ogromny prąd',
					'Bo tranzystory IGBT nie wytrzymają',
					'Bo tak wymaga norma bezpieczeństwa'
				],
				correct: 1,
				explanation:
					'Charakterystyka U/f utrzymuje stały strumień. Przy 10 Hz napięcie to ok. 80 V (plus niewielkie podbicie na start, tzw. boost).'
			}
		]
	},
	/* ------------------------------------------------------------------ falownik w sieci */
	{
		slug: 'falownik-siec',
		title: 'Falownik w sieci: PROFIdrive, parametry i diagnoza błędów',
		summary:
			'Uruchomienie napędu, słowo sterujące i statusowe, maszyna stanów PROFIdrive oraz skąd się biorą przetężenie, przepięcie i przegrzanie.',
		minutes: 14,
		blocks: [
			{
				kind: 'text',
				text: `**Uruchomienie napędu** zaczyna się od danych silnika z tabliczki: napięcie, prąd, moc, częstotliwość i prędkość znamionowa (w SINAMICS G120 to parametry P0304 … P0311). Potem identyfikacja silnika (napęd mierzy rezystancje i indukcyjności) i parametry aplikacji:

- **P1080 / P1082** — minimalna i maksymalna prędkość,
- **P1120 / P1121** — czas rampy rozpędzania i hamowania,
- źródło rozkazów i wartości zadanej: zaciski (DI/AI) albo **sieć**.

W poprzednim rozdziale sterowałeś falownikiem z zacisków (RUN, AI1). Na większych maszynach napęd siedzi na **Profinecie** i wymienia z PLC cykliczny **telegram**. Najprostszy, standardowy **telegram 1** to dwa słowa w każdą stronę.`
			},
			{
				kind: 'table',
				head: ['Słowo', 'Kierunek', 'Znaczenie'],
				rows: [
					[
						'STW1',
						'PLC → napęd',
						'słowo sterujące: załącz, OFF1/OFF2/OFF3, zezwolenia, kwitowanie'
					],
					[
						'NSOLL_A',
						'PLC → napęd',
						'prędkość zadana: 16#4000 = 100 % prędkości odniesienia, ujemna = wstecz'
					],
					['ZSW1', 'napęd → PLC', 'słowo statusowe: gotowy, praca, błąd, prędkość osiągnięta'],
					['NIST_A', 'napęd → PLC', 'prędkość rzeczywista, ta sama skala']
				]
			},
			{
				kind: 'text',
				text: `Napęd PROFIdrive ma **maszynę stanów**. Po włączeniu jest w **S1 — blokada załączenia**. Żeby go uruchomić, PLC musi wysłać:

1. **16#047E** — wszystkie zezwolenia, ale ON = 0 → napęd przechodzi do **S2 — gotowy do załączenia**,
2. **16#047F** — ON = 1 → **S3**, a dzięki bitowi 3 (zezwolenie na pracę) od razu **S4 — praca**, silnik rusza rampą.

Zatrzymanie: **OFF1** (ON = 0, czyli znowu 047E) hamuje rampą P1121, **OFF2** (bit 1 = 0) wyłącza impulsy i silnik wybiega, **OFF3** (bit 2 = 0) to szybkie zatrzymanie. Błąd kwituje się **zboczem bitu 7**.`
			},
			{
				kind: 'code',
				title: 'Sterowanie napędem w ST',
				code: `IF Run THEN
  STW1 := 16#047F;              // ON
ELSE
  STW1 := 16#047E;              // OFF1 i gotowość
END_IF;
IF Ack THEN
  STW1 := STW1 OR 16#0080;      // kwitowanie błędu
END_IF;
NSOLL_A := 16#2000;             // 50 %
Running := (ZSW1 AND 16#0004) <> 0;
Fault   := (ZSW1 AND 16#0008) <> 0;`
			},
			{ kind: 'drive-lab' },
			{
				kind: 'table',
				head: ['Błąd', 'Typowa przyczyna', 'Co zrobić'],
				rows: [
					[
						'Przetężenie (F30001)',
						'za krótka rampa rozpędzania przy dużej bezwładności, zwarcie w kablu, zablokowany silnik',
						'wydłużyć P1120, sprawdzić kabel i izolację, mechanikę'
					],
					[
						'Przepięcie DC (F30002)',
						'za krótka rampa hamowania — silnik oddaje energię do obwodu DC',
						'wydłużyć P1121, rezystor hamujący (chopper) albo regulator Vdc'
					],
					[
						'Przegrzanie silnika (F07011)',
						'przeciążenie, zbyt długa praca na niskich obrotach z własnym wentylatorem',
						'sprawdzić obciążenie, chłodzenie, dobór silnika'
					],
					[
						'Brak wartości zadanej z sieci (F01910)',
						'przerwana komunikacja Profinet',
						'sprawdzić sieć; napęd zatrzymuje się sam (watchdog)'
					]
				]
			},
			{
				kind: 'callout',
				tone: 'tip',
				title: 'Diagnoza krok po kroku',
				text: 'Przy każdym błędzie napędu zapisz: kod błędu, prędkość i prąd w chwili błędu, co maszyna robiła (rozpędzanie, hamowanie, praca). Napęd przechowuje historię błędów z wartościami — w uruchomieniu to pierwsze miejsce, do którego się zagląda.'
			},
			{
				kind: 'quiz',
				question:
					'PLC wysyła od razu 16#047F po włączeniu zasilania, a napęd stoi w „blokadzie załączenia”. Dlaczego?',
				options: [
					'Zła prędkość zadana',
					'Brakuje przejścia przez 047E (ON = 0) — napęd wymaga zbocza ON',
					'Napęd ma błąd przegrzania',
					'Telegram 1 nie obsługuje startu'
				],
				correct: 1,
				explanation:
					'Z S1 do S2 napęd przechodzi tylko przy ON = 0 (i bez OFF2/OFF3). Dopiero potem ON = 1 go załącza.'
			},
			{
				kind: 'quiz',
				question:
					'Wentylator z dużym wirnikiem wybija przepięciem DC przy każdym zatrzymaniu. Najprostsza poprawka?',
				options: [
					'Skrócić rampę hamowania',
					'Wydłużyć rampę hamowania P1121 albo dodać rezystor hamujący',
					'Zwiększyć prędkość maksymalną',
					'Wyłączać napęd przez OFF3'
				],
				correct: 1,
				explanation:
					'Przy szybkim hamowaniu silnik pracuje jak prądnica i ładuje kondensatory DC. Dłuższa rampa albo rezystor (chopper) odbierają tę energię.'
			},
			{
				kind: 'lesson',
				slug: 'drive-profidrive',
				text: 'Steruj napędem przez Profinet: sekwencja 047E/047F, prędkość, status z ZSW1 i kwitowanie błędu.'
			}
		]
	},
	/* ------------------------------------------------------------------ komunikacja */
	{
		slug: 'komunikacja',
		title: 'Sieci przemysłowe: Profinet, Modbus, zdalne I/O',
		summary:
			'Dlaczego nie ciągnie się kabla do każdego czujnika, jak dane z sieci trafiają do obrazu procesu i co zrobić, gdy sieć padnie.',
		minutes: 10,
		blocks: [
			{
				kind: 'text',
				text: `Na dużej linii czujniki i napędy są dziesiątki metrów od szafy ze sterownikiem. Zamiast setek przewodów do kart wejść stawia się przy maszynie **zdalną stację I/O** (wyspę), a z PLC łączy ją jeden kabel sieciowy. Tak samo podłącza się falowniki, panele HMI i inne sterowniki.

Dla programu nic się nie zmienia: sygnały ze stacji pojawiają się w **obrazie procesu** pod adresami I i Q, tak jak z lokalnych kart. Sieć co kilka milisekund wymienia cały obraz — to **komunikacja cykliczna**.`
			},
			{
				kind: 'table',
				head: ['', 'Profinet / EtherNet/IP / EtherCAT', 'Modbus TCP / RTU'],
				rows: [
					[
						'Do czego',
						'I/O, napędy, czas rzeczywisty',
						'proste urządzenia, liczniki energii, integracja „z czymkolwiek”'
					],
					[
						'Kto pyta',
						'kontroler wymienia dane cyklicznie z każdym urządzeniem',
						'master (klient) pyta, slave (serwer) odpowiada'
					],
					[
						'Konfiguracja',
						'plik opisu urządzenia (GSDML, EDS, ESI), nazwa urządzenia, czas cyklu',
						'adres IP / ID stacji, mapa rejestrów z dokumentacji'
					],
					['Typowy cykl', '1 … 32 ms', '10 … 1000 ms (zależy od programu)']
				]
			},
			{
				kind: 'text',
				text: `**Modbus** jest najprostszy i spotkasz go wszędzie. Urządzenie ma cztery „tablice”:

- **cewki** (0x) — bity do odczytu i zapisu,
- **wejścia dyskretne** (1x) — bity tylko do odczytu,
- **rejestry wejściowe** (3x) — słowa 16-bitowe tylko do odczytu,
- **rejestry holding** (4x) — słowa do odczytu i zapisu.

Master wysyła **kod funkcji**, adres i ilość, a stacja odpowiada danymi. Sprawdź, jakie bajty idą po kablu:`
			},
			{ kind: 'modbus' },
			{
				kind: 'callout',
				tone: 'warn',
				title: 'Pułapka: adres od 0 czy od 1?',
				text: 'Dokumentacja falownika podaje „rejestr 40010”, a w telegramie trzeba wysłać adres **9**. Prefiks 4 oznacza tablicę, a numeracja w dokumentacji zaczyna się od 1. Połowa problemów przy uruchamianiu Modbusa to przesunięcie o jeden.'
			},
			{
				kind: 'text',
				text: `**Co, gdy sieć padnie?** Sterownik nie dostaje nowych danych, ale w obrazie procesu **zostają ostatnie wartości**. Program widzi „pompa pracuje”, choć pompa dawno stoi. Dlatego:

- stacja zdalna ma własny **watchdog**: bez telegramów przez określony czas ustawia wyjścia w stan bezpieczny (zwykle 0),
- program w PLC sprawdza świeżość danych — najprościej **licznikiem życia** (heartbeat): urządzenie zwiększa licznik co chwilę, a sterownik alarmuje, gdy licznik stoi,
- Profinet daje też diagnostykę (status urządzenia, bity jakości danych) — warto ją czytać, ale licznik życia działa z każdym protokołem.`
			},
			{
				kind: 'code',
				title: 'Licznik życia w ST',
				code: `stale(IN := Heartbeat = LastBeat, PT := T#500ms);
CommFault := stale.Q;
LastBeat := Heartbeat;
IF CommFault THEN
  Run := FALSE;   // stan bezpieczny, po powrocie sieci nowy Start
END_IF;`
			},
			{
				kind: 'quiz',
				question:
					'Kabel do zdalnej stacji został przerwany. Co widzi program w PLC na wejściach tej stacji?',
				options: [
					'Same zera — sterownik zeruje wejścia stacji',
					'Ostatnie odebrane wartości, dopóki program sam nie wykryje awarii',
					'Losowe wartości',
					'PLC przechodzi w STOP'
				],
				correct: 1,
				explanation:
					'Obraz procesu trzyma ostatnie dane. Bez licznika życia lub diagnostyki sieci program nie odróżni „pompa pracuje” od „nie wiem, co z pompą”.'
			},
			{
				kind: 'quiz',
				question:
					'W dokumentacji licznika energii moc czynna to rejestr 40021. Jaki adres wpiszesz w zapytaniu funkcji 03?',
				options: ['40021', '21', '20', '40020'],
				correct: 2,
				explanation: '4 = tablica rejestrów holding, numeracja od 1 → offset 20.'
			},
			{
				kind: 'lesson',
				slug: 'remote-pump',
				text: 'Pompa za siecią: wykryj utratę komunikacji licznikiem życia i przejdź w stan bezpieczny.'
			}
		]
	},
	/* ------------------------------------------------------------------ sieci OT w praktyce */
	{
		slug: 'sieci-ot',
		title: 'Sieci OT w praktyce: IP, maski, switche, VLAN, diagnoza',
		summary:
			'Adresacja maszyny, podsieci i brama, switche zarządzalne i VLAN-y, topologia pierścienia oraz jak w 5 minut znaleźć, dlaczego coś się nie łączy.',
		minutes: 15,
		blocks: [
			{
				kind: 'text',
				text: `Każde urządzenie w sieci Ethernet ma **adres IP** (np. 192.168.10.21) i **maskę podsieci** (np. 255.255.255.0, czyli **/24**). Maska mówi, ile pierwszych bitów adresu to **numer sieci**, a ile — numer urządzenia w tej sieci.

Dwa urządzenia rozmawiają **bezpośrednio** tylko wtedy, gdy są w **tej samej podsieci**. Do innych sieci (biuro, serwer SCADA, internet) pakiety idą przez **bramę domyślną** — router albo firewall.

W sieciach maszyn używa się adresów **prywatnych**: 10.x.x.x, 172.16–31.x.x, 192.168.x.x.`
			},
			{ kind: 'subnet' },
			{
				kind: 'table',
				head: ['Plan adresacji maszyny (przykład)', 'Adres', 'Uwagi'],
				rows: [
					['PLC', '192.168.10.1/24', 'brama 192.168.10.254, jeśli ma rozmawiać z biurem'],
					['Panel HMI', '192.168.10.10', ''],
					['Falowniki', '192.168.10.21 … 29', 'IP nadaje PLC po nazwie Profinet'],
					['Wyspy I/O', '192.168.10.31 … 39', 'jw.'],
					['Laptop serwisowy', '192.168.10.200', 'adres spoza zakresu urządzeń!'],
					['Router / firewall', '192.168.10.254', 'jedyna droga do sieci biurowej']
				]
			},
			{
				kind: 'text',
				text: `**Switche.** Switch niezarządzalny po prostu łączy porty. **Zarządzalny** pozwala m.in.:

- dzielić porty na **VLAN-y** — osobne sieci logiczne na jednym sprzęcie (np. VLAN 10 maszyna, VLAN 20 biuro). Urządzenia w różnych VLAN-ach się nie widzą, nawet z adresami z tej samej podsieci;
- tworzyć **pierścień** z redundancją: protokół **MRP** (Media Redundancy Protocol) blokuje jedno łącze, a gdy kabel zostanie przerwany, odblokowuje je w czasie poniżej 200 ms;
- diagnozować: stan portów, błędy CRC (uszkodzony kabel), kto jest na którym porcie, SNMP do systemów monitoringu.

**Profinet** szuka urządzeń **po nazwie** (np. „drive-conveyor”), a adres IP nadaje im sam sterownik na podstawie projektu. Po wymianie falownika trzeba więc nadać nowemu urządzeniu **nazwę** — z narzędzia inżynierskiego (DCP) albo automatycznie, jeśli w projekcie włączono wymianę urządzenia bez nośnika wymiennego.`
			},
			{
				kind: 'callout',
				tone: 'tip',
				title: 'Diagnoza w 5 krokach',
				text: '1) **Link** — świeci dioda na porcie? 2) **Adres i maska** — urządzenie jest w tej podsieci? 3) **ping** z laptopa w tej samej sieci. 4) **Konflikt adresów** — `arp -a` pokazuje dwa adresy MAC na zmianę? 5) **Profinet** — zgadza się nazwa urządzenia? Dopiero potem VLAN-y, firewall i routing.'
			},
			{ kind: 'net-doctor' },
			{
				kind: 'quiz',
				question: 'PLC 192.168.10.1/24 i panel 192.168.1.10/24. Czy się połączą bez routera?',
				options: [
					'Tak, obie to sieci 192.168',
					'Nie — przy masce /24 to różne podsieci (192.168.10.0 i 192.168.1.0)',
					'Tak, jeśli są na jednym switchu',
					'Tylko przez Profinet'
				],
				correct: 1,
				explanation:
					'Maska /24 porównuje trzy pierwsze liczby. 10 ≠ 1, więc potrzebny byłby router.'
			},
			{
				kind: 'quiz',
				question: 'Ile urządzeń zmieścisz w sieci /28?',
				options: ['16', '14', '28', '254'],
				correct: 1,
				explanation: '/28 to 4 bity na hosty: 16 adresów, minus adres sieci i broadcast = 14.'
			},
			{
				kind: 'quiz',
				question:
					'Po wymianie falownika ping do jego adresu działa, ale PLC zgłasza błąd urządzenia Profinet. Najbardziej prawdopodobna przyczyna?',
				options: [
					'Zła maska w PLC',
					'Nowy falownik nie ma nazwy urządzenia z projektu',
					'Uszkodzony kabel',
					'Zła prędkość zadana'
				],
				correct: 1,
				explanation:
					'Profinet identyfikuje urządzenie po nazwie. Adres IP może być „jakiś”, a nazwa się nie zgadza — PLC nie nawiąże wymiany danych.'
			}
		]
	},
	/* ------------------------------------------------------------------ systemy nad PLC */
	{
		slug: 'scada-iiot',
		title: 'Nad sterownikiem: SCADA, OPC UA, MQTT i historian',
		summary:
			'Model warstwowy zakładu (Purdue), czym różni się SCADA od HMI, jak dane z PLC trafiają do serwerów: OPC UA, MQTT, historian, MES.',
		minutes: 12,
		blocks: [
			{
				kind: 'text',
				text: `Sterownik to dopiero początek drogi danych. Zakład opisuje się **modelem warstwowym** (Purdue / ISA-95):`
			},
			{
				kind: 'table',
				head: ['Poziom', 'Co tam jest', 'Przykład'],
				rows: [
					['0 · Proces', 'czujniki, napędy, zawory', 'czujnik temperatury, falownik'],
					['1 · Sterowanie', 'PLC, sterowniki bezpieczeństwa', 'CPU linii'],
					['2 · Nadzór', 'HMI, SCADA, inżynierka', 'panel maszyny, stacja operatorska SCADA'],
					[
						'3 · Operacje',
						'historian, MES, serwery w DMZ',
						'raporty zmianowe, OEE, receptury, śledzenie partii'
					],
					['4 · Biznes', 'ERP, poczta, biuro', 'zamówienia, magazyn, księgowość']
				]
			},
			{
				kind: 'text',
				text: `**HMI** to panel przy jednej maszynie. **SCADA** (Supervisory Control And Data Acquisition) zbiera dane z wielu sterowników: synoptyka całego zakładu, alarmy, trendy, archiwum, użytkownicy i uprawnienia.

**Historian** zapisuje wartości procesowe w czasie (tysiące tagów, lata historii) i pozwala odpowiedzieć na pytanie „co się działo w nocy o 3:14”. **MES** zarządza produkcją: zlecenia, receptury, partie, wydajność (OEE).

Jak dane wychodzą ze sterownika?

- **OPC UA** — standard komunikacji przemysłowej klient–serwer. PLC (serwer) udostępnia **przestrzeń adresową**: drzewo węzłów z typami, jednostkami i opisami. Klient (SCADA, MES) czyta, pisze albo **subskrybuje** zmiany. Ma wbudowane szyfrowanie, certyfikaty i użytkowników. Port 4840.
- **MQTT** — lekki protokół **publikuj–subskrybuj** przez **brokera**. Urządzenia publikują wartości pod **tematami** (np. plant/line1/oven/temp), a odbiorcy subskrybują to, czego potrzebują. Popularny w IIoT i chmurze; specyfikacja **Sparkplug B** porządkuje tematy i format danych dla przemysłu.
- Protokoły producentów (S7, EtherNet/IP) i Modbus — wciąż wszędzie, szczególnie w starszych instalacjach.`
			},
			{ kind: 'mqtt' },
			{
				kind: 'table',
				head: ['', 'OPC UA', 'MQTT'],
				rows: [
					['Model', 'klient–serwer (plus pub/sub)', 'publikuj–subskrybuj przez brokera'],
					[
						'Dane',
						'bogaty model: typy, jednostki, struktura, metody',
						'dowolny ładunek (JSON, Sparkplug B)'
					],
					['Gdzie', 'PLC ↔ SCADA / MES w zakładzie', 'wiele urządzeń → chmura / platforma IIoT'],
					[
						'Bezpieczeństwo',
						'certyfikaty, szyfrowanie, użytkownicy',
						'TLS i uwierzytelnianie na brokerze'
					]
				]
			},
			{
				kind: 'callout',
				tone: 'tip',
				title: 'Dobra praktyka w PLC',
				text: 'Nie udostępniaj na zewnątrz całej pamięci sterownika. Przygotuj osobny blok danych z tym, co ma iść do SCADA i MES (stany, liczniki, alarmy, receptura) i tylko jego wystaw przez OPC UA. Zapis z zewnątrz — tylko do wybranych zmiennych, z kontrolą w programie.'
			},
			{
				kind: 'quiz',
				question: 'Na którym poziomie modelu Purdue zwykle stoi historian i serwery MES?',
				options: ['0 · proces', '1 · sterowanie', '3 · operacje (często w DMZ)', '4 · biznes'],
				correct: 2,
				explanation: 'Poziom 3 — między halą a biurem. Biuro czyta dane z tych serwerów, nie z PLC.'
			},
			{
				kind: 'quiz',
				question: 'Subskrypcja MQTT „plant/+/oven/temp”. Która wiadomość do niej trafi?',
				options: [
					'plant/line1/oven/temp',
					'plant/line1/oven/zone1/temp',
					'plant/temp',
					'line1/oven/temp'
				],
				correct: 0,
				explanation: '+ zastępuje dokładnie jeden poziom tematu.'
			}
		]
	},
	/* ------------------------------------------------------------------ cyberbezpieczeństwo OT */
	{
		slug: 'cyber-ot',
		title: 'Cyberbezpieczeństwo OT: strefy, kanały i zdalny dostęp',
		summary:
			'Dlaczego sieć maszyn nie może być „płaska”, strefy i kanały wg IEC 62443, DMZ, firewall, zdalny serwis i codzienne nawyki automatyka.',
		minutes: 10,
		blocks: [
			{
				kind: 'text',
				text: `Sterowniki projektowano do pracy w zamkniętych sieciach. Wiele protokołów przemysłowych (Modbus, starsze S7, Profinet) **nie ma uwierzytelniania**: kto jest w sieci, ten może odczytać i zmienić program. Dlatego ochrona OT opiera się na **architekturze sieci**.

Norma **IEC 62443** dzieli instalację na **strefy** (zones) — grupy urządzeń o podobnym poziomie zaufania — i **kanały** (conduits), czyli kontrolowane połączenia między nimi. Typowy układ:

- **sieć maszyn (OT)** — PLC, HMI, napędy, podzielone na strefy np. per linia,
- **DMZ przemysłowa** — serwery, które rozmawiają z obiema stronami: historian, SCADA, serwer przesiadkowy do zdalnego serwisu, serwer aktualizacji,
- **biuro (IT)** — poczta, ERP, internet.

Między strefami stoi **firewall** z zasadą **domyślnie blokuj**. Biuro nigdy nie łączy się bezpośrednio z PLC.`
			},
			{ kind: 'firewall' },
			{
				kind: 'table',
				head: ['Nawyk', 'Dlaczego'],
				rows: [
					[
						'Zmieniaj domyślne hasła (HMI, switche, napędy, web serwery PLC)',
						'lista domyślnych haseł jest publiczna'
					],
					[
						'Włącz ochronę dostępu do CPU (hasło, poziom dostępu)',
						'bez tego każdy laptop w sieci wgra program'
					],
					[
						'Wyłączaj nieużywane usługi i porty (web serwer, FTP, porty switcha)',
						'mniej drzwi do sprawdzenia'
					],
					[
						'Laptop serwisowy tylko do OT, bez poczty i przeglądania',
						'najczęstsza droga wirusa do sieci maszyn'
					],
					[
						'Pendrive’y skanowane na stacji kontrolnej',
						'przypadek Stuxnet zaczął się od nośnika USB'
					],
					[
						'Kopie zapasowe programów i konfiguracji, offline',
						'po ataku ransomware to jedyny szybki powrót'
					]
				]
			},
			{
				kind: 'callout',
				tone: 'info',
				title: 'Poziomy bezpieczeństwa (SL)',
				text: 'IEC 62443 opisuje poziomy SL 1 … 4: od ochrony przed przypadkowym błędem (SL 1) po ochronę przed zaawansowanym, celowym atakiem z dużymi zasobami (SL 4). Dla każdej strefy wyznacza się poziom docelowy i dobiera zabezpieczenia.'
			},
			{
				kind: 'quiz',
				question:
					'Serwisant producenta potrzebuje zdalnie podejrzeć program PLC. Jak to zrobić dobrze?',
				options: [
					'Przekierować port 102 z internetu na PLC',
					'VPN z MFA do serwera przesiadkowego w DMZ, włączany na czas zlecenia i logowany',
					'Dać mu TeamViewer na panelu HMI',
					'Wysłać mu program mailem'
				],
				correct: 1,
				explanation:
					'Zdalny dostęp kończy się w DMZ, jest uwierzytelniony, czasowy i rejestrowany. Nigdy bezpośrednio z internetu do sieci maszyn.'
			}
		]
	},
	/* ------------------------------------------------------------------ bezpieczeństwo maszyn */
	{
		slug: 'bezpieczenstwo-maszyn',
		title: 'Bezpieczeństwo maszyn: obwody bezpieczeństwa i PL',
		summary:
			'Ocena ryzyka, poziom zapewnienia bezpieczeństwa PL, kategorie, przekaźnik bezpieczeństwa, osłony z ryglem i sterowanie oburęczne.',
		minutes: 12,
		blocks: [
			{
				kind: 'text',
				text: `Zwykły PLC **nie jest** urządzeniem bezpieczeństwa: program może mieć błąd, karta wyjść może się „zawiesić” w stanie 1. Dlatego funkcje chroniące ludzi — zatrzymanie awaryjne, osłony, kurtyny świetlne — realizuje się **osobnym obwodem bezpieczeństwa**: przekaźnikiem bezpieczeństwa albo sterownikiem bezpieczeństwa (safety PLC, np. F-CPU). Zwykły program tylko **dostaje informację** o stanie tego obwodu.

Projekt zaczyna się od **oceny ryzyka** (PN-EN ISO 12100): jakie zagrożenia ma maszyna i jak bardzo trzeba je ograniczyć. Dla każdej funkcji bezpieczeństwa norma **PN-EN ISO 13849-1** każe wyznaczyć wymagany poziom **PLr** (od a do e).`
			},
			{
				kind: 'table',
				head: ['Kategoria', 'Architektura', 'Co się dzieje przy jednym uszkodzeniu'],
				rows: [
					[
						'B, 1',
						'jeden kanał, sprawdzone elementy',
						'funkcja bezpieczeństwa może zostać utracona'
					],
					['2', 'jeden kanał + okresowy test', 'błąd wykryty przy teście'],
					['3', 'dwa kanały', 'funkcja działa dalej; większość błędów wykrywana'],
					['4', 'dwa kanały + pełna diagnostyka', 'funkcja działa; każdy pojedynczy błąd wykryty']
				]
			},
			{ kind: 'safety' },
			{
				kind: 'text',
				text: `**Zatrzymanie awaryjne** (PN-EN ISO 13850, PN-EN 60204-1) to czerwony grzybek na żółtym tle, z **zatrzaskiem**. Kategoria zatrzymania **0** odcina energię natychmiast; kategoria **1** najpierw hamuje napędem (np. rampą falownika), potem odcina energię. Po odblokowaniu grzybka maszyna **nie może** sama ruszyć — potrzebny jest świadomy reset.

**Osłony z ryglem**: drzwi do strefy niebezpiecznej mają wyłącznik bezpieczeństwa. Jeśli maszyna po zatrzymaniu jeszcze się kręci (wybieg wrzeciona), drzwi trzeba **zaryglować**, dopóki ruch nie ustanie. Najczęściej rygiel trzyma sprężyna, a cewka **odblokowuje** (zasada „power to unlock”) — zanik zasilania nie otworzy drzwi.

**Sterowanie oburęczne** (PN-EN ISO 13851) zmusza operatora do trzymania obu rąk na przyciskach. Typ III: obie ręce muszą zadziałać **prawie jednocześnie** (w ciągu 0,5 s), puszczenie którejkolwiek zatrzymuje ruch, a nowy cykl wymaga puszczenia obu.`
			},
			{
				kind: 'callout',
				tone: 'warn',
				title: 'Na rozmowie kwalifikacyjnej',
				text: 'Pytanie „czy można zrobić e-stop na zwykłym wejściu PLC?” ma jedną dobrą odpowiedź: nie jako funkcję bezpieczeństwa. Grzybek odcina energię przez przekaźnik lub sterownik bezpieczeństwa, a PLC dostaje tylko sygnał do diagnostyki i HMI.'
			},
			{
				kind: 'quiz',
				question: 'Po co dwa styczniki w szeregu z kontrolą sprzężenia zwrotnego (EDM)?',
				options: [
					'Żeby silnik miał więcej mocy',
					'Gdy jeden się zgrzeje, drugi i tak odetnie silnik, a przekaźnik nie pozwoli na kolejny reset',
					'Żeby można było sterować dwoma prędkościami',
					'To wymóg tylko dla silników powyżej 10 kW'
				],
				correct: 1,
				explanation:
					'To redundancja i diagnostyka: pojedyncze uszkodzenie nie odbiera funkcji bezpieczeństwa i zostaje wykryte — typowa architektura kategorii 3/4.'
			},
			{
				kind: 'quiz',
				question:
					'Ciężki uraz (S2), częsty dostęp (F2), uniknięcie możliwe (P1). Jaki PL jest wymagany?',
				options: ['PL b', 'PL c', 'PL d', 'PL e'],
				correct: 2,
				explanation: 'Graf ryzyka: S2 → F2 → P1 daje PLr = d.'
			},
			{
				kind: 'lesson',
				slug: 'two-hand-press',
				text: 'Zaprogramuj logikę sterowania oburęcznego typu III: jednoczesność 0,5 s i nowy cykl po puszczeniu obu przycisków.'
			}
		]
	},
	/* ------------------------------------------------------------------ szafa sterownicza */
	{
		slug: 'szafa-sterownicza',
		title: 'Szafa sterownicza: zasilanie 24 V, zabezpieczenia, EMC i dokumentacja',
		summary:
			'Dobór zasilacza, zabezpieczenia obwodów, kolory przewodów, uziemienie i ekranowanie, oznaczenia aparatów i czytanie schematu.',
		minutes: 12,
		blocks: [
			{
				kind: 'text',
				text: `Szafa sterownicza to „dom” sterownika. Typowy podział od góry:

- **zasilanie główne**: rozłącznik główny, zabezpieczenia silnikowe, styczniki, falowniki (część mocy),
- **sterowanie**: zasilacz **24 V DC**, zabezpieczenia obwodów 24 V, PLC i moduły I/O, przekaźniki, listwy zaciskowe do obiektu,
- **sieć**: switch, router / firewall, czasem UPS dla PLC i panelu.

Część mocy i część sygnałowa są **rozdzielone**: kable silnikowe i sygnałowe w osobnych korytkach, krzyżują się pod kątem prostym.`
			},
			{ kind: 'cabinet' },
			{
				kind: 'table',
				head: ['Kolor przewodu (PN-EN 60204-1)', 'Zastosowanie'],
				rows: [
					['czarny', 'obwody główne AC i DC'],
					['czerwony', 'obwody sterowania AC'],
					['niebieski (ciemny)', 'obwody sterowania DC (24 V)'],
					['pomarańczowy', 'obwody zasilane z zewnątrz, nieodłączane wyłącznikiem głównym'],
					['jasnoniebieski', 'przewód neutralny N'],
					['zielono-żółty', 'przewód ochronny PE — tylko do tego']
				]
			},
			{
				kind: 'text',
				text: `**Zabezpieczenia**: każdy obwód 24 V ma swój bezpiecznik albo kanał **elektronicznego zabezpieczenia** (zadziała przy przeciążeniu, a zasilacz nie „siądzie” dla całej szafy). Wyłączniki nadprądowe AC mają charakterystyki **B** (obciążenia rezystancyjne), **C** (silniki małej mocy, zasilacze z prądem rozruchu), **D** (duże prądy rozruchowe). Silnik chroni wyłącznik silnikowy albo przekaźnik termiczny nastawiony na prąd znamionowy.

**Uziemienie i ekranowanie**: obudowa, drzwi i płyta montażowa połączone z PE. Ekran kabla silnikowego — obejmą na 360° po obu stronach. Ekran kabla analogowego 4–20 mA / 0–10 V — zwykle jednostronnie po stronie szafy, żeby nie płynęły nim prądy wyrównawcze.

**Oznaczenia aparatów** (tradycyjne, wg dawnych norm i wciąż wszędzie na schematach): **-Q** wyłącznik, **-F** bezpiecznik, **-K** stycznik / przekaźnik, **-S** łącznik, przycisk, **-H** lampka, **-M** silnik, **-T** lub **-G** zasilacz, **-U** falownik, **-A** sterownik. Na schemacie EPLAN-owskim kod **=** to funkcja / instalacja, **+** to miejsce (np. +S1 szafa 1), a odsyłacze typu „/12.3” mówią, na której stronie i w której kolumnie jest drugi koniec połączenia albo styk aparatu.`
			},
			{
				kind: 'callout',
				tone: 'warn',
				title: 'Zanim otworzysz szafę',
				text: 'Prace pod napięciem tylko z uprawnieniami (w Polsce świadectwo kwalifikacyjne SEP: E — eksploatacja, D — dozór). Wyłącz, zabezpiecz przed załączeniem (kłódka LOTO), sprawdź brak napięcia. Pamiętaj o obwodach zasilanych z zewnątrz (pomarańczowe) i o kondensatorach falowników.'
			},
			{
				kind: 'quiz',
				question: 'Kabel analogowy 4–20 mA z czujnika do szafy: jak podłączyć ekran?',
				options: [
					'Nie podłączać',
					'Zwykle jednostronnie, po stronie szafy (na szynę PE / ekranową)',
					'Do minusa zasilacza',
					'Do przewodu N'
				],
				correct: 1,
				explanation:
					'Jednostronne uziemienie ekranu sygnałów wolnozmiennych ogranicza prądy wyrównawcze w ekranie. Kable silnikowe falowników — obustronnie, 360°.'
			},
			{
				kind: 'quiz',
				question: 'Na schemacie przy cewce -K3 jest odsyłacz „/14.2”. Co to znaczy?',
				options: [
					'Prąd cewki 14,2 A',
					'Styk tego przekaźnika jest na stronie 14 w kolumnie 2',
					'Przekaźnik ma 14 styków',
					'Napięcie cewki 14,2 V'
				],
				correct: 1,
				explanation:
					'Odsyłacze strona.kolumna wiążą cewkę z jej stykami rozrysowanymi w innych miejscach schematu.'
			}
		]
	},
	/* ------------------------------------------------------------------ cudzy kod */
	{
		slug: 'cudzy-kod',
		title: 'Cudzy program: STL/AWL i modernizacje',
		summary: 'Jak czytać stary program z S7-300 i zmieniać go, nie psując tego, co działa od lat.',
		minutes: 12,
		blocks: [
			{
				kind: 'text',
				text: `Większość pracy automatyka to nie nowe maszyny, tylko **istniejące** — tzw. *brownfield*. Linie z S7-300/400 chodzą po 20 lat, a ich programy są często w **STL** (*Statement List*, po niemiecku **AWL** — *Anweisungsliste*). W TIA Portal na S7-1500 STL nadal istnieje, choć nowych programów już się w nim nie pisze. Trzeba go umieć **czytać**.

STL to tekstowy odpowiednik drabinki: jedna linia = jedna instrukcja, a wynik logiki (**RLO**, *Result of Logic Operation*) płynie z linii do linii.

- \`A\` — I (AND, niem. \`U\`), \`AN\` — I z negacją, \`O\` / \`ON\` — LUB, \`X\` — XOR,
- \`=\` przypisanie, \`S\` / \`R\` ustaw / kasuj, \`FP\` zbocze narastające (z bitem pamięci zbocza),
- **I wiąże mocniej niż LUB**: \`A a / A b / O c / A d\` to \`a·b + c·d\`. Gdy trzeba inaczej — nawiasy \`A(\` … \`)\`,
- **pierwsze sprawdzenie** po \`=\`, \`S\` czy \`R\` zaczyna nowy łańcuch logiki (bit /FC),
- \`L\` ładuje wartość do akumulatora, \`T\` przesyła ją do pamięci — **niezależnie od RLO**. \`+I\`, \`==I\`, \`>I\` liczą i porównują dwa akumulatory,
- \`JC m001\` skacze do etykiety, gdy RLO = 1 (\`JCN\` gdy 0, \`JU\` zawsze) — tak w STL robi się „IF”,
- timery S7: \`L S5T#5S\` i \`SD T1\` (opóźnione załączenie ≈ TON), \`SE\` impuls przedłużony, \`SF\` opóźnione wyłączenie (≈ TOF), \`A T1\` czyta bit timera.

W PLC Sim wybierz język **STL**. Online po prawej zobaczysz kolumny **STA** (stan operandu), **RLO** i **ACCU1** dla każdej linii — tak wygląda monitor STL w STEP 7.`
			},
			{
				kind: 'quiz',
				question: 'Co robi ten kod? A I0.0 / O I0.1 / A I0.2 / = Q0.0',
				options: [
					'Q0.0 = (I0.0 LUB I0.1) I I0.2',
					'Q0.0 = I0.0 LUB (I0.1 I I0.2)',
					'Q0.0 = I0.0 I I0.1 I I0.2',
					'Błąd składni — brakuje nawiasu'
				],
				correct: 1,
				explanation:
					'I wiąże mocniej niż LUB. O rozpoczyna nową grupę I. Żeby dostać (I0.0 + I0.1)·I0.2, trzeba nawiasu A( O I0.0 O I0.1 ) A I0.2.'
			},
			{
				kind: 'text',
				text: `**Zasady modernizacji cudzego programu** — tego nie uczą na studiach, a to podstawa pracy serwisu:

1. **Kopia zapasowa przed czymkolwiek** — pobierz program ze sterownika (*upload*), nie ufaj wersji „z dysku”. Program w CPU bywa nowszy niż archiwum.
2. **Najpierw zrozum** — lista odwołań (*cross-reference*): gdzie bit jest zapisywany, gdzie czytany. Podwójne cewki i „ręczne” poprawki sprzed lat są normą.
3. **Zmieniaj minimalnie** i oznaczaj zmiany komentarzem z numerem zlecenia i datą. Nie przepisuj działającego kodu „na ładniejszy” przy okazji — każda linia to ryzyko.
4. **Szukaj ukrytych założeń**: stary program mógł polegać na tym, że operator czegoś pilnuje (położył detal, zamknął osłonę). Automatyzacja usuwa operatora — założenie znika.
5. **Test regresji**: sprawdź nie tylko nową funkcję, ale i stare działanie — protokół przed i po zmianie.
6. **Zmiany online** (*download in RUN*) tylko gdy wiesz, co robisz, i z kimś przy maszynie.`
			},
			{
				kind: 'quiz',
				question:
					'Masz dodać nową funkcję do 15-letniego programu bez dokumentacji. Co robisz najpierw?',
				options: [
					'Przepisuję wszystko w SCL — tak będzie czytelniej',
					'Pobieram program ze sterownika jako kopię, potem czytam listę odwołań dla adresów, które zmienię',
					'Wgrywam od razu poprawkę i patrzę, co się stanie',
					'Kasuję nieużywane sieci, żeby było przejrzyście'
				],
				correct: 1,
				explanation:
					'Kopia z CPU (archiwum bywa nieaktualne) i zrozumienie, gdzie bity są używane. Przepisywanie i „sprzątanie” to ryzyko bez korzyści dla klienta.'
			},
			{
				kind: 'lesson',
				slug: 'stl-pump',
				text: 'Pierwszy program w AWL: pompa, której Stop przegrywa ze Startem — kolejność I i LUB.'
			},
			{
				kind: 'lesson',
				slug: 'brownfield-press',
				text: 'Prasa z 2009 roku: zlecenie zmiany w cudzym kodzie, ukryte założenie i testy regresji.'
			}
		]
	},
	/* ------------------------------------------------------------------ projekt końcowy */
	{
		slug: 'projekt-koncowy',
		title: 'Projekt końcowy: od opisu funkcjonalnego do odbioru FAT',
		summary: 'Jak wygląda zlecenie w pracy: FDS, lista I/O, program, HMI, alarmy i odbiór.',
		minutes: 10,
		blocks: [
			{
				kind: 'text',
				text: `W pracy nikt nie daje Ci gotowej drabinki do przepisania. Dostajesz **opis funkcjonalny** (FDS, *Functional Design Specification*): ponumerowane wymagania technologa. Typowa droga projektu:

1. **Lista I/O** — każdy czujnik, zawór i przycisk z adresem, typem sygnału i opisem. Tablica symboli to Twoja lista I/O.
2. **Sekwencja** — kroki, warunki przejść, co robi każde wyjście w każdym kroku. Najpierw na kartce.
3. **Program** — w języku, który pasuje: sekwencja w CASE albo SFC, blokady w LAD/FBD.
4. **HMI i alarmy** — operator musi wiedzieć, *co* się stało i *co zrobić*. „Błąd 17” to nie jest tekst alarmu.
5. **FAT** (*Factory Acceptance Test*) — odbiór u dostawcy: protokół, w którym każda pozycja sprawdza jedno wymaganie, także z symulowaną awarią (zerwany przewód, uszkodzona grzałka). Potem **SAT** na obiekcie u klienta.

Zaliczony FAT to nie koniec: kod czyta potem serwisant o 3 w nocy. Dlatego po odbiorze dostajesz **recenzję kodu** — symbole zamiast adresów, komentarze kroków, nazwane stałe.`
			},
			{
				kind: 'quiz',
				question:
					'Na FAT grzałka „nie grzeje”, a program czeka w kroku grzania bez końca. Którego wymagania brakuje?',
				options: [
					'Większej mocy grzałki',
					'Nadzoru czasu kroku — alarm, gdy krok trwa dłużej niż powinien',
					'Szybszego cyklu PLC',
					'Drugiego czujnika temperatury'
				],
				correct: 1,
				explanation:
					'Każdy krok czekający na fizyczny skutek (temperatura, kontaktron, poziom) ma nadzór czasu. Bez niego maszyna „wisi” i nikt nie wie dlaczego.'
			},
			{
				kind: 'lesson',
				slug: 'capstone-mixer',
				text: 'Mieszalnik MX2 od zera: osiem wymagań, receptury, alarmy z HMI i siedem pozycji protokołu FAT.'
			}
		]
	}
];

export const getChapter = (slug: string) => CHAPTERS.find((c) => c.slug === slug) ?? null;

export const quizCount = (c: Chapter) => c.blocks.filter((b) => b.kind === 'quiz').length;
