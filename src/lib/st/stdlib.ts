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
