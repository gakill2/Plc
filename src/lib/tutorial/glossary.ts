import type { GlossaryEntry } from './types.js';

/** Polish ↔ English PLC vocabulary. */
export const GLOSSARY: GlossaryEntry[] = [
	{
		pl: 'sterownik programowalny (PLC)',
		en: 'programmable logic controller',
		text: 'Komputer przemysłowy sterujący maszyną lub procesem w stałym cyklu.',
		chapter: 'czym-jest-plc'
	},
	{
		pl: 'wejście cyfrowe (DI)',
		en: 'digital input',
		text: 'Zacisk, z którego sterownik czyta stan 0/1 — przycisk, czujnik. Adresy I…',
		chapter: 'czym-jest-plc'
	},
	{
		pl: 'wyjście cyfrowe (DQ, DO)',
		en: 'digital output',
		text: 'Zacisk, którym sterownik włącza element wykonawczy. Adresy Q…',
		chapter: 'czym-jest-plc'
	},
	{
		pl: 'element wykonawczy',
		en: 'actuator',
		text: 'To, czym sterownik działa na obiekt: stycznik silnika, zawór, siłownik, lampka.',
		chapter: 'czym-jest-plc'
	},
	{
		pl: 'cykl skanowania (cykl programu)',
		en: 'scan cycle',
		text: 'Powtarzana pętla: odczyt wejść → wykonanie programu → zapis wyjść.',
		chapter: 'cykl-skanowania'
	},
	{
		pl: 'obraz procesu',
		en: 'process image',
		text: 'Kopia wejść (I) i wyjść (Q) w pamięci; program działa na niej, a nie bezpośrednio na zaciskach.',
		chapter: 'cykl-skanowania'
	},
	{
		pl: 'czas cyklu',
		en: 'scan time / cycle time',
		text: 'Czas jednego obiegu pętli programu, zwykle kilka ms.',
		chapter: 'cykl-skanowania'
	},
	{
		pl: 'watchdog (nadzór czasu cyklu)',
		en: 'watchdog',
		text: 'Zatrzymuje sterownik, gdy cykl trwa zbyt długo, np. przez nieskończoną pętlę.',
		chapter: 'cykl-skanowania'
	},
	{
		pl: 'marker, merker (pamięć M)',
		en: 'marker / flag memory',
		text: 'Wewnętrzna pamięć sterownika na zmienne pomocnicze. Adresy M…',
		chapter: 'adresowanie'
	},
	{
		pl: 'bit / bajt / słowo / podwójne słowo',
		en: 'bit / byte / word / double word',
		text: '1 / 8 / 16 / 32 bity. W adresach: X (bit), B, W, D — np. M0.0, MB4, MW10, MD20.',
		chapter: 'adresowanie'
	},
	{
		pl: 'tablica symboli',
		en: 'symbol table / tag table',
		text: 'Nazwy nadane adresom, np. Start → I0.0.',
		chapter: 'adresowanie'
	},
	{
		pl: 'schemat drabinkowy (LAD)',
		en: 'ladder diagram',
		text: 'Graficzny język programowania przypominający schemat przekaźnikowy.',
		chapter: 'styki-i-cewki'
	},
	{
		pl: 'szczebel, sieć',
		en: 'rung, network',
		text: 'Jeden „wiersz” drabinki: styki od lewej szyny do cewek.',
		chapter: 'styki-i-cewki'
	},
	{
		pl: 'styk zwierny',
		en: 'normally open contact (NO)',
		text: 'Przewodzi, gdy jego bit = 1. Symbol ┤ ├.',
		chapter: 'styki-i-cewki'
	},
	{
		pl: 'styk rozwierny',
		en: 'normally closed contact (NC)',
		text: 'Przewodzi, gdy jego bit = 0. Symbol ┤/├.',
		chapter: 'styki-i-cewki'
	},
	{
		pl: 'cewka',
		en: 'coil',
		text: 'Zapisuje wynik szczebla do bitu w każdym cyklu. Symbol ( ).',
		chapter: 'styki-i-cewki'
	},
	{
		pl: 'przepływ prądu (w drabince)',
		en: 'power flow',
		text: 'Wynik logiczny szczebla pokazany jako „prąd” płynący przez styki.',
		chapter: 'styki-i-cewki'
	},
	{
		pl: 'wynik operacji logicznej (RLO, VKE)',
		en: 'result of logic operation',
		text: 'Bieżąca wartość logiczna w trakcie wykonywania szczebla.',
		chapter: 'logika'
	},
	{
		pl: 'iloczyn / suma / negacja',
		en: 'AND / OR / NOT',
		text: 'Szeregowo / równolegle / styk rozwierny.',
		chapter: 'logika'
	},
	{
		pl: 'samopodtrzymanie',
		en: 'self-holding, latch, seal-in',
		text: 'Styk wyjścia równolegle do przycisku Start, który utrzymuje wyjście po puszczeniu przycisku.',
		chapter: 'podtrzymanie'
	},
	{
		pl: 'cewka ustawiająca / kasująca',
		en: 'set / reset coil',
		text: '(S) ustawia bit na 1 i go zostawia, (R) kasuje na 0.',
		chapter: 'podtrzymanie'
	},
	{
		pl: 'dominacja wyłączania',
		en: 'reset priority / reset-dominant',
		text: 'Gdy Start i Stop działają naraz, wygrywa Stop.',
		chapter: 'podtrzymanie'
	},
	{
		pl: 'zbocze narastające / opadające',
		en: 'rising / falling edge',
		text: 'Zmiana sygnału 0→1 / 1→0; styk zbocza przewodzi przez jeden cykl. Symbole ┤P├ / ┤N├.',
		chapter: 'zbocza'
	},
	{
		pl: 'przekaźnik czasowy, timer',
		en: 'timer',
		text: 'Blok odmierzający czas: TON, TOF, TP.',
		chapter: 'timery'
	},
	{
		pl: 'opóźnione załączenie',
		en: 'on-delay timer (TON)',
		text: 'Q = 1, gdy IN trwa nieprzerwanie co najmniej PT.',
		chapter: 'timery'
	},
	{
		pl: 'opóźnione wyłączenie',
		en: 'off-delay timer (TOF)',
		text: 'Q gaśnie dopiero PT po wyłączeniu IN.',
		chapter: 'timery'
	},
	{
		pl: 'generator impulsu',
		en: 'pulse timer (TP)',
		text: 'Zbocze IN daje impuls o długości dokładnie PT.',
		chapter: 'timery'
	},
	{
		pl: 'czas zadany / upływający',
		en: 'preset time (PT) / elapsed time (ET)',
		text: 'PT — na ile ustawiono timer, ET — ile czasu już upłynęło.',
		chapter: 'timery'
	},
	{
		pl: 'licznik w górę / w dół',
		en: 'up / down counter (CTU / CTD)',
		text: 'Liczy zbocza wejścia; CV — wartość bieżąca, PV — zadana.',
		chapter: 'liczniki'
	},
	{
		pl: 'porównanie',
		en: 'comparison (CMP)',
		text: 'Element przewodzący, gdy warunek liczbowy (=, <, > …) jest spełniony.',
		chapter: 'liczniki'
	},
	{
		pl: 'tekst strukturalny (ST)',
		en: 'structured text (SCL w Siemensie)',
		text: 'Tekstowy język IEC 61131-3 podobny do Pascala.',
		chapter: 'structured-text'
	},
	{
		pl: 'blok funkcyjny, instancja',
		en: 'function block, instance',
		text: 'Blok z pamięcią (np. TON); każde użycie ma własną instancję z własnym stanem.',
		chapter: 'structured-text'
	},
	{
		pl: 'tablica obserwacji',
		en: 'watch table',
		text: 'Podgląd i zmiana wartości zmiennych w czasie pracy sterownika.'
	},
	{
		pl: 'wymuszanie',
		en: 'forcing',
		text: 'Trwałe ustawienie sygnału na 0 lub 1 niezależnie od programu i zacisków — narzędzie diagnostyczne.'
	},
	{
		pl: 'zasada fail-safe',
		en: 'fail-safe',
		text: 'Projektowanie tak, by typowa usterka (przerwany przewód) prowadziła do stanu bezpiecznego.',
		chapter: 'bezpieczenstwo'
	},
	{
		pl: 'wyłącznik krańcowy, krańcówka',
		en: 'limit switch',
		text: 'Czujnik mechaniczny sygnalizujący skrajne położenie.'
	},
	{
		pl: 'czujnik indukcyjny / zbliżeniowy',
		en: 'inductive / proximity sensor',
		text: 'Bezdotykowo wykrywa obecność przedmiotu.'
	},
	{
		pl: 'stycznik',
		en: 'contactor',
		text: 'Przekaźnik dużej mocy załączający np. silnik; sterownik steruje jego cewką.'
	},
	{
		pl: 'sterowanie dwupołożeniowe',
		en: 'on-off (bang-bang) control',
		text: 'Włącz poniżej progu, wyłącz powyżej — jak regulacja poziomu w zbiorniku.'
	},
	{
		pl: 'czujnik PNP',
		en: 'PNP sensor',
		text: 'Czujnik, który przy wykryciu podaje +24 V na przewód sygnałowy. Współpracuje z wejściem typu sink (1M na 0 V).',
		chapter: 'elektryka'
	},
	{
		pl: 'czujnik NPN',
		en: 'NPN sensor',
		text: 'Czujnik, który przy wykryciu zwiera przewód sygnałowy do 0 V. Wymaga wejścia typu source (1M na +24 V).',
		chapter: 'elektryka'
	},
	{
		pl: 'wejście sink / source',
		en: 'sinking / sourcing input',
		text: 'Sposób podłączenia wspólnego zacisku modułu wejść: do 0 V (sink, dla PNP) albo do +24 V (source, dla NPN).',
		chapter: 'elektryka'
	},
	{
		pl: 'wyjście przekaźnikowe',
		en: 'relay output',
		text: 'Wyjście ze stykiem przekaźnika: przełącza AC i DC, ale wolno i z zużyciem styku.',
		chapter: 'elektryka'
	},
	{
		pl: 'wyjście tranzystorowe',
		en: 'transistor output',
		text: 'Szybkie wyjście 24 V DC bez zużycia, o małym prądzie (zwykle do 0,5 A).',
		chapter: 'elektryka'
	},
	{
		pl: 'dioda gasząca',
		en: 'flyback diode',
		text: 'Dioda równolegle do cewki DC, tłumi przepięcie przy wyłączaniu i chroni wyjście.',
		chapter: 'elektryka'
	},
	{
		pl: 'sygnał analogowy 4–20 mA',
		en: '4–20 mA current loop',
		text: 'Standardowy sygnał pomiarowy; 4 mA = początek zakresu, poniżej ok. 3,6 mA = awaria (żywe zero).',
		chapter: 'liczby-i-analog'
	},
	{
		pl: 'skalowanie',
		en: 'scaling',
		text: 'Przeliczenie surowej wartości z karty analogowej (np. 0…27648) na jednostki fizyczne.',
		chapter: 'liczby-i-analog'
	},
	{
		pl: 'przepełnienie',
		en: 'overflow',
		text: 'Wynik większy niż mieści typ danych — np. INT po 32 767 przechodzi na −32 768.',
		chapter: 'liczby-i-analog'
	},
	{
		pl: 'wartość zadana (SP)',
		en: 'setpoint',
		text: 'Wartość, którą regulator ma utrzymać.',
		chapter: 'regulacja'
	},
	{
		pl: 'wartość mierzona (PV)',
		en: 'process value',
		text: 'Aktualna wartość wielkości regulowanej, zmierzona czujnikiem.',
		chapter: 'regulacja'
	},
	{
		pl: 'histereza',
		en: 'hysteresis',
		text: 'Różnica między progiem włączenia i wyłączenia — zapobiega ciągłemu przełączaniu.',
		chapter: 'regulacja'
	},
	{
		pl: 'regulator PID',
		en: 'PID controller',
		text: 'Regulator z członami proporcjonalnym (P), całkującym (I) i różniczkującym (D).',
		chapter: 'regulacja'
	},
	{
		pl: 'blok funkcyjny (FB)',
		en: 'function block',
		text: 'Blok programu z własną pamięcią; każde użycie to osobna instancja (np. TON).',
		chapter: 'organizacja'
	},
	{
		pl: 'funkcja (FC)',
		en: 'function',
		text: 'Blok programu bez pamięci między wywołaniami.',
		chapter: 'organizacja'
	},
	{
		pl: 'blok organizacyjny (OB)',
		en: 'organization block',
		text: 'Blok wywoływany przez system sterownika, np. OB1 — program cykliczny.',
		chapter: 'organizacja'
	},
	{
		pl: 'blok danych (DB)',
		en: 'data block',
		text: 'Obszar pamięci na dane: instancji FB albo wspólne parametry.',
		chapter: 'organizacja'
	}
];
