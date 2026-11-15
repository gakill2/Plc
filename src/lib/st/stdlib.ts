/**
 * Standard library of function blocks available in every language (LAD, ST, SFC), written in
 * Structured Text and compiled together with the user's own library.
 */
import { parse } from './parser.js';

export const STDLIB = `(* ---- biblioteka standardowa ---- *)
FUNCTION_BLOCK SCALE
(* NORM_X + SCALE_X: przelicza wartość z zakresu IN_LO..IN_HI na OUT_LO..OUT_HI *)
VAR_INPUT
  IN     : REAL;
  IN_LO  : REAL := 0.0;
  IN_HI  : REAL := 27648.0;
  OUT_LO : REAL := 0.0;
  OUT_HI : REAL := 100.0;
END_VAR
VAR_OUTPUT
  OUT : REAL;
END_VAR
IF IN_HI <> IN_LO THEN
  OUT := OUT_LO + (IN - IN_LO) / (IN_HI - IN_LO) * (OUT_HI - OUT_LO);
END_IF;
END_FUNCTION_BLOCK

FUNCTION_BLOCK PID
(* Regulator PID z próbkowaniem co 100 ms, ograniczeniem wyjścia i anti-windup *)
VAR_INPUT
  SP      : REAL;           // wartość zadana
  PV      : REAL;           // wartość mierzona
  KP      : REAL := 1.0;    // wzmocnienie
  TI      : REAL := 10.0;   // czas zdwojenia, s (0 = bez całki)
  TD      : REAL := 0.0;    // czas wyprzedzenia, s
  OUT_LO  : REAL := 0.0;
  OUT_HI  : REAL := 100.0;
  MAN     : BOOL;           // tryb ręczny
  MAN_OUT : REAL;           // wyjście w trybie ręcznym
END_VAR
VAR_OUTPUT
  OUT : REAL;
  ERR : REAL;
END_VAR
VAR
  integral : REAL;
  last     : REAL;
  raw      : REAL;
  tick     : TON;
END_VAR
tick(IN := NOT tick.Q, PT := T#100ms);
IF tick.Q THEN
  ERR := SP - PV;
  IF MAN THEN
    OUT := MAN_OUT;
    integral := 0.0;
  ELSE
    IF TI > 0.0 THEN
      integral := integral + ERR * 0.1 / TI;
    END_IF;
    raw := KP * (ERR + integral + TD * (ERR - last) / 0.1);
    IF raw > OUT_HI THEN
      OUT := OUT_HI;
      IF TI > 0.0 THEN integral := integral - ERR * 0.1 / TI; END_IF;
    ELSIF raw < OUT_LO THEN
      OUT := OUT_LO;
      IF TI > 0.0 THEN integral := integral - ERR * 0.1 / TI; END_IF;
    ELSE
      OUT := raw;
    END_IF;
  END_IF;
  last := ERR;
END_IF;
END_FUNCTION_BLOCK

(* ---- PLCopen Motion Control: oś 1 (napęd pozycjonujący, telegram QB64 / IB64) ---- *)
FUNCTION_BLOCK MC_Power
(* Załącza napęd osi. Status = oś gotowa (PowerOn). *)
VAR_INPUT
  Enable : BOOL;
END_VAR
VAR_OUTPUT
  Status : BOOL;
  Error : BOOL;
  ErrorID : INT;
END_VAR
Q64.0 := Enable;
Status := I64.0;
Error := I64.2;
IF I64.2 THEN ErrorID := IW68; ELSE ErrorID := 0; END_IF;
END_FUNCTION_BLOCK

FUNCTION_BLOCK MC_Reset
(* Kasuje błąd osi (ErrorStop → Standstill), gdy przyczyna ustąpiła. *)
VAR_INPUT
  Execute : BOOL;
END_VAR
VAR_OUTPUT
  Done : BOOL;
  Busy : BOOL;
  Error : BOOL;
END_VAR
Q64.1 := Execute;
Busy := Execute AND I64.2;
Done := Execute AND NOT I64.2;
Error := FALSE;
END_FUNCTION_BLOCK

FUNCTION_BLOCK MC_ReadActualPosition
(* Aktualna pozycja osi w mm. *)
VAR_INPUT
  Enable : BOOL;
END_VAR
VAR_OUTPUT
  Valid : BOOL;
  Position : REAL;
END_VAR
Valid := Enable AND I64.1;
IF Enable THEN Position := DINT_TO_REAL(ID70) / 1000.0; END_IF;
END_FUNCTION_BLOCK

FUNCTION_BLOCK MC_Home
(* Bazowanie: najazd na wyłącznik referencyjny, tam pozycja = Position. *)
VAR_INPUT
  Execute : BOOL;
  Position : REAL;
END_VAR
VAR_OUTPUT
  Done : BOOL;
  Busy : BOOL;
  CommandAborted : BOOL;
  Error : BOOL;
  ErrorID : INT;
END_VAR
VAR
  edge : R_TRIG;
  mySeq : INT;
  active : BOOL;
  seen : BOOL;
END_VAR
// wyjścia gasną po zdjęciu Execute (wynik widać jeszcze przez jeden cykl)
IF NOT Execute AND NOT active THEN
  Done := FALSE;
  CommandAborted := FALSE;
  Error := FALSE;
  ErrorID := 0;
END_IF;
edge(CLK := Execute);
IF edge.Q THEN
  QD70 := REAL_TO_DINT(Position * 1000.0);
  QW66 := 1;
  QW68 := QW68 + 1;           // nowy numer sekwencji = nowe polecenie dla napędu
  mySeq := QW68;
  active := TRUE;
  seen := FALSE;
  Done := FALSE;
  CommandAborted := FALSE;
  Error := FALSE;
  ErrorID := 0;
ELSIF active THEN
  IF IW66 = mySeq THEN seen := TRUE; END_IF;
  IF IW66 <> mySeq AND (seen OR IW66 > mySeq) THEN
    active := FALSE;          // napęd przyjął nowsze polecenie
    CommandAborted := TRUE;
  ELSIF seen AND (I65.2 OR I64.2) THEN
    active := FALSE;          // polecenie odrzucone albo oś w ErrorStop
    Error := TRUE;
    ErrorID := IW68;
  ELSIF seen AND I64.5 THEN
    active := FALSE;
    Done := TRUE;
  END_IF;
END_IF;
Busy := active;
END_FUNCTION_BLOCK

FUNCTION_BLOCK MC_MoveAbsolute
(* Ruch do pozycji Position [mm] z prędkością Velocity [mm/s] i przyspieszeniem Acceleration [mm/s²]. *)
VAR_INPUT
  Execute : BOOL;
  Position : REAL;
  Velocity : REAL;
  Acceleration : REAL;
END_VAR
VAR_OUTPUT
  Done : BOOL;
  Busy : BOOL;
  CommandAborted : BOOL;
  Error : BOOL;
  ErrorID : INT;
END_VAR
VAR
  edge : R_TRIG;
  mySeq : INT;
  active : BOOL;
  seen : BOOL;
END_VAR
// wyjścia gasną po zdjęciu Execute (wynik widać jeszcze przez jeden cykl)
IF NOT Execute AND NOT active THEN
  Done := FALSE;
  CommandAborted := FALSE;
  Error := FALSE;
  ErrorID := 0;
END_IF;
edge(CLK := Execute);
IF edge.Q THEN
  QD70 := REAL_TO_DINT(Position * 1000.0);
  QD74 := REAL_TO_DINT(Velocity * 1000.0);
  QD78 := REAL_TO_DINT(Acceleration * 1000.0);
  QW66 := 2;
  QW68 := QW68 + 1;           // nowy numer sekwencji = nowe polecenie dla napędu
  mySeq := QW68;
  active := TRUE;
  seen := FALSE;
  Done := FALSE;
  CommandAborted := FALSE;
  Error := FALSE;
  ErrorID := 0;
ELSIF active THEN
  IF IW66 = mySeq THEN seen := TRUE; END_IF;
  IF IW66 <> mySeq AND (seen OR IW66 > mySeq) THEN
    active := FALSE;          // napęd przyjął nowsze polecenie
    CommandAborted := TRUE;
  ELSIF seen AND (I65.2 OR I64.2) THEN
    active := FALSE;          // polecenie odrzucone albo oś w ErrorStop
    Error := TRUE;
    ErrorID := IW68;
  ELSIF seen AND I64.5 THEN
    active := FALSE;
    Done := TRUE;
  END_IF;
END_IF;
Busy := active;
END_FUNCTION_BLOCK

FUNCTION_BLOCK MC_MoveRelative
(* Ruch o Distance [mm] od bieżącej pozycji. *)
VAR_INPUT
  Execute : BOOL;
  Distance : REAL;
  Velocity : REAL;
  Acceleration : REAL;
END_VAR
VAR_OUTPUT
  Done : BOOL;
  Busy : BOOL;
  CommandAborted : BOOL;
  Error : BOOL;
  ErrorID : INT;
END_VAR
VAR
  edge : R_TRIG;
  mySeq : INT;
  active : BOOL;
  seen : BOOL;
END_VAR
// wyjścia gasną po zdjęciu Execute (wynik widać jeszcze przez jeden cykl)
IF NOT Execute AND NOT active THEN
  Done := FALSE;
  CommandAborted := FALSE;
  Error := FALSE;
  ErrorID := 0;
END_IF;
edge(CLK := Execute);
IF edge.Q THEN
  QD70 := REAL_TO_DINT(Distance * 1000.0);
  QD74 := REAL_TO_DINT(Velocity * 1000.0);
  QD78 := REAL_TO_DINT(Acceleration * 1000.0);
  QW66 := 3;
  QW68 := QW68 + 1;           // nowy numer sekwencji = nowe polecenie dla napędu
  mySeq := QW68;
  active := TRUE;
  seen := FALSE;
  Done := FALSE;
  CommandAborted := FALSE;
  Error := FALSE;
  ErrorID := 0;
ELSIF active THEN
  IF IW66 = mySeq THEN seen := TRUE; END_IF;
  IF IW66 <> mySeq AND (seen OR IW66 > mySeq) THEN
    active := FALSE;          // napęd przyjął nowsze polecenie
    CommandAborted := TRUE;
  ELSIF seen AND (I65.2 OR I64.2) THEN
    active := FALSE;          // polecenie odrzucone albo oś w ErrorStop
    Error := TRUE;
    ErrorID := IW68;
  ELSIF seen AND I64.5 THEN
    active := FALSE;
    Done := TRUE;
  END_IF;
END_IF;
Busy := active;
END_FUNCTION_BLOCK

FUNCTION_BLOCK MC_MoveVelocity
(* Ruch ciągły z prędkością Velocity [mm/s] (ze znakiem). InVelocity = prędkość osiągnięta. *)
VAR_INPUT
  Execute : BOOL;
  Velocity : REAL;
  Acceleration : REAL;
END_VAR
VAR_OUTPUT
  InVelocity : BOOL;
  Busy : BOOL;
  CommandAborted : BOOL;
  Error : BOOL;
  ErrorID : INT;
END_VAR
VAR
  edge : R_TRIG;
  mySeq : INT;
  active : BOOL;
  seen : BOOL;
END_VAR
// wyjścia gasną po zdjęciu Execute (wynik widać jeszcze przez jeden cykl)
IF NOT Execute AND NOT active THEN
  InVelocity := FALSE;
  CommandAborted := FALSE;
  Error := FALSE;
  ErrorID := 0;
END_IF;
edge(CLK := Execute);
IF edge.Q THEN
  QD74 := REAL_TO_DINT(Velocity * 1000.0);
  QD78 := REAL_TO_DINT(Acceleration * 1000.0);
  QW66 := 4;
  QW68 := QW68 + 1;           // nowy numer sekwencji = nowe polecenie dla napędu
  mySeq := QW68;
  active := TRUE;
  seen := FALSE;
  InVelocity := FALSE;
  CommandAborted := FALSE;
  Error := FALSE;
  ErrorID := 0;
ELSIF active THEN
  IF IW66 = mySeq THEN seen := TRUE; END_IF;
  IF IW66 <> mySeq AND (seen OR IW66 > mySeq) THEN
    active := FALSE;          // napęd przyjął nowsze polecenie
    CommandAborted := TRUE;
  ELSIF seen AND (I65.2 OR I64.2) THEN
    active := FALSE;          // polecenie odrzucone albo oś w ErrorStop
    Error := TRUE;
    ErrorID := IW68;
  ELSIF seen AND I64.4 THEN
    active := FALSE;
    InVelocity := TRUE;
  END_IF;
END_IF;
Busy := active;
END_FUNCTION_BLOCK

FUNCTION_BLOCK MC_Stop
(* Zatrzymanie z opóźnieniem Deceleration [mm/s²]. Przerywa każdy ruch. *)
VAR_INPUT
  Execute : BOOL;
  Deceleration : REAL;
END_VAR
VAR_OUTPUT
  Done : BOOL;
  Busy : BOOL;
  CommandAborted : BOOL;
  Error : BOOL;
  ErrorID : INT;
END_VAR
VAR
  edge : R_TRIG;
  mySeq : INT;
  active : BOOL;
  seen : BOOL;
END_VAR
// wyjścia gasną po zdjęciu Execute (wynik widać jeszcze przez jeden cykl)
IF NOT Execute AND NOT active THEN
  Done := FALSE;
  CommandAborted := FALSE;
  Error := FALSE;
  ErrorID := 0;
END_IF;
edge(CLK := Execute);
IF edge.Q THEN
  QD78 := REAL_TO_DINT(Deceleration * 1000.0);
  QW66 := 5;
  QW68 := QW68 + 1;           // nowy numer sekwencji = nowe polecenie dla napędu
  mySeq := QW68;
  active := TRUE;
  seen := FALSE;
  Done := FALSE;
  CommandAborted := FALSE;
  Error := FALSE;
  ErrorID := 0;
ELSIF active THEN
  IF IW66 = mySeq THEN seen := TRUE; END_IF;
  IF IW66 <> mySeq AND (seen OR IW66 > mySeq) THEN
    active := FALSE;          // napęd przyjął nowsze polecenie
    CommandAborted := TRUE;
  ELSIF seen AND (I65.2 OR I64.2) THEN
    active := FALSE;          // polecenie odrzucone albo oś w ErrorStop
    Error := TRUE;
    ErrorID := IW68;
  ELSIF seen AND I64.5 THEN
    active := FALSE;
    Done := TRUE;
  END_IF;
END_IF;
Busy := active;
END_FUNCTION_BLOCK
`;

export interface BlockPin {
	name: string;
	type: string;
	/** default value from the declaration, shown as a placeholder */
	init: string | null;
}

export interface BlockInfo {
	name: string;
	inputs: BlockPin[];
	outputs: BlockPin[];
	standard: boolean;
	comment: string | null;
}

/** The function blocks a ladder (or ST) program can use: the standard ones and the user's. */
export function blockCatalog(library: string): BlockInfo[] {
	const describe = (src: string, standard: boolean): BlockInfo[] => {
		const { program } = parse(src);
		return (program.pous ?? [])
			.filter((p) => p.kind === 'fb')
			.map((p) => {
				const pin = (d: {
					name: string;
					type: string;
					init: { from: number; to: number } | null;
				}) => ({
					name: d.name,
					type: d.type,
					init: d.init ? src.slice(d.init.from, d.init.to) : null
				});
				const after = src.slice(p.to, p.to + 200);
				const comment = /^\s*\(\*\s*([^*]+?)\s*\*\)/.exec(after)?.[1] ?? null;
				return {
					name: p.name,
					inputs: p.inputs.map(pin),
					outputs: p.outputs.map(pin),
					standard,
					comment
				};
			});
	};
	return [...describe(STDLIB, true), ...describe(library, false)];
}
