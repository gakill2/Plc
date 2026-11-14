import { formatAddress } from './address.js';
import { disassemble } from './assembler.js';
import type { Instr, Program } from './ir.js';
import {
	DEFAULT_MEMORY_CONFIG,
	Memory,
	type MemoryConfig,
	type CounterState,
	type TimerState
} from './memory.js';
import type { Address, Operand } from './types.js';
import { execute, PlcFault, VmState } from './vm.js';

/*
 * The scan-cycle debugger: runs ONE scan of a program on a copy of the PLC's memory and records
 * every instruction — the logic stack before and after, the values it read and what it changed.
 * The real PLC is not touched.
 */

export interface MemoryImage {
	/** Input terminals — copied into the I image at the start of the scan, like a real CPU. */
	inputs: Uint8Array;
	Q: Uint8Array;
	M: Uint8Array;
	timers: TimerState[];
	counters: CounterState[];
}

export interface Frame {
	pc: number;
	/** IL text, e.g. "LD I0.0". */
	text: string;
	next: number;
	before: boolean[];
	after: boolean[];
	/** Operand values read by this instruction, e.g. [["I0.0", "1"]]. */
	reads: [string, string][];
	/** Memory changed by this instruction. */
	changes: { address: string; before: string; after: string }[];
}

export interface ScanTrace {
	frames: Frame[];
	/** Set when the scan stopped with a fault (watchdog, stack error …). */
	fault: string | null;
	/** Outputs that changed from the start to the end of the scan. */
	outputs: { address: string; before: string; after: string }[];
	truncated: boolean;
}

const MAX_FRAMES = 5000;

export function traceScan(
	program: Program,
	image: MemoryImage | null,
	dtMs: number,
	config: MemoryConfig = DEFAULT_MEMORY_CONFIG
): ScanTrace {
	const mem = new Memory(config);
	if (image) {
		mem.I.set(image.inputs.subarray(0, mem.I.length));
		mem.Q.set(image.Q.subarray(0, mem.Q.length));
		mem.M.set(image.M.subarray(0, mem.M.length));
		image.timers.forEach((t, i) => i < mem.timers.length && Object.assign(mem.timers[i], t));
		image.counters.forEach((c, i) => i < mem.counters.length && Object.assign(mem.counters[i], c));
	}
	const qBefore = mem.Q.slice();
	const taps = program.reduce((n, i) => (i.op === 'TAP' ? Math.max(n, i.slot + 1) : n), 0);
	const state = new VmState(taps);
	const text = disassemble(program);

	const frames: Frame[] = [];
	let pending: { before: boolean[]; watched: [string, string][] } | null = null;
	let truncated = false;

	const fmtBit = (a: Address) => (mem.readBit(a) ? '1' : '0');
	const fmtNum = (o: Operand) =>
		o.kind === 'const' ? String(o.value) : formatNumber(mem.readNumber(o.addr, o.type));
	/** The memory an instruction may change, read before and after it runs. */
	const watched = (ins: Instr): [string, string][] => {
		switch (ins.op) {
			case 'ST':
			case 'STN':
			case 'S':
			case 'R':
				return [[formatAddress(ins.addr), fmtBit(ins.addr)]];
			case 'MOVE':
			case 'MATH':
				return [[formatAddress(ins.dst.addr), fmtNum(ins.dst)]];
			case 'TON':
			case 'TOF':
			case 'TP':
				return [[`T${ins.timer}`, timerText(mem.timers[ins.timer])]];
			case 'CTU':
			case 'CTD':
			case 'CTUD':
				return [[`C${ins.counter}`, counterText(mem.counters[ins.counter])]];
			default:
				return [];
		}
	};
	const reread = (ins: Instr, key: string): string => {
		switch (ins.op) {
			case 'ST':
			case 'STN':
			case 'S':
			case 'R':
				return fmtBit(ins.addr);
			case 'MOVE':
			case 'MATH':
				return fmtNum(ins.dst);
			case 'TON':
			case 'TOF':
			case 'TP':
				return timerText(mem.timers[ins.timer]);
			case 'CTU':
			case 'CTD':
			case 'CTUD':
				return counterText(mem.counters[ins.counter]);
			default:
				return key;
		}
	};
	const reads = (ins: Instr): [string, string][] => {
		const num = (o: Operand): [string, string][] =>
			o.kind === 'addr' ? [[formatAddress(o.addr), fmtNum(o)]] : [];
		switch (ins.op) {
			case 'LD':
			case 'LDN':
				return [[formatAddress(ins.addr), fmtBit(ins.addr)]];
			case 'AND':
			case 'OR':
			case 'XOR':
			case 'ANDN':
			case 'ORN':
				return ins.addr ? [[formatAddress(ins.addr), fmtBit(ins.addr)]] : [];
			case 'CMP':
				return [...num(ins.a), ...num(ins.b)];
			case 'MOVE':
				return num(ins.src);
			case 'MATH':
				return [...num(ins.a), ...num(ins.b)];
			case 'TON':
			case 'TOF':
			case 'TP':
				return num(ins.pt);
			case 'CTU':
			case 'CTD':
			case 'CTUD':
				return num(ins.pv);
			default:
				return [];
		}
	};

	let fault: string | null = null;
	try {
		execute(program, mem, state, dtMs, undefined, {
			before(pc, stack) {
				pending = { before: [...stack], watched: watched(program[pc]) };
			},
			after(pc, next, stack) {
				if (frames.length >= MAX_FRAMES) {
					truncated = true;
					return;
				}
				const ins = program[pc];
				const p = pending!;
				frames.push({
					pc,
					text: text[pc],
					next,
					before: p.before,
					after: [...stack],
					reads: reads(ins),
					changes: p.watched
						.map(([address, before]) => ({ address, before, after: reread(ins, before) }))
						.filter((c) => c.before !== c.after)
				});
			}
		});
	} catch (e) {
		if (!(e instanceof PlcFault)) throw e;
		fault = e.message;
	}

	const outputs: ScanTrace['outputs'] = [];
	for (let byte = 0; byte < mem.Q.length; byte++) {
		for (let bit = 0; bit < 8; bit++) {
			const b = (qBefore[byte] >> bit) & 1;
			const a = (mem.Q[byte] >> bit) & 1;
			if (a !== b)
				outputs.push({ address: `Q${byte}.${bit}`, before: String(b), after: String(a) });
		}
	}
	return { frames, fault, outputs, truncated };
}

const formatNumber = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(3));
const timerText = (t: TimerState) => `IN=${t.in ? 1 : 0} Q=${t.q ? 1 : 0} ET=${t.et}ms`;
const counterText = (c: CounterState) => `Q=${c.q ? 1 : 0} CV=${c.cv}`;

/* ---------- plain-language description (Polish) ---------- */

const b = (v: boolean | undefined) => (v ? '1' : '0');

/**
 * What an instruction did, in words. `name` turns an address into "Start (I0.0)".
 */
export function describeFrame(
	f: Frame,
	ins: Instr,
	name: (address: string) => string = (a) => a
): string {
	const top = f.after[f.after.length - 1];
	const prevTop = f.before[f.before.length - 1];
	const read = (i = 0) => (f.reads[i] ? `${name(f.reads[i][0])} = ${f.reads[i][1]}` : '');
	const change = f.changes[0];
	switch (ins.op) {
		case 'LD':
			return `Wczytaj ${read()} na stos (nowy wynik logiczny RLO = ${b(top)}).`;
		case 'LDN':
			return `Wczytaj zanegowany bit: ${read()}, więc na stos idzie ${b(top)}.`;
		case 'LDC':
			return ins.value
				? 'Wstaw 1 na stos — zasilanie z lewej szyny (początek networku).'
				: 'Wstaw 0 na stos.';
		case 'AND':
		case 'ANDN':
		case 'OR':
		case 'ORN':
		case 'XOR': {
			const neg = ins.op === 'ANDN' || ins.op === 'ORN' ? ' (zanegowany)' : '';
			const op = ins.op === 'ANDN' ? 'AND' : ins.op === 'ORN' ? 'OR' : ins.op;
			if (ins.addr) return `${op}: RLO ${b(prevTop)} ${op} ${read()}${neg} → ${b(top)}.`;
			const x = f.before[f.before.length - 2];
			return `${op} dwóch wartości ze stosu: ${b(x)} ${op} ${b(prevTop)}${neg} → ${b(top)} (połączenie gałęzi).`;
		}
		case 'NOT':
			return `Zaneguj RLO: ${b(prevTop)} → ${b(top)}.`;
		case 'EDGE_P':
			return `Zbocze narastające: ${top ? 'jest (0→1) — 1 przez ten jeden cykl' : 'brak'} → ${b(top)}.`;
		case 'EDGE_N':
			return `Zbocze opadające: ${top ? 'jest (1→0) — 1 przez ten jeden cykl' : 'brak'} → ${b(top)}.`;
		case 'ST':
			return `Zapisz RLO = ${b(top)} do ${name(formatAddress(ins.addr))}${changed(change)}.`;
		case 'STN':
			return `Zapisz zanegowane RLO (${b(!top)}) do ${name(formatAddress(ins.addr))}${changed(change)}.`;
		case 'S':
			return top
				? `RLO = 1, więc SET: ${name(formatAddress(ins.addr))} = 1${changed(change)}.`
				: `RLO = 0, więc SET nic nie robi — ${name(formatAddress(ins.addr))} zostaje bez zmian.`;
		case 'R':
			return top
				? `RLO = 1, więc RESET: ${name(formatAddress(ins.addr))} = 0${changed(change)}.`
				: `RLO = 0, więc RESET nic nie robi — ${name(formatAddress(ins.addr))} zostaje bez zmian.`;
		case 'POP':
			return 'Koniec networku: zdejmij wynik ze stosu.';
		case 'CMP':
			return `Porównaj: ${f.reads.map(([a, v]) => `${name(a)} = ${v}`).join(', ') || 'stałe'} → ${b(top)}.`;
		case 'TON':
		case 'TOF':
		case 'TP':
			return `Timer ${ins.op} T${ins.timer}: wejście IN = ${b(prevTop)}${change ? `, ${change.before} → ${change.after}` : ''}; wyjście Q = ${b(top)} idzie dalej.`;
		case 'CTU':
		case 'CTD':
		case 'CTUD':
			return `Licznik ${ins.op} C${ins.counter}${change ? `: ${change.before} → ${change.after}` : ' bez zmian'}; Q = ${b(top)}.`;
		case 'MOVE':
			return prevTop
				? `EN = 1, więc MOVE: ${name(formatAddress(ins.dst.addr))} := ${read() || formatOperand(ins.src)}${changed(change)}.`
				: 'EN = 0 — MOVE nie wykonuje się.';
		case 'MATH':
			return prevTop
				? `EN = 1, więc ${ins.fn}: wynik do ${name(formatAddress(ins.dst.addr))}${changed(change)}${top ? '' : ' — błąd (ENO = 0)'}.`
				: `EN = 0 — ${ins.fn} nie wykonuje się.`;
		case 'JMP':
			return `Skok do instrukcji ${ins.target}.`;
		case 'JMPC':
			return `Skok do ${ins.target}, jeśli warunek = 1: ${b(prevTop)} → ${f.next === ins.target ? 'skacze' : 'idzie dalej'}.`;
		case 'JMPCN':
			return `Skok do ${ins.target}, jeśli warunek = 0: ${b(prevTop)} → ${f.next === ins.target ? 'skacze' : 'idzie dalej'}.`;
		case 'TAP':
			return 'Sonda: zapamiętaj RLO, żeby edytor pokazał przepływ zasilania (nic nie zmienia).';
		case 'LDT':
			return 'Wczytaj zapamiętaną sondę — zasilanie z punktu rozgałęzienia.';
		case 'ERR':
			return `Błąd programowania: ${ins.message} — wywołanie OB121 albo STOP CPU.`;
	}
}

const changed = (c: { before: string; after: string } | undefined) =>
	c ? ` (było ${c.before}, jest ${c.after})` : ' (bez zmian)';
const formatOperand = (o: Operand) =>
	o.kind === 'const' ? String(o.value) : formatAddress(o.addr);
