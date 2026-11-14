/** The Structured Text version of the demo project (same circuit and symbols as the ladder demo). */
export const DEMO_ST = `(* Same behaviour as the ladder demo, written in Structured Text.
   Start / Stop / ResetCount / Motor / Running / Service come from the symbol table. *)
VAR
  runDelay  : TON;       // "running" lamp delay
  starts    : CTU;       // counts motor starts
  startEdge : R_TRIG;
END_VAR

// self-holding: Start sets, Stop (wired NO) breaks
Motor := (Start OR Motor) AND NOT Stop;

runDelay(IN := Motor, PT := T#3s);
Running := runDelay.Q;

startEdge(CLK := Start);
starts(CU := startEdge.Q, R := ResetCount, PV := 5);
Service := starts.Q;
`;

/** Starting point when switching an empty project to ST. */
export const EMPTY_ST = `VAR
  // name : BOOL | INT | DINT | REAL | TIME | TON | TOF | TP | CTU | CTD | R_TRIG | F_TRIG;
END_VAR

`;
