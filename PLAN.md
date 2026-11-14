# PLC Sim — plan aplikacji

Webowy symulator sterownika PLC do nauki: użytkownik buduje układ (sterownik + przyciski, czujniki, lampki, silniki), programuje go w Ladder (LAD) i Structured Text (ST), uruchamia i obserwuje, jak sterownik wykonuje program cykl po cyklu.

**Cel portfolio:** pokazać umiejętność zaprojektowania nietrywialnej architektury (silnik wykonawczy, kompilator, edytory graficzne, symulacja czasu rzeczywistego), czysty kod w TypeScript, testy i CI/CD.

---

## 1. Stack i decyzje techniczne

| Obszar                  | Wybór                                                                                 | Uzasadnienie                                         |
| ----------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Framework               | SvelteKit 3 + Svelte 5 (runes), TypeScript                                            | już w projekcie (`plc/`)                             |
| Style                   | Tailwind 4                                                                            | już w projekcie                                      |
| Hosting                 | `adapter-cloudflare` → Cloudflare Workers (statyczne assety + worker)                 | MVP bez backendu; w razie potrzeby D1/KV/R2 pod ręką |
| Silnik PLC              | czysty TS w `src/lib/engine`, **zero zależności od Svelte**                           | testowalny w Node, można go uruchomić w Web Workerze |
| Wykonanie               | Web Worker + stały czas cyklu (np. 10 ms)                                             | UI nie blokuje symulacji i odwrotnie                 |
| Edytor układu (schemat) | `@xyflow/svelte` (Svelte Flow)                                                        | węzły, porty, połączenia, zoom/pan za darmo          |
| Edytor Ladder           | własny, SVG + siatka                                                                  | to jest „serce” projektu — warto napisać samemu      |
| Edytor ST               | CodeMirror 6 + własna gramatyka / podświetlanie                                       | lekki, dobrze działa z Svelte                        |
| Zapis                   | IndexedDB (projekty) + eksport/import JSON + link (JSON skompresowany w URL)          | brak kont w MVP                                      |
| Testy                   | Vitest (silnik, kompilator), vitest-browser-svelte (komponenty), Playwright (e2e)     | już skonfigurowane                                   |
| CI/CD                   | GitHub Actions: lint → check → test → build; deploy na Cloudflare (`wrangler deploy`) |                                                      |

**Konwencja adresów:** styl Siemens S7 (`I0.0`, `Q0.0`, `M0.0`, `MW10`, `T1`, `C1`) — najczęściej spotykany na polskich uczelniach i w przemyśle — plus tablica symboli (np. `Start = I0.0`), żeby w programie używać nazw.

---

## 2. Funkcjonalności

### 2.1 Model sterownika (silnik)

- **Cykl skanowania** dokładnie jak w prawdziwym PLC: odczyt wejść → obraz procesu wejść (PII) → wykonanie programu → obraz procesu wyjść (PIQ) → zapis wyjść. Wizualizacja faz cyklu to mocny element dydaktyczny.
- **Obszary pamięci:** wejścia `I`, wyjścia `Q`, markery `M` (bity, bajty, słowa), timery `T`, liczniki `C`, później bloki danych `DB`.
- **Typy danych:** `BOOL`, `INT`, `DINT`, `REAL`, `TIME`.
- **Tryby:** STOP / RUN / STEP (jeden cykl), regulowana prędkość czasu (×0.1 … ×10), pauza.
- **Czas cyklu** i licznik cykli widoczne w UI; watchdog przy pętli nieskończonej w ST.

### 2.2 Instrukcje (wspólny zestaw dla LAD i ST)

- Bitowe: styk NO, styk NC, cewka, cewka negowana, SET, RESET, zbocze narastające (P) i opadające (N).
- Timery IEC: `TON`, `TOF`, `TP`.
- Liczniki: `CTU`, `CTD`, `CTUD`.
- Porównania: `==`, `<>`, `<`, `>`, `<=`, `>=`.
- Arytmetyka i przenoszenie: `ADD`, `SUB`, `MUL`, `DIV`, `MOVE`.
- Później: przerzutniki `SR`/`RS`, `SHL`/`SHR`, bloki funkcyjne użytkownika (FB).

### 2.3 Języki programowania

1. **Ladder (LAD)** — priorytet. Szczeble (rungs), gałęzie równoległe, przeciąganie elementów z palety, przypisywanie adresów/symboli, komentarze do szczebli.
2. **Structured Text (ST)** — edytor tekstowy z podświetlaniem, podpowiedziami symboli i błędami kompilacji w linii.
3. Opcjonalnie: **FBD** lub podgląd „Ladder → ST” (pokazuje, że oba języki kompilują się do tego samego).

Oba języki kompilują się do **wspólnej reprezentacji pośredniej (IR)** — silnik wykonuje tylko IR. To kluczowa decyzja architektoniczna, warto ją opisać w README.

### 2.4 Edytor układu (hardware)

- Paleta urządzeń: CPU, moduły wejść/wyjść cyfrowych, (później) analogowych.
- **Wejścia:** przycisk NO/NC (chwilowy), przełącznik, wyłącznik krańcowy, czujnik zbliżeniowy, czujnik poziomu, potencjometr (analog).
- **Wyjścia:** lampka, buzzer, stycznik, silnik (z kierunkiem), siłownik, zawór, wyświetlacz 7-seg.
- Łączenie urządzeń z zaciskami I/O przewodami; automatyczne przypisanie adresu z zacisku.
- Walidacja: niepodłączone urządzenia, dwa wyjścia na jednym zacisku itd.
- W trybie RUN urządzenia są **interaktywne** (klik = wciśnięcie przycisku) i animowane (lampka świeci, silnik się kręci).

### 2.5 Monitoring i debugowanie (to robi wrażenie)

- **Power flow** w Ladderze na żywo — podświetlenie przewodzących styków i aktywnych cewek.
- Wartości bieżące timerów/liczników nad instrukcjami.
- **Tablica obserwacji (watch table)** z możliwością **forsowania** zmiennych.
- **Wykres czasowy (trend / timing diagram)** wybranych sygnałów — idealny do zrozumienia TON vs TOF vs TP.
- Breakpoint na szczeblu / krok po szczeblu (wersja zaawansowana).
- Panel „co się stało w tym cyklu” (log zmian zmiennych).

### 2.6 Scenariusze procesów (gotowe instalacje)

Zamiast samych lampek — symulowane procesy z prostą fizyką:

- Sygnalizacja świetlna (timery).
- Rozruch silnika start/stop z podtrzymaniem, potem gwiazda–trójkąt.
- Napełnianie zbiornika (czujniki poziomu, pompa, zawór).
- Taśmociąg z sortowaniem (czujniki, siłowniki, liczniki).
- Brama garażowa (krańcówki, zabezpieczenie fotokomórką).

Każdy scenariusz = predefiniowany układ + model procesu wywoływany co tick (`process.update(dt, outputs) → inputs`).

### 2.7 Tryb nauki

- **Lekcje** z opisem teorii, zadaniem i pustym/półgotowym programem.
- **Automatyczna weryfikacja rozwiązania:** zadanie zawiera testy (sekwencja wejść w czasie → oczekiwane wyjścia), uruchamiane na silniku bez UI. Wynik: zaliczone / które przypadki nie przechodzą.
- Podpowiedzi stopniowane, postęp zapisywany lokalnie.
- Ścieżka: logika bitowa → podtrzymanie → SET/RESET → zbocza → timery → liczniki → porównania → mini-projekt.

### 2.8 Projekty i UX

- Lista projektów, zapis automatyczny, eksport/import `.plcsim.json`, udostępnianie linkiem.
- Cofnij/ponów (undo/redo) we wszystkich edytorach.
- Skróty klawiszowe, ciemny/jasny motyw.
- Interfejs po angielsku z i18n (PL/EN) — angielski lepiej działa w portfolio.

---

## 3. Architektura

```
┌────────────────────────── UI (Svelte) ──────────────────────────┐
│ Edytor układu │ Edytor LAD │ Edytor ST │ Watch/Trend │ Lekcje    │
└───────┬─────────────┬───────────┬────────────┬──────────────────┘
        │  stan projektu (runes, klasy *.svelte.ts)                │
        ▼                                                          │
   ┌──────────┐   LAD/ST → IR   ┌────────────────────────────┐     │
   │ Compiler │ ──────────────▶ │ Runtime (Web Worker)        │◀───┘
   └──────────┘                 │  ScanCycle → Memory → IR VM │ postMessage:
                                │  ProcessModel (scenariusz)  │ snapshot pamięci
                                └────────────────────────────┘ co klatkę
```

Zasady:

- **Silnik nie zna UI.** Komunikacja z workerem przez typowane wiadomości (`load`, `run`, `stop`, `step`, `setInput`, `force`, `snapshot`).
- UI odświeża się z `requestAnimationFrame` na podstawie ostatniego snapshotu — symulacja może liczyć szybciej niż 60 FPS.
- Ladder trzymamy jako **drzewo szeregowo-równoległe** (`Series[]`, `Parallel[]`, `Element`), a siatkę tylko renderujemy. Ewaluacja i kompilacja są wtedy proste, a edytor nadal wygląda jak klasyczny LAD.

### Szkic typów

```ts
type Address = { area: 'I' | 'Q' | 'M' | 'T' | 'C'; byte: number; bit?: number; size?: 'X' | 'B' | 'W' | 'D' };

type LadderNode =
  | { kind: 'series'; items: LadderNode[] }
  | { kind: 'parallel'; branches: LadderNode[] }
  | { kind: 'contact'; type: 'NO' | 'NC' | 'P' | 'N'; operand: string }
  | { kind: 'compare'; op: CompareOp; a: string; b: string };

type Rung = { id: string; comment?: string; logic: LadderNode; outputs: OutputElement[] };

type IRInstr =
  | { op: 'LD' | 'LDN' | 'AND' | 'ANDN' | 'OR' | 'ORN'; addr: Address }
  | { op: 'PUSH' | 'POP_AND' | 'POP_OR' }
  | { op: 'ST' | 'S' | 'R'; addr: Address }
  | { op: 'CALL'; fb: 'TON' | 'TOF' | 'TP' | 'CTU' | 'CTD'; instance: string; args: Record<string, Operand> }
  | /* math, compare, jump ... */;

interface ProcessModel { update(dtMs: number, outputs: ReadonlyMemory, inputs: WritableMemory): void }
```

IR to w praktyce maszyna stosowa w stylu Instruction List — łatwa do wykonania, łatwa do testów i dobrze pokazuje, jak działa prawdziwy sterownik.

### Struktura katalogów

```
src/lib/
  engine/        memory.ts, scan-cycle.ts, vm.ts, instructions/ (timers, counters...)
  compiler/      ladder-to-ir.ts, st/ (lexer, parser, ast, codegen), diagnostics.ts
  runtime/       worker.ts, protocol.ts, runtime-client.svelte.ts
  devices/       definicje urządzeń (rendering + zachowanie)
  processes/     scenariusze: traffic-light, tank, conveyor...
  editors/
    ladder/      LadderEditor.svelte, Rung.svelte, elementy, power-flow
    st/          StEditor.svelte (CodeMirror)
    circuit/     CircuitEditor.svelte (Svelte Flow), węzły urządzeń
  monitor/       WatchTable.svelte, TrendChart.svelte
  lessons/       treści lekcji + testy weryfikujące
  project/       model projektu, zapis IndexedDB, import/eksport, undo/redo
src/routes/
  /              strona startowa (demo + wybór)
  /projects      lista projektów
  /editor/[id]   główny widok: układ | program | monitor
  /learn         lista lekcji, /learn/[slug]
```

---

## 4. Plan realizacji (etapy)

Każdy etap kończy się działającą, wdrożoną wersją.

**Etap 0 — fundamenty (1 tydz.)**

- `adapter-static`, usunięcie przykładów Vitest, layout aplikacji, GitHub Actions; konfiguracja Cloudflare Workers (`wrangler.jsonc`), deploy na później.
- README z celem projektu i zrzutami ekranu (uzupełniany na bieżąco).

**Etap 1 — silnik (1–2 tyg.)** ✅ gotowe, gdy testy przechodzą bez UI

- Pamięć, parser adresów, cykl skanowania, VM dla IR, styki/cewki/SET/RESET/zbocza, TON/TOF/TP, CTU/CTD.
- Testy jednostkowe ze sztucznym zegarem (deterministyczny czas!). Cel: >90% pokrycia silnika.

**Etap 2 — Ladder MVP (2–3 tyg.)**

- Edytor szczebli (dodawanie elementów szeregowo/równolegle, usuwanie, adresy), kompilacja LAD → IR.
- Prosty panel I/O (przełączniki dla I, diody dla Q) zamiast pełnego schematu.
- RUN/STOP/STEP, power flow na żywo. **To już jest pokazywalne demo.**

**Etap 3 — edytor układu (2 tyg.)**

- Svelte Flow, CPU + moduły I/O + 6–8 urządzeń, przewody, interakcja w RUN.
- Tablica symboli.

**Etap 4 — monitoring (1 tydz.)**

- Watch table z forsowaniem, wykres czasowy sygnałów, wartości timerów nad instrukcjami.

**Etap 5 — scenariusze i lekcje (2 tyg.)**

- 3 scenariusze procesów (światła, zbiornik, taśmociąg).
- 6–8 lekcji z automatyczną weryfikacją.

**Etap 6 — Structured Text (2–3 tyg.)**

- Lexer, parser (recursive descent), AST, generowanie IR, błędy w edytorze.
- IF/ELSIF/ELSE, CASE, FOR/WHILE (z watchdogiem), wywołania timerów/liczników.

**Etap 7 — dopracowanie (ciągle)**

- Zapis projektów, linki do udostępniania, undo/redo, i18n, dostępność, responsywność (tablet).
- Testy e2e Playwright dla głównej ścieżki: zbuduj układ → napisz program → RUN → sprawdź wyjście.

**Później / opcjonalnie:** konta i chmura (Cloudflare D1 + KV), wejścia/wyjścia analogowe + PID, FBD, bloki FB użytkownika, eksport do formatu PLCopen XML, tryb „wyzwanie” z rankingiem, połączenie z Twoim fizycznym DIY PLC (WebSerial) — świetne domknięcie dwóch projektów.

---

## 5. Co pokaże pracodawcy

- **README** z GIF-em demo, linkiem do wersji live i diagramem architektury.
- `docs/adr/` — krótkie Architecture Decision Records (np. „Dlaczego wspólne IR”, „Dlaczego Web Worker”, „Ladder jako drzewo, nie siatka”).
- Badge CI i pokrycia testami; silnik i kompilator mocno przetestowane.
- Czytelne commity i PR-y, issues/milestones na GitHubie odpowiadające etapom z tego planu.
- Krótki wpis/artykuł „Jak działa cykl skanowania PLC — zbudowałem symulator w przeglądarce”.

---

## 6. Ryzyka

| Ryzyko                                  | Jak ograniczyć                                                       |
| --------------------------------------- | -------------------------------------------------------------------- |
| Edytor Ladder pochłonie najwięcej czasu | model drzewa zamiast swobodnej siatki; najpierw minimum funkcji      |
| Rozjazd czasu symulacji i UI            | czas symulacji liczony w workerze, UI tylko czyta snapshoty          |
| Parser ST to duży temat                 | dopiero w etapie 6, gdy IR jest stabilne; zacząć od podzbioru języka |
| Za szeroki zakres                       | etapy 1–4 to pełnoprawne MVP do portfolio; reszta to rozszerzenia    |

---

## 7. Status

Wszystkie etapy 0–7 zrealizowane (listopad 2026). Poza pierwotnym planem: modele instalacji
działają w workerze po każdym cyklu, a lekcje mają rozwiązania wzorcowe sprawdzane w CI.
Nie zrobione z „później / opcjonalnie”: konta i chmura, analog + PID, FBD, eksport PLCopen XML,
i18n (interfejs jest po angielsku), połączenie z fizycznym DIY PLC przez WebSerial.
