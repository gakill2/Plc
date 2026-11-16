/*
 * "How it looks in TIA Portal": a short bridge from each lesson to the tool most Polish
 * job offers ask for (Siemens S7-1200 / S7-1500, TIA Portal V17+). Text in `backticks` is code.
 * The content stays Polish, like the lessons.
 */

export const TIA_NOTES: Record<string, string[]> = {
	'first-rung': [
		'Program cykliczny to **OB1** („Main”, *Program cycle*). Nowy blok: drzewo projektu → *Program blocks* → *Add new block* → OB / FB / FC / DB, język LAD, FBD, SCL, STL albo GRAPH.',
		'Adresy piszesz z procentem (`%I0.0`, `%Q0.0`), ale w praktyce zawsze przez **tagi PLC** (*PLC tags* → *Default tag table*) — w programie widać `"Start"` w cudzysłowie.'
	],
	'and-or': [
		'W LAD szeregowe styki to I, gałąź równoległa to LUB — dokładnie tak jak tutaj. Gałąź dodajesz przyciskami *Open branch* / *Close branch* (albo przeciągając styk pod spód).',
		'Podgląd online: okulary (*Monitoring on/off*) — styki przewodzące świecą na zielono, jak w tym symulatorze.'
	],
	'self-holding': [
		'Podtrzymanie wygląda identycznie. Zamiast niego często spotkasz cewki `S` / `R` (*Set* / *Reset*) albo blok **SR / RS** — sprawdzaj, który wygrywa przy obu sygnałach naraz.',
		'Stop przez styk NC na szafie = w programie **styk zwierny** (NO) na tagu Stop. W tablicy tagów dopisz w komentarzu „NC”.'
	],
	toggle: [
		'Zbocza w TIA: styk `P` / `N` (*P_TRIG* / *N_TRIG* z bitem pamięci) albo w SCL instancja `R_TRIG` / `F_TRIG`. Każde zbocze potrzebuje własnego bitu pamięci — nie używaj jednego dla dwóch styków.'
	],
	'traffic-light': [
		'Timery IEC w TIA to **TON / TOF / TP / TONR** — każdy potrzebuje instancji: osobny DB (*single instance*) albo pole w DB bloku FB (*multi-instance*). Przy wstawianiu TIA sam pyta, którą wybrać.',
		'Stare timery S5 (`S_ODT`, `SE` w AWL) są dostępne tylko w S7-300/400 i S7-1500 — w nowym projekcie używaj IEC.'
	],
	'tank-level': [
		'Analog w TIA: wartość z karty to INT 0 … 27648 (`%IW64`). Skalowanie: `NORM_X` (do 0,0 … 1,0) i `SCALE_X` (do jednostek), albo w SCL jedna linia z REAL.'
	],
	'drilling-station': [
		'Sekwencje w TIA pisze się w **SCL** (`CASE`, jak tutaj) albo w **S7-GRAPH** (S7-1500, licencja w STEP 7 Professional). GRAPH ma wbudowany nadzór czasu kroków i analizę kryteriów na HMI.'
	],
	'bug-double-coil': [
		'TIA nie zabroni Ci podwójnej cewki — skompiluje się bez błędu. Znajdziesz ją w **Cross-reference** (`F11` na tagu albo *Tools* → *Cross-references*): lista wszystkich miejsc, gdzie tag jest zapisywany i czytany.'
	],
	'bug-flicker': [
		'Do takich błędów służy **Trace** (*Traces* w drzewie projektu): nagrywa sygnały w każdym cyklu albo w OB cyklicznym i pokazuje je na wykresie — jak diagram czasowy w tym symulatorze.'
	],
	'commissioning-conveyor': [
		'Na rozruchu: **Watch table** do podglądu i *Modify*, **Force table** do wymuszania wejść i wyjść (w S7-1200/1500 force działa na wejściach i wyjściach, nie na M i DB). CPU z aktywnym force świeci diodą MAINT — zawsze zdejmij force przed odjazdem.'
	],
	'commissioning-vfd': [
		'Napędy Siemens (SINAMICS G120) konfiguruje się w TIA przez **Startdrive**, a w programie używa się bloku `SINA_SPEED` (telegram 1) albo `SINA_POS` (pozycjonowanie, telegram 111).'
	],
	'hmi-start': [
		'Panel w TIA to **WinCC** (Basic / Comfort / Advanced / Unified). Przycisk z eventem *Press* → `SetBit`, *Release* → `ResetBit` na tagu PLC — albo w Unified *Press* / *Release* z tym samym tagiem.',
		'HMI pisze do **DB albo M**, nigdy do wejść `%I` — one są nadpisywane obrazem procesu na początku każdego cyklu.'
	],
	'oven-pid': [
		'Regulator w TIA: **PID_Compact** (technologia, w OB cyklicznym, np. OB30 co 100 ms). Ma okno **Commissioning** z autostrojeniem (*pretuning*, *fine tuning*) i wykresem — warto przejść je raz na PLCSIM z prostym modelem obiektu.'
	],
	'remote-pump': [
		'Komunikacja S7-S7 przez Ethernet: `PUT` / `GET` (trzeba zezwolić w CPU: *Protection & Security* → *Permit access with PUT/GET*) albo `TSEND_C` / `TRCV_C`. Modbus TCP: `MB_CLIENT` / `MB_SERVER`.'
	],
	'two-hand-press': [
		'Sterowanie oburęczne i e-stop w prawdziwej maszynie robisz w **programie F** (F-CPU, STEP 7 Safety) albo na przekaźniku bezpieczeństwa — nie w zwykłym OB1. Biblioteka Safety ma gotowe bloki: `TWO_H_EN`, `ESTOP1`, `FDBACK`.'
	],
	'fb-motor': [
		'FB w TIA ma interfejs: *Input*, *Output*, *InOut*, *Static* (pamięć między cyklami, w DB instancji), *Temp* (tylko na czas wywołania), *Constant*. W SCL lokalne zmienne mają `#` (`#Run`), a globalne cudzysłów (`"Start"`).',
		'Wywołanie FB w OB1 tworzy **instancyjny DB** (`"Motor1_DB"`). Wywołanie FB w innym FB z instancją w *Static* to **multi-instancja** — jeden DB na całą stację zamiast dziesięciu.'
	],
	'recipe-index': [
		'Tablice w TIA: `Array[1..10] of Int` w DB. Indeks zmienny w SCL `#recipes[#i]` działa normalnie; w LAD użyj bloku `MOVE` z tablicą albo `FieldRead` / `FieldWrite` w starszych projektach.'
	],
	'pneumatic-press': [
		'Nadzór czasu kroku w SCL wygląda tak samo: instancja `TON` w *Static* FB. W S7-1500 możesz zamiast tego użyć **ProDiag** (nadzory pozycji i akcji z gotowymi tekstami alarmów).'
	],
	'std-motor': [
		'Taki blok w firmie trzyma się w **bibliotece globalnej** jako **typ** z wersją (np. `Motor` V1.2.0). Projekty używają instancji typu; zmiana bloku = nowa wersja *in test* → test → *Release version* → *Update instances* w projekcie.'
	],
	'std-conveyors': [
		'Tu wyraźnie widać sens multi-instancji: FB `Line` z trzema instancjami `Motor` w *Static* daje jeden DB `"Line_DB"`, a HMI czyta `"Line_DB".M1.Fault` — struktura danych odpowiada strukturze maszyny.'
	],
	'capstone-mixer': [
		'Struktura projektu TIA dla takiej maszyny: OB1 woła FB `Mixer` (instancja w DB), receptury w globalnym DB z typem PLC (UDT) `Recipe`, alarmy jako **Program alarms** (`Program_Alarm`) albo *HMI discrete alarms* na bitach z DB.',
		'**RETAIN** w TIA ustawiasz przy każdej zmiennej DB (kolumna *Retain*) — w blokach zoptymalizowanych pojedynczo, w standardowych dla całego bloku.'
	],
	'stl-pump': [
		'AWL to w TIA **STL** — dostępny na S7-300/400 i S7-1500 (nie na S7-1200). Stare projekty STEP 7 V5.x otwiera się przez *Project* → *Migrate project* (potrzebny STEP 7 V5.x na tym samym komputerze albo plik `.am*`).'
	],
	'brownfield-press': [
		'Przed każdą zmianą w cudzym programie: **porównaj online/offline** (*Compare* → *Online/offline*). Jeśli bloki się różnią, ktoś zmieniał online i nie zapisał — najpierw wgraj z CPU do projektu (*Upload from device*), dopiero potem zmieniaj.'
	],
	'hw-config': [
		'**Device configuration**: wstawiasz CPU i moduły z katalogu, w *Properties* każdego modułu ustawiasz adresy I/O (*I/O addresses* → *Start address*) i typ pomiaru kanałów analogowych (*Measurement type*, *Measuring range*, diagnostyka *Wire break*). Po zmianie konfiguracji wgrywa się **Hardware and software**.'
	],
	'f-estop': [
		'Program F w TIA: CPU F (np. 1516F, 1214FC), licencja **STEP 7 Safety Basic / Advanced**, F-moduły z adresem PROFIsafe (ustawianym przełącznikami albo przypisywanym z TIA — zależnie od modułu). Program F ma podpis (*F-signature*) — każda zmiana go zmienia i trzeba ją udokumentować.'
	],
	'alarm-flood': [
		'W WinCC alarmy definiujesz jako *Discrete alarms* (bit) i *Analog alarms* (próg), z klasą (*Errors*, *Warnings*), priorytetem i *Info text* — to miejsce na „co zrobić”. W Unified dochodzi filtrowanie i *shelving*.'
	],
	'recipe-db': [
		'UDT w TIA to **PLC data type** (`"Recipe"`), DB z tablicą `Array[1..3] of "Recipe"`. Wartości startowe ustawiasz w kolumnie *Start value* DB. Po zmianie struktury DB wgranie wymaga reinicjalizacji — wartości wracają do *Start value*, więc receptury operatora trzeba najpierw zabezpieczyć (*Snapshot* → *Copy snapshot to start values* albo kopia z panelu).'
	],
	'motion-pickplace': [
		'Oś w TIA to **obiekt technologiczny** *TO_PositioningAxis* (S7-1200 i S7-1500), z oknem *Commissioning* (jog, bazowanie bez programu). W programie te same bloki PLCopen: `MC_Power`, `MC_Home`, `MC_MoveAbsolute`, `MC_Halt`, `MC_Reset`.'
	],
	'change-management': [
		'Wersjonowanie w TIA: **Multiuser Engineering** albo **Version Control Interface** (eksport do Git); bez tego co najmniej archiwum `.zap` z datą i opisem zmiany. Porównanie projektów: *Compare* → *Offline/offline* pokazuje różnice blok po bloku, a w bloku linia po linii.'
	],
	'press-packml': [
		'Siemens udostępnia bibliotekę **PackML** (`LPMLV30`, do pobrania z SIOS) z gotowym FB modelu stanów i PackTags. W firmie częściej spotkasz jednak własny FB „MachineState” z tym samym zestawem stanów.',
		'OB100 w TIA: *Add new block* → OB → *Startup*. S7-1200/1500 zawsze robi *warm restart*: zmienne z *Retain* zachowują wartość, pozostałe dostają *Start value*.'
	],
	'press-diagnostics': [
		'Gotowe narzędzia diagnostyki w TIA: **ProDiag** (S7-1500, nadzory z tekstem i kryteriami), **Program_Alarm** (alarm z programu z wartościami towarzyszącymi) i **System diagnostics** (alarmy sprzętu bez jednej linii kodu). Na panelu: kontrolka *PLC code view* pokazuje fragment programu, który blokuje krok.'
	]
};
