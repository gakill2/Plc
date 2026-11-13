import { updateCtd, updateCtu, updateCtud } from './counters.js';
import type { Program } from './ir.js';
import { MemoryError, type Memory } from './memory.js';
import { updateTof, updateTon, updateTp } from './timers.js';
import type { CmpOp, MathFn, Operand } from './types.js';

export const DEFAULT_MAX_STEPS = 100_000;
const MAX_STACK = 1024;

/** A runtime error that stops the PLC (like the red SF LED on a real CPU). */
export class PlcFault extends Error {
	override name = 'PlcFault';
	readonly pc: number;

	constructor(message: string, pc: number) {
		super(message);
		this.pc = pc;
	}
}

/** VM state that survives between scans (edge memory keyed by instruction index). */
export class VmState {
	readonly edges = new Map<number, boolean>();
	/** Probe values recorded by TAP — read by the UI to show power flow. */
	readonly taps: Uint8Array;

	constructor(tapCount = 0) {
		this.taps = new Uint8Array(tapCount);
	}
}

function compare(cmp: CmpOp, a: number, b: number): boolean {
	switch (cmp) {
		case '==':
			return a === b;
		case '<>':
			return a !== b;
		case '<':
			return a < b;
		case '>':
			return a > b;
		case '<=':
			return a <= b;
		case '>=':
			return a >= b;
	}
}

/** Returns null when the operation is undefined (division by zero). */
function math(fn: MathFn, a: number, b: number): number | null {
	switch (fn) {
		case 'ADD':
			return a + b;
		case 'SUB':
			return a - b;
		case 'MUL':
			return a * b;
		case 'DIV':
			return b === 0 ? null : a / b;
		case 'MOD':
			return b === 0 ? null : a % b;
	}
}

/**
 * Executes one pass of the program over memory. Returns the number of executed instructions.
 * Throws PlcFault on runtime errors (stack underflow, watchdog, bad memory access).
 */
export function execute(
	program: Program,
	mem: Memory,
	state: VmState,
	dtMs: number,
	maxSteps = DEFAULT_MAX_STEPS
): number {
	const stack: boolean[] = [];
	let pc = 0;
	let steps = 0;

	const push = (v: boolean) => {
		if (stack.length >= MAX_STACK) throw new PlcFault('Logic stack overflow', pc);
		stack.push(v);
	};
	const pop = (): boolean => {
		const v = stack.pop();
		if (v === undefined) throw new PlcFault('Logic stack underflow', pc);
		return v;
	};
	const peek = (): boolean => {
		if (stack.length === 0) throw new PlcFault('Logic stack underflow', pc);
		return stack[stack.length - 1];
	};
	const value = (o: Operand): number =>
		o.kind === 'const' ? o.value : mem.readNumber(o.addr, o.type);

	try {
		while (pc < program.length) {
			if (++steps > maxSteps) {
				throw new PlcFault(`Watchdog: more than ${maxSteps} instructions in one scan`, pc);
			}
			const ins = program[pc];
			let next = pc + 1;

			switch (ins.op) {
				case 'LD':
					push(mem.readBit(ins.addr));
					break;
				case 'LDN':
					push(!mem.readBit(ins.addr));
					break;
				case 'LDC':
					push(ins.value);
					break;
				case 'AND':
				case 'OR':
				case 'XOR':
				case 'ANDN':
				case 'ORN': {
					let b = ins.addr ? mem.readBit(ins.addr) : pop();
					if (ins.op === 'ANDN' || ins.op === 'ORN') b = !b;
					const a = pop();
					push(
						ins.op === 'AND' || ins.op === 'ANDN' ? a && b : ins.op === 'XOR' ? a !== b : a || b
					);
					break;
				}
				case 'NOT':
					push(!pop());
					break;
				case 'POP':
					pop();
					break;
				case 'EDGE_P': {
					const x = pop();
					const prev = state.edges.get(pc) ?? false;
					state.edges.set(pc, x);
					push(x && !prev);
					break;
				}
				case 'EDGE_N': {
					const x = pop();
					const prev = state.edges.get(pc) ?? false;
					state.edges.set(pc, x);
					push(!x && prev);
					break;
				}
				case 'ST':
					mem.writeBit(ins.addr, peek());
					break;
				case 'STN':
					mem.writeBit(ins.addr, !peek());
					break;
				case 'S':
					if (peek()) mem.writeBit(ins.addr, true);
					break;
				case 'R':
					if (peek()) mem.writeBit(ins.addr, false);
					break;
				case 'CMP':
					push(compare(ins.cmp, value(ins.a), value(ins.b)));
					break;
				case 'TON':
				case 'TOF':
				case 'TP': {
					const update = ins.op === 'TON' ? updateTon : ins.op === 'TOF' ? updateTof : updateTp;
					push(update(mem.timer(ins.timer), pop(), value(ins.pt), dtMs));
					break;
				}
				case 'CTU': {
					const r = pop();
					push(updateCtu(mem.counter(ins.counter), pop(), r, value(ins.pv)));
					break;
				}
				case 'CTD': {
					const ld = pop();
					push(updateCtd(mem.counter(ins.counter), pop(), ld, value(ins.pv)));
					break;
				}
				case 'CTUD': {
					const ld = pop();
					const r = pop();
					const cd = pop();
					const cu = pop();
					push(updateCtud(mem.counter(ins.counter), cu, cd, r, ld, value(ins.pv)));
					break;
				}
				case 'MOVE':
					if (peek()) mem.writeNumber(ins.dst.addr, value(ins.src), ins.dst.type);
					break;
				case 'MATH':
					if (peek()) {
						const result = math(ins.fn, value(ins.a), value(ins.b));
						if (result === null) {
							pop();
							push(false);
						} else {
							mem.writeNumber(ins.dst.addr, result, ins.dst.type);
						}
					}
					break;
				case 'JMP':
					next = ins.target;
					break;
				case 'JMPC':
					if (pop()) next = ins.target;
					break;
				case 'JMPCN':
					if (!pop()) next = ins.target;
					break;
				case 'TAP':
					if (ins.slot >= state.taps.length)
						throw new PlcFault(`Probe ${ins.slot} out of range`, pc);
					state.taps[ins.slot] = peek() ? 1 : 0;
					break;
				case 'LDT':
					if (ins.slot >= state.taps.length)
						throw new PlcFault(`Probe ${ins.slot} out of range`, pc);
					push(state.taps[ins.slot] === 1);
					break;
			}

			pc = next;
		}
	} catch (e) {
		if (e instanceof MemoryError) throw new PlcFault(e.message, pc);
		throw e;
	}

	return steps;
}
