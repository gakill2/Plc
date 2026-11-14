/**
 * Story mode „Zgłoszenia”: you are the new automation technician on a plant,
 * and the shift foreman keeps sending work orders. Every ticket wraps one of
 * the editor lessons in a real-world story and ends with a debrief.
 */

export type Priority = 'niski' | 'normalny' | 'pilny' | 'awaria';

export type Ticket = {
	id: string;
	/** Week of the story (1–3). */
	week: number;
	/** Lesson slug opened in the editor. */
	lesson: string;
	from: string;
	machine: string;
	priority: Priority;
	title: string;
	/** What the foreman writes — the brief. */
	message: string;
	/** What an hour of this machine standing still costs (PLN). */
	costPerHour: number;
	debrief: {
		/** What was really going on. */
		cause: string;
		/** The general rule to take away. */
		lesson: string;
		/** A tip from an experienced colleague. */
		tip: string;
	};
};

export const WEEKS = [
	{
		week: 1,
		title: 'Tydzień 1 · Pierwsze dni na hali',
		summary: 'Proste układy, logika, podtrzymanie.'
	},
	{
		week: 2,
		title: 'Tydzień 2 · Czas, procesy i błędy',
		summary: 'Timery, liczniki, sekwencje i szukanie błędów w cudzych programach.'
	},
	{
		week: 3,
		title: 'Tydzień 3 · Na obiekcie',
		summary: 'Uruchomienia, falowniki i panel operatorski.'
	}
] as const;

const FOREMAN = 'Marek Nowak, mistrz zmiany';
const MAINTENANCE = 'Ewa Zając, kierownik utrzymania ruchu';
const PROCESS = 'Tomasz Wilk, technolog';

export const TICKETS: Ticket[] = [
	/* ---------- week 1 ---------- */
	{
		id: 'z01',
		week: 1,
		lesson: 'first-rung',
		from: FOREMAN,
		machine: 'Sprężarkownia',
		priority: 'niski',
		title: 'Lampka kontrolna przy sprężarce',
		message:
			'Cześć, witamy w zakładzie! Na rozgrzewkę: przy sprężarce chcemy lampkę, która świeci, kiedy ktoś trzyma przycisk testu. Proste, ale chcę zobaczyć, jak pracujesz.',
		costPerHour: 0,
		debrief: {
			cause:
				'Wejście sterownika (I) przez styk NO steruje cewką wyjścia (Q) — w każdym cyklu skanowania od nowa.',
			lesson:
				'Sterownik nie „łączy kabelków”: czyta wejścia, liczy program, potem zapisuje wyjścia. Zawsze w tej kolejności.',
			tip: 'Na obiekcie najpierw sprawdzaj diodę wejścia na karcie, dopiero potem program. Połowa „awarii programu” to kabel.'
		}
	},
	{
		id: 'z02',
		week: 1,
		lesson: 'and-or',
		from: FOREMAN,
		machine: 'Prasa krawędziowa P2',
		priority: 'normalny',
		title: 'Prasa: sterowanie oburęczne',
		message:
			'Prasa P2 ma zjeżdżać tylko wtedy, gdy operator trzyma oba przyciski — żadna ręka pod stemplem. A lampka ostrzegawcza ma świecić, gdy wciśnięty jest którykolwiek. Ogarniesz?',
		costPerHour: 400,
		debrief: {
			cause: 'Styki szeregowo to AND, równolegle to OR — tak samo jak w obwodzie przekaźnikowym.',
			lesson:
				'Każdą logikę zapiszesz drabinką z szeregów i gałęzi. Czytaj network od lewej do prawej jak przepływ prądu.',
			tip: 'Prawdziwe sterowanie oburęczne w prasach robi się na przekaźniku bezpieczeństwa, nie samym PLC — ale logika jest ta sama.'
		}
	},
	{
		id: 'z03',
		week: 1,
		lesson: 'self-holding',
		from: FOREMAN,
		machine: 'Taśma 3',
		priority: 'pilny',
		title: 'Taśma 3 staje po puszczeniu przycisku',
		message:
			'Po przezbrojeniu taśma 3 jedzie tylko, dopóki operator trzyma Start. Ludzie stoją z palcem na przycisku. Potrzebuję normalnego start/stop.',
		costPerHour: 1200,
		debrief: {
			cause: 'Brakowało podtrzymania: styku samej cewki równolegle do przycisku Start.',
			lesson:
				'Układ start/stop z podtrzymaniem to najczęstszy network w przemyśle. Stop szeregowo, Start ⑂ cewka równolegle.',
			tip: 'Stop zawsze podłączaj jako NC: zerwany przewód zatrzyma maszynę, a nie uniemożliwi jej zatrzymania.'
		}
	},
	{
		id: 'z04',
		week: 1,
		lesson: 'toggle',
		from: PROCESS,
		machine: 'Oświetlenie magazynu',
		priority: 'niski',
		title: 'Jeden przycisk do światła',
		message:
			'W magazynie jest tylko jeden przycisk przy drzwiach. Ma włączać światło, a drugie naciśnięcie — wyłączać. Obecny program miga, jak ktoś przytrzyma.',
		costPerHour: 0,
		debrief: {
			cause:
				'Bez zbocza przycisk zmienia stan w każdym cyklu skanowania, kiedy jest wciśnięty — czyli setki razy na sekundę.',
			lesson:
				'Zbocze narastające (P) daje jeden impuls na jedno naciśnięcie. Używaj go do liczenia, przełączania i komend.',
			tip: 'Na wejściach mechanicznych pamiętaj o drganiu styków — czasem potrzebny jest krótki filtr czasowy.'
		}
	},
	{
		id: 'z05',
		week: 1,
		lesson: 'bug-double-coil',
		from: MAINTENANCE,
		machine: 'Hala B, sygnalizator',
		priority: 'normalny',
		title: 'Lampka działa tylko z jednego przycisku',
		message:
			'Poprzednik zostawił program, w którym lampkę włączamy z dwóch miejsc. Działa tylko drugi przycisk. Nikt nie wie czemu, a ja nie mam czasu szukać.',
		costPerHour: 150,
		debrief: {
			cause: 'Ta sama cewka była w dwóch networkach. Wygrywa ostatni zapis w cyklu skanowania.',
			lesson:
				'Jedna cewka = jedno miejsce w programie. Warunki z wielu miejsc łącz LUB w jednym networku.',
			tip: 'Odsyłacz (cross-reference) pokazuje wszystkie zapisy danego adresu — pierwsze narzędzie, gdy wyjście „żyje własnym życiem”.'
		}
	},
	/* ---------- week 2 ---------- */
	{
		id: 'z06',
		week: 2,
		lesson: 'traffic-light',
		from: PROCESS,
		machine: 'Brama wjazdowa',
		priority: 'normalny',
		title: 'Sygnalizacja przy bramie dla wózków',
		message:
			'Wózki widłowe wyjeżdżają z magazynu na drogę wewnętrzną. Chcemy sygnalizację świetlną z prawdziwymi czasami, żeby nikt nie wjechał komuś w bok.',
		costPerHour: 300,
		debrief: {
			cause:
				'Jeden timer TON odmierza cały cykl, a porównania czasu wybierają, która lampa świeci.',
			lesson:
				'Sekwencję czasową można zbudować z jednego timera i progów. Zero rozjechanych czasów między krokami.',
			tip: 'Na prawdziwym skrzyżowaniu dochodzi czas „wszystkie czerwone” — zostaw miejsce na takie wymagania od początku.'
		}
	},
	{
		id: 'z07',
		week: 2,
		lesson: 'bug-timer-edge',
		from: FOREMAN,
		machine: 'Myjka detali, napęd kosza',
		priority: 'pilny',
		title: 'Myjka nie kończy cyklu',
		message:
			'Silnik kosza myjki rusza, ale lampka „praca”, która ma się zapalić 3 s po starcie, nigdy się nie zapala. Operatorzy nie wiedzą, czy cykl idzie. Pilne.',
		costPerHour: 800,
		debrief: {
			cause:
				'Wejście timera TON szło przez styk zbocza. Zbocze daje 1 tylko przez jeden cykl, więc TON od razu się zerował.',
			lesson:
				'TON potrzebuje trwałego sygnału na IN przez cały czas PT. Zbocza są do zliczania i komend, nie do timerów opóźniających.',
			tip: 'Patrz na pole ET timera w podglądzie online: jeśli skacze do zera, wejście timera migocze.'
		}
	},
	{
		id: 'z08',
		week: 2,
		lesson: 'bug-flicker',
		from: MAINTENANCE,
		machine: 'Hala B, oświetlenie',
		priority: 'normalny',
		title: 'Przełącznik działa „losowo”',
		message:
			'Ktoś przerobił przełącznik światła jednym przyciskiem i teraz czasem włącza, czasem nie. Elektrycy przysięgają, że przycisk jest dobry.',
		costPerHour: 100,
		debrief: {
			cause:
				'Bez detekcji zbocza wynik zależał od tego, przez ile cykli trzymano przycisk — parzysta liczba = bez zmiany.',
			lesson:
				'„Losowe” działanie programu PLC prawie zawsze ma deterministyczną przyczynę: zależność od liczby cykli.',
			tip: 'Debuger krokowy (jeden cykl na raz) świetnie pokazuje takie błędy — sprawdzaj stan cykl po cyklu.'
		}
	},
	{
		id: 'z09',
		week: 2,
		lesson: 'bug-set-reset-order',
		from: FOREMAN,
		machine: 'Taśma 1',
		priority: 'awaria',
		title: 'Stop nie zatrzymuje taśmy!',
		message:
			'Operator trzymał Start i Stop jednocześnie, taśma jechała dalej. To jest sprawa BHP — zanim ktoś się skaleczy, napraw to.',
		costPerHour: 1500,
		debrief: {
			cause:
				'RESET był w programie przed SET. Kto pisze ostatni, ten wygrywa — więc Start przykrywał Stop.',
			lesson:
				'Stop musi mieć pierwszeństwo: RESET za SET albo Stop szeregowo w podtrzymaniu. Kolejność networków to logika.',
			tip: 'Przy każdej zmianie w programie maszyny zadaj sobie pytanie: co się stanie, gdy ktoś wciśnie wszystko naraz?'
		}
	},
	{
		id: 'z10',
		week: 2,
		lesson: 'tank-level',
		from: PROCESS,
		machine: 'Zbiornik wody technologicznej',
		priority: 'normalny',
		title: 'Pompa nie może ciągle pracować',
		message:
			'Pompa do zbiornika ma włączać się przy niskim poziomie i wyłączać przy wysokim. Teraz albo pracuje non stop, albo zbiornik się przelewa.',
		costPerHour: 500,
		debrief: {
			cause:
				'Dwa czujniki i SET / RESET dają regulację dwustawną z histerezą — pompa nie „klepie” w kółko.',
			lesson:
				'Histereza (odstęp między progiem włączenia i wyłączenia) chroni urządzenia przed ciągłym przełączaniem.',
			tip: 'Dodaj kiedyś czujnik „za wysoko” jako niezależne zabezpieczenie i alarm — czujniki też się psują.'
		}
	},
	{
		id: 'z11',
		week: 2,
		lesson: 'sorting-conveyor',
		from: PROCESS,
		machine: 'Linia pakowania',
		priority: 'pilny',
		title: 'Sortowanie i liczenie paczek',
		message:
			'Na pakowaniu ręcznie zdejmujemy za wysokie pudełka i liczymy resztę na kartce. Chcemy spychacz na wysokie pudełka i licznik, który zgłosi pełną paletę.',
		costPerHour: 900,
		debrief: {
			cause:
				'Czujnik daje zbocze, timer TP robi impuls wypychacza o stałej długości, licznik CTU liczy sztuki.',
			lesson:
				'Impuls o stałym czasie to TP, liczenie zdarzeń to CTU na zboczu. Podstawowe klocki każdej linii.',
			tip: 'Licznik produkcji zawsze wystaw na HMI z możliwością skasowania na początku zmiany.'
		}
	},
	{
		id: 'z12',
		week: 2,
		lesson: 'drilling-station',
		from: MAINTENANCE,
		machine: 'Stacja wiercenia W1',
		priority: 'normalny',
		title: 'Nowa stacja wiercenia — sekwencja',
		message:
			'Przyszła nowa stacja wiercenia: zatrzymanie detalu, wiercenie, wypuszczenie, kontrola. Mechanicy skończyli, program zostaje Tobie.',
		costPerHour: 1000,
		debrief: {
			cause:
				'Maszynę opisuje się krokami: każdy krok ma swoje wyjścia i warunek przejścia do następnego.',
			lesson:
				'Sekwencja krokowa (jak SFC / GRAFCET) to sposób na każdą maszynę cykliczną — łatwy do czytania i diagnozy.',
			tip: 'Numer aktualnego kroku pokaż na panelu: operator od razu powie, „na którym kroku stanęło”.'
		}
	},
	/* ---------- week 3 ---------- */
	{
		id: 'z13',
		week: 3,
		lesson: 'bug-stop-nc',
		from: FOREMAN,
		machine: 'Mieszalnik M4',
		priority: 'awaria',
		title: 'Mieszalnik nie rusza po wymianie kasety',
		message:
			'Elektrycy wymienili kasetę sterowniczą na mieszalniku. Program nie był ruszany, a silnik nie chce wystartować. Produkcja stoi.',
		costPerHour: 2000,
		debrief: {
			cause:
				'Stop był podłączony jako NC, a w programie użyto styku NC — podwójna negacja blokowała start.',
			lesson:
				'Styk w programie odpowiada sygnałowi na wejściu, nie przyciskowi. Przycisk NC w spoczynku daje 1.',
			tip: 'Zanim zmienisz program, spójrz na stan wejść online. Program, który działał latami, rzadko jest winny.'
		}
	},
	{
		id: 'z14',
		week: 3,
		lesson: 'commissioning-conveyor',
		from: MAINTENANCE,
		machine: 'Przenośnik P7 (nowy)',
		priority: 'pilny',
		title: 'Uruchomienie nowego przenośnika',
		message:
			'Przenośnik P7 jest zmontowany, program przyszedł od integratora i jest sprawdzony. Zrób test I/O i uruchom — jutro rano startuje produkcja.',
		costPerHour: 1200,
		debrief: {
			cause:
				'Usterki były w okablowaniu, nie w programie: przyciski, czujnik, styk pomocniczy stycznika i lampki.',
			lesson:
				'Uruchomienie zaczyna się od testu I/O punkt po punkcie — zanim uruchomisz cokolwiek w automacie.',
			tip: 'Każdy sprawdzony punkt odhaczaj w protokole. Klient zapłaci za uruchomienie, ale zapamięta dokumentację.'
		}
	},
	{
		id: 'z15',
		week: 3,
		lesson: 'vfd-fan',
		from: PROCESS,
		machine: 'Wentylacja hali C',
		priority: 'normalny',
		title: 'Wentylator: lato i zima',
		message:
			'W hali C jest falownik na wentylatorze. Zimą ma kręcić wolno, latem szybko, a czasem w drugą stronę do przewietrzania. Do tego po awarii nikt nie wie, jak go skasować.',
		costPerHour: 300,
		debrief: {
			cause:
				'Falownik dostaje z PLC rozkaz pracy (RUN/REV), prędkość zadaną w słowie analogowym i sygnał kasowania błędu.',
			lesson:
				'Skalowanie: 27648 = 100% = 50 Hz. Kierunki zawsze wzajemnie się wykluczają, a reset błędu tylko przy zatrzymanym napędzie.',
			tip: 'Kod błędu falownika (np. F001) przepisz na alarm na HMI — utrzymanie ruchu oszczędzi wtedy pół godziny chodzenia do szafy.'
		}
	},
	{
		id: 'z16',
		week: 3,
		lesson: 'commissioning-vfd',
		from: MAINTENANCE,
		machine: 'Pompa obiegowa PO2',
		priority: 'awaria',
		title: 'Pompa z falownikiem stoi po remoncie',
		message:
			'Po remoncie szafy pompa PO2 ma ruszać na 35 Hz, a stoi. Falownik nie pokazuje błędu. Chłodzenie linii jest zagrożone — szybko!',
		costPerHour: 2500,
		debrief: {
			cause:
				'Trzy usterki w podłączeniu napędu: przewód RUN, słowo prędkości zadanej i wyjście FAULT falownika.',
			lesson:
				'Diagnozuj od sygnału: czy PLC wysyła RUN? czy falownik go widzi? czy wartość analogowa dochodzi? Krok po kroku wzdłuż kabla.',
			tip: 'Trend sygnałów (RUN, prędkość zadana, prędkość rzeczywista) na jednym wykresie mówi więcej niż godzina z miernikiem.'
		}
	},
	{
		id: 'z17',
		week: 3,
		lesson: 'hmi-start',
		from: FOREMAN,
		machine: 'Taśma 3',
		priority: 'normalny',
		title: 'Operatorzy chcą start z panelu',
		message:
			'Na taśmie 3 zamontowaliśmy panel dotykowy. Operatorzy chcą startować i zatrzymywać ją z ekranu. Przyciski na szafie mają zostać i działać jak dawniej.',
		costPerHour: 600,
		debrief: {
			cause:
				'Panel pisze do markerów M, a program łączy je z przyciskami: start LUB, stop szeregowo.',
			lesson:
				'HMI nigdy nie pisze do wejść I i nie zastępuje twardego Stopu. Przycisk na ekranie to kolejne źródło polecenia.',
			tip: 'Stop awaryjny nigdy nie idzie przez panel ani przez program — to osobny obwód bezpieczeństwa.'
		}
	},
	{
		id: 'z18',
		week: 3,
		lesson: 'crane-positioning',
		from: MAINTENANCE,
		machine: 'Suwnica S1, magazyn',
		priority: 'pilny',
		title: 'Suwnica uderza w odbojniki',
		message:
			'Po modernizacji suwnica dostała enkoder, ale program jeździ „na krańcówki” i co chwilę wali w odbojnik. Ma podjeżdżać sama do stacji A i B — dokładnie i bez uderzeń.',
		costPerHour: 1800,
		debrief: {
			cause:
				'Wózek ma masę: z pełnej prędkości hamuje pół metra. Bez zwolnienia przed celem przejeżdża stację albo uderza w koniec toru.',
			lesson:
				'Pozycjonowanie dwubiegowe: liczysz uchyb (pozycja − cel), daleko jedziesz szybko, blisko wolno, w paśmie tolerancji stop. Krańcówki to ostatnia linia obrony, nie sposób sterowania.',
			tip: 'Na prawdziwej suwnicy dochodzą jeszcze tłumienie kołysania i ograniczniki udźwigu — ale logika zwolnień jest dokładnie taka.'
		}
	},
	{
		id: 'z19',
		week: 3,
		lesson: 'oven-pid',
		from: PROCESS,
		machine: 'Piec hartowniczy P1',
		priority: 'pilny',
		title: 'Piec przegrzewa detale',
		message:
			'Piec ma trzymać 180 °C, a na wykresie widzę skoki do 200 i więcej. Detale wychodzą przegrzane. Integrator zostawił regulator PI w ST — dostrój go.',
		costPerHour: 2200,
		debrief: {
			cause:
				'Za duże wzmocnienie i za krótki czas zdwojenia: regulator reagował za ostro, a całka nabijała się w czasie nagrzewania.',
			lesson:
				'Kp decyduje o sile reakcji, Ti o tym, jak szybko całka usuwa uchyb. Martwy czas procesu ogranicza, jak „ostro” można regulować. Anti-windup chroni przed przestrzałem po nasyceniu.',
			tip: 'Strój na żywo z trendem przed oczami: zmieniaj jedną nastawę naraz i zapisuj, co się stało. Klient zawsze zapyta, „jakie nastawy i dlaczego”.'
		}
	},
	{
		id: 'z20',
		week: 3,
		lesson: 'remote-pump',
		from: MAINTENANCE,
		machine: 'Pompownia P3 (stacja zdalna)',
		priority: 'awaria',
		title: 'Panel pokazuje, że pompa pracuje — a ona stoi',
		message:
			'W nocy koparka przecięła kabel sieciowy do pompowni. Przez trzy godziny na panelu pompa „pracowała”, a zbiornik był pusty. Ma się to więcej nie powtórzyć.',
		costPerHour: 3000,
		debrief: {
			cause:
				'Po przerwaniu sieci w obrazie procesu zostały ostatnie dane. Program nie sprawdzał, czy dane są świeże.',
			lesson:
				'Każde połączenie sieciowe potrzebuje nadzoru: licznik życia, diagnostyka sieci albo bity jakości. Przy braku komunikacji — stan bezpieczny i alarm.',
			tip: 'Ustaw też watchdog po stronie urządzenia (stan wyjść przy utracie komunikacji). Obie strony muszą wiedzieć, co robić, gdy kabel zniknie.'
		}
	},
	{
		id: 'z21',
		week: 3,
		lesson: 'two-hand-press',
		from: 'Anna Kowal, specjalista BHP',
		machine: 'Prasa krawędziowa P2',
		priority: 'pilny',
		title: 'Operator przykleił przycisk taśmą',
		message:
			'Na prasie P2 operator przykleił lewy przycisk taśmą, żeby pracować jedną ręką. Program musi to wykrywać: obie ręce prawie jednocześnie, a po każdym cyklu obie puszczone.',
		costPerHour: 400,
		debrief: {
			cause:
				'Zwykłe AND dwóch przycisków nie sprawdza jednoczesności ani puszczenia. Jeden przyklejony przycisk zamieniał prasę w maszynę jednoręczną.',
			lesson:
				'Sterowanie oburęczne typu III: jednoczesność 0,5 s, przerwanie przy puszczeniu, nowy cykl po puszczeniu obu.',
			tip: 'W prawdziwej maszynie tę funkcję realizuje przekaźnik lub sterownik bezpieczeństwa z certyfikatem — Twój program w PLC może ją powielać do diagnostyki, ale nie zastępować.'
		}
	}
];

export const getTicket = (id: string) => TICKETS.find((t) => t.id === id) ?? null;

export const ticketForLesson = (slug: string) => TICKETS.find((t) => t.lesson === slug) ?? null;

/** The ticket after this one, in story order. */
export const nextTicket = (id: string) => {
	const i = TICKETS.findIndex((t) => t.id === id);
	return i >= 0 ? (TICKETS[i + 1] ?? null) : null;
};

export const PRIORITY_STYLE: Record<Priority, string> = {
	niski: 'bg-slate-700 text-slate-200',
	normalny: 'bg-sky-500/20 text-sky-200',
	pilny: 'bg-amber-500/20 text-amber-200',
	awaria: 'bg-red-500/25 text-red-200'
};
