import type { CmpOp, MathFn } from '#lib/engine/index.js';

/*
 * Ladder program model.
 *
 * A rung is a series of elements from the left rail to its coils. Parallel branches are nested
 * series, so the whole rung is a series–parallel tree. This is easy to evaluate and compile,
 * while the editor still draws it as a classic ladder diagram.
 *
 * Operands are kept as text (exactly what the user typed) and parsed by the compiler, so an
 * invalid operand is a diagnostic, not a broken document.
 */

export type ContactType = 'NO' | 'NC' | 'P' | 'N';
export type CoilType = 'COIL' | 'NCOIL' | 'SET' | 'RESET';
export type TimerType = 'TON' | 'TOF' | 'TP';
export type CounterType = 'CTU' | 'CTD';

export interface Contact {
	id: string;
	kind: 'contact';
	type: ContactType;
	operand: string;
}

export interface Compare {
	id: string;
	kind: 'compare';
	cmp: CmpOp;
	a: string;
	b: string;
}

export interface TimerBox {
	id: string;
	kind: 'timer';
	type: TimerType;
	timer: string;
	pt: string;
}

/** `reset` is the R input of CTU / the LD input of CTD; empty = not connected. */
export interface CounterBox {
	id: string;
	kind: 'counter';
	type: CounterType;
	counter: string;
	pv: string;
	reset: string;
}

export interface Parallel {
	id: string;
	kind: 'parallel';
	branches: Series[];
}

export interface Series {
	id: string;
	kind: 'series';
	items: Element[];
}

/** MOVE: copies IN to OUT while the box is powered (EN). */
export interface MoveBox {
	id: string;
	kind: 'move';
	src: string;
	dst: string;
}

/** ADD / SUB / MUL / DIV / MOD: OUT := IN1 fn IN2 while powered. ENO is 0 on division by zero. */
export interface MathBox {
	id: string;
	kind: 'math';
	fn: MathFn;
	a: string;
	b: string;
	dst: string;
}

/**
 * A function block from the library (SCALE, PID, or the user's own): an instance with input and
 * output pins wired to operands. It runs while powered (EN); ENO follows EN.
 */
export interface BlockBox {
	id: string;
	kind: 'block';
	/** function block type, e.g. PID */
	type: string;
	/** instance name — each instance has its own memory */
	instance: string;
	/** pin name → operand (empty = not connected / default) */
	pins: Record<string, string>;
}

export type Element =
	Contact | Compare | TimerBox | CounterBox | MoveBox | MathBox | BlockBox | Parallel;

export interface Coil {
	id: string;
	kind: 'coil';
	type: CoilType;
	operand: string;
}

export interface Rung {
	id: string;
	kind: 'rung';
	comment: string;
	logic: Series;
	coils: Coil[];
}

export interface LadderProgram {
	version: 1;
	rungs: Rung[];
}

export type Node = Element | Coil | Series | Rung;

let counter = 0;

/** Short unique id, stable across saves. */
export function newId(prefix = 'n'): string {
	counter = (counter + 1) % 1_000_000;
	return `${prefix}${Date.now().toString(36)}${counter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export const series = (items: Element[] = []): Series => ({
	id: newId('s'),
	kind: 'series',
	items
});

export const contact = (type: ContactType = 'NO', operand = 'I0.0'): Contact => ({
	id: newId('e'),
	kind: 'contact',
	type,
	operand
});

export const moveBox = (src = '0', dst = 'MW0'): MoveBox => ({
	id: newId('e'),
	kind: 'move',
	src,
	dst
});

export const blockBox = (
	type: string,
	instance: string,
	pins: Record<string, string> = {}
): BlockBox => ({
	id: newId('e'),
	kind: 'block',
	type,
	instance,
	pins
});

export const mathBox = (fn: MathFn = 'ADD', a = 'MW0', b = '1', dst = 'MW0'): MathBox => ({
	id: newId('e'),
	kind: 'math',
	fn,
	a,
	b,
	dst
});

export const compare = (cmp: CmpOp = '>=', a = 'MW0', b = '0'): Compare => ({
	id: newId('e'),
	kind: 'compare',
	cmp,
	a,
	b
});

export const timer = (type: TimerType = 'TON', t = 'T0', pt = 'T#1s'): TimerBox => ({
	id: newId('e'),
	kind: 'timer',
	type,
	timer: t,
	pt
});

export const counterBox = (
	type: CounterType = 'CTU',
	c = 'C0',
	pv = '5',
	reset = ''
): CounterBox => ({
	id: newId('e'),
	kind: 'counter',
	type,
	counter: c,
	pv,
	reset
});

export const parallel = (branches: Element[][]): Parallel => ({
	id: newId('p'),
	kind: 'parallel',
	branches: branches.map((items) => series(items))
});

export const coil = (type: CoilType = 'COIL', operand = 'Q0.0'): Coil => ({
	id: newId('c'),
	kind: 'coil',
	type,
	operand
});

export const rung = (items: Element[] = [], coils: Coil[] = [coil()], comment = ''): Rung => ({
	id: newId('r'),
	kind: 'rung',
	comment,
	logic: series(items),
	coils
});
