import type { Address, AddrOperand, CmpOp, MathFn, Operand } from './types.js';

/**
 * Intermediate representation executed by the VM — a small stack machine in the spirit of
 * Instruction List (IL / STL). Both Ladder and Structured Text compile to this.
 *
 * The VM keeps a stack of booleans (the RLO — result of logic operation — is the top).
 *
 * | Instruction            | Stack effect                         | Notes                                   |
 * |------------------------|--------------------------------------|-----------------------------------------|
 * | LD a / LDN a           | → x                                  | push bit / negated bit                  |
 * | LDC v                  | → v                                  | push constant (power rail = LDC 1)      |
 * | AND / OR / XOR         | a b → (a op b)                       |                                         |
 * | ANDN / ORN             | a b → (a op !b)                      |                                         |
 * | AND a / OR a / …       | x → (x op bit a)                     | IL form with an address operand         |
 * | NOT                    | a → !a                               |                                         |
 * | EDGE_P / EDGE_N        | x → edge                             | true for one scan on rising / falling   |
 * | ST / STN / S / R a     | x → x                                | peek: assign / assign negated / set / reset |
 * | POP                    | x →                                  | end of a rung                           |
 * | CMP a b                | → (a cmp b)                          | numeric compare                         |
 * | TON / TOF / TP Tn pt   | in → q                               | IEC timers                              |
 * | CTU Cn pv              | cu r → q                             | R on top                                |
 * | CTD Cn pv              | cd ld → q                            | LD on top                               |
 * | CTUD Cn pv             | cu cd r ld → qu                      | LD on top                               |
 * | MOVE src dst           | en → eno                             | executes only when EN is true           |
 * | MATH fn a b dst        | en → eno                             | ENO = false on division by zero         |
 * | JMP t                  | –                                    | unconditional jump to instruction t     |
 * | JMPC / JMPCN t         | c →                                  | jump if c is true / false               |
 * | ERR "text"             | –                                    | programming error (e.g. index out of range) |
 *
 * Probes (used by graphical editors for live power flow):
 *
 * | TAP n                  | x → x                                | record the RLO in probe slot n          |
 * | LDT n                  | → probe n                            | reload a probe recorded earlier in this scan |
 */
export type Instr =
	| { op: 'LD' | 'LDN'; addr: Address }
	| { op: 'LDC'; value: boolean }
	| { op: 'AND' | 'OR' | 'XOR' | 'ANDN' | 'ORN'; addr?: Address }
	| { op: 'NOT' | 'POP' | 'EDGE_P' | 'EDGE_N' }
	| { op: 'ST' | 'STN' | 'S' | 'R'; addr: Address }
	| { op: 'CMP'; cmp: CmpOp; a: Operand; b: Operand }
	| { op: 'TON' | 'TOF' | 'TP'; timer: number; pt: Operand }
	| { op: 'CTU' | 'CTD' | 'CTUD'; counter: number; pv: Operand }
	| { op: 'MOVE'; src: Operand; dst: AddrOperand }
	| { op: 'MATH'; fn: MathFn; a: Operand; b: Operand; dst: AddrOperand }
	| { op: 'JMP' | 'JMPC' | 'JMPCN'; target: number }
	| { op: 'TAP' | 'LDT'; slot: number }
	| { op: 'ERR'; message: string };

export type Program = readonly Instr[];
