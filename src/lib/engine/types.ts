/** Memory areas that are addressed by byte (and bit). */
export type ByteArea = 'I' | 'Q' | 'M';

/** Access width: bit (X), byte (B), word (W, 16 bit), double word (D, 32 bit). */
export type Size = 'X' | 'B' | 'W' | 'D';

/** I0.0, QB1, MW10, MD4 … — `bit` is only meaningful when `size` is 'X'. */
export type MemAddress = { area: ByteArea; size: Size; byte: number; bit: number };

/** T0 … Tn — reads as Q (bit) or ET in ms (number). */
export type TimerAddress = { area: 'T'; index: number };

/** C0 … Cn — reads as Q (bit) or CV (number). */
export type CounterAddress = { area: 'C'; index: number };

export type Address = MemAddress | TimerAddress | CounterAddress;

/** How a numeric address is interpreted. Defaults: B → BYTE, W → INT, D → DINT. */
export type NumType = 'BYTE' | 'INT' | 'DINT' | 'REAL';

export type ConstOperand = { kind: 'const'; value: number };
export type AddrOperand = { kind: 'addr'; addr: Address; type?: NumType };
export type Operand = ConstOperand | AddrOperand;

export type CmpOp = '==' | '<>' | '<' | '>' | '<=' | '>=';
/**
 * Numeric operations of the MATH instruction. Binary: a fn b. Unary (see UNARY_MATH): fn a, b unused.
 * W-prefixed functions are bitwise (on the two's-complement integer value).
 */
export type MathFn =
	| 'ADD'
	| 'SUB'
	| 'MUL'
	| 'DIV'
	| 'MOD'
	| 'MIN'
	| 'MAX'
	| 'WAND'
	| 'WOR'
	| 'WXOR'
	| 'SHL'
	| 'SHR'
	| 'ABS'
	| 'NEG'
	| 'WNOT'
	| 'TRUNC'
	| 'ROUND';

export const UNARY_MATH: readonly MathFn[] = ['ABS', 'NEG', 'WNOT', 'TRUNC', 'ROUND'];
export const BINARY_MATH: readonly MathFn[] = [
	'ADD',
	'SUB',
	'MUL',
	'DIV',
	'MOD',
	'MIN',
	'MAX',
	'WAND',
	'WOR',
	'WXOR',
	'SHL',
	'SHR'
];
