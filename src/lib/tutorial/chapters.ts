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
				text: 'Symulator ma jeden program cykliczny (jak OB1) i gotowe bloki TON/TOF/TP/CTU/CTD/R_TRIG/F_TRIG — własnych FB jeszcze nie. Strukturę i tak ćwiczysz: **komentarze networków**, **tablica symboli** i podział programu na części.'
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
	}
];

export const getChapter = (slug: string) => CHAPTERS.find((c) => c.slug === slug) ?? null;

export const quizCount = (c: Chapter) => c.blocks.filter((b) => b.kind === 'quiz').length;
