import { formatAddress, parseAddress } from './address.js';
import type { Program } from './ir.js';
import {
	checkAddress,
	DEFAULT_MEMORY_CONFIG,
	Memory,
	type CounterState,
	type MemoryConfig,
	type TimerState
} from './memory.js';
import { validateProgram, type ProgramIssue } from './validate.js';
import { execute, PlcFault, VmState } from './vm.js';
import type { Address, MemAddress, NumType } from './types.js';

export type PlcMode = 'STOP' | 'RUN' | 'FAULT';

/** How a downloaded program is run, besides its instructions. */
export interface LoadOptions {
	/**
	 * Retentive memory: marker bytes [from, to) survive a new download / restart, as long as the
	 * retentive variables stay the same (`signature`).
	 */
	retain?: { from: number; to: number; signature: string };
	/** Cyclic interrupt (like OB30): the code at `entry` runs every `intervalMs`, besides the main scan. */
	cyclic?: { entry: number; intervalMs: number };
	/** Startup (OB100): runs once before the first cycle after a download or restart. */
	startup?: number;
	/** Programming error (OB121): runs when an instruction fails, e.g. an array index out of range. */
	programmingError?: number;
	/** Time error (OB80): runs when a cycle takes longer than the maximum cycle time. */
	timeError?: number;
}

/** One line of the diagnostic buffer, like in TIA Portal's "Diagnostics buffer". */
export interface DiagEntry {
	/** running number since the CPU was created */
	n: number;
	/** simulated time of the event, ms */
	timeMs: number;
	kind: 'info' | 'warning' | 'error';
	text: string;
}

/**
 * Simulated execution speed: about one microsecond per IR instruction (an older S7-300 class CPU
 * on mixed bit and word instructions), plus the operating system's share of every cycle.
 */
export const US_PER_INSTRUCTION = 1;
export const CYCLE_OVERHEAD_MS = 0.1;
/** Maximum cycle time (watchdog), like the CPU parameter in TIA Portal. */
export const MAX_CYCLE_MS = 150;
const DIAG_SIZE = 50;

export interface CycleStats {
	/** time between the start of the last two cycles: the minimum cycle time or longer */
	lastMs: number;
	minMs: number;
	maxMs: number;
	/** how long the program itself ran in the last cycle (instructions × speed) */
	execMs: number;
}

export class ProgramError extends Error {
	override name = 'ProgramError';
	readonly issues: ProgramIssue[];

	constructor(issues: ProgramIssue[]) {
		super(issues.map((i) => `#${i.pc}: ${i.message}`).join('\n'));
		this.issues = issues;
	}
}

/** Plain, structured-cloneable view of the PLC — what the UI receives from the worker. */
export interface PlcSnapshot {
	mode: PlcMode;
	scanCount: number;
	timeMs: number;
	lastScanSteps: number;
	cycle: CycleStats;
	/** the diagnostic buffer, oldest first */
	diagnostics: DiagEntry[];
	/** runs of the cyclic interrupt since the restart */
	cyclicCount: number;
	fault: { message: string; pc: number } | null;
	/** Physical input / output terminals. */
	inputs: Uint8Array;
	outputs: Uint8Array;
	/** Process images and markers as seen by the program. */
	I: Uint8Array;
	Q: Uint8Array;
	M: Uint8Array;
	timers: TimerState[];
	counters: CounterState[];
	/** Power-flow probe values (see TAP in ir.ts). */
	taps: Uint8Array;
	/** Active forces, e.g. `{ address: 'I0.0', value: true }`. */
	forces: { address: string; value: boolean }[];
}

/**
 * A simulated PLC CPU. Each call to `scan(dt)` performs one scan cycle:
 *
 * 1. copy physical inputs into the process image of inputs (I),
 * 2. execute the program once,
 * 3. copy the process image of outputs (Q) to the physical outputs.
 *
 * Time is supplied by the caller, which keeps the engine deterministic and testable.
 */
export class Plc {
	readonly config: MemoryConfig;
	readonly memory: Memory;
	/** Instructions that fit in the maximum cycle time. */
	maxStepsPerScan = Math.round((MAX_CYCLE_MS * 1000) / US_PER_INSTRUCTION);

	#program: Program = [];
	#tapCount = 0;
	#vm = new VmState();
	#inputs: Uint8Array;
	#outputs: Uint8Array;
	#mode: PlcMode = 'STOP';
	#scanCount = 0;
	#timeMs = 0;
	#lastScanSteps = 0;
	#fault: PlcFault | null = null;
	#forces = new Map<string, { addr: MemAddress; value: boolean }>();
	#options: LoadOptions = {};
	#cyclicDueMs = 0;
	#cyclicCount = 0;
	#cycle: CycleStats = { lastMs: 0, minMs: 0, maxMs: 0, execMs: 0 };
	#diag: DiagEntry[] = [];
	#diagCount = 0;

	constructor(config: Partial<MemoryConfig> = {}) {
		this.config = { ...DEFAULT_MEMORY_CONFIG, ...config };
		this.memory = new Memory(this.config);
		this.#inputs = new Uint8Array(this.config.inputBytes);
		this.#outputs = new Uint8Array(this.config.outputBytes);
	}

	get mode(): PlcMode {
		return this.#mode;
	}
	get scanCount(): number {
		return this.#scanCount;
	}
	get timeMs(): number {
		return this.#timeMs;
	}
	get fault(): PlcFault | null {
		return this.#fault;
	}
	get program(): Program {
		return this.#program;
	}

	/**
	 * Validates and downloads a program. Puts the CPU in STOP with cleared memory — except the
	 * retentive area, which is kept when the new program declares the same retentive variables.
	 */
	load(program: Program, options: LoadOptions = {}): void {
		const issues = validateProgram(program, this.config);
		const c = options.cyclic;
		if (c && (!(c.intervalMs > 0) || c.entry < 0 || c.entry > program.length))
			issues.push({ pc: c.entry, message: 'Invalid cyclic interrupt' });
		if (issues.length > 0) throw new ProgramError(issues);
		const r = options.retain;
		const keep =
			r && this.#options.retain?.signature === r.signature
				? this.memory.M.slice(r.from, r.to)
				: null;
		this.#options = options;
		this.#log(
			'info',
			`Program wgrany do CPU (${program.length} instrukcji)${keep ? ', dane RETAIN zachowane' : ''}`
		);
		this.#program = [...program];
		this.#tapCount = program.reduce(
			(max, ins) => (ins.op === 'TAP' || ins.op === 'LDT' ? Math.max(max, ins.slot + 1) : max),
			0
		);
		this.reset();
		if (keep && r) this.memory.M.set(keep, r.from);
	}

	/** How many times the cyclic interrupt has run since the last restart. */
	get cyclicCount(): number {
		return this.#cyclicCount;
	}

	/** Switches to RUN. Returns false when the CPU is in FAULT (call reset first). */
	run(): boolean {
		if (this.#mode === 'FAULT') return false;
		if (this.#mode !== 'RUN') this.#log('info', 'Zmiana trybu: STOP → RUN');
		this.#mode = 'RUN';
		return true;
	}

	/** The diagnostic buffer, oldest first. */
	get diagnostics(): DiagEntry[] {
		return this.#diag;
	}

	get cycle(): CycleStats {
		return this.#cycle;
	}

	#log(kind: DiagEntry['kind'], text: string) {
		this.#diag.push({ n: ++this.#diagCount, timeMs: this.#timeMs, kind, text });
		if (this.#diag.length > DIAG_SIZE) this.#diag.shift();
	}

	#halt(e: PlcFault, text: string) {
		this.#fault = e;
		this.#mode = 'FAULT';
		this.#outputs.fill(0);
		this.#log('error', text);
	}

	/** Switches to STOP. Outputs go off, memory is kept (warm restart on next run). */
	stop(): void {
		if (this.#mode === 'RUN') this.#log('info', 'Zmiana trybu: RUN → STOP');
		if (this.#mode !== 'FAULT') this.#mode = 'STOP';
		this.#outputs.fill(0);
	}

	/** Cold restart: clears memory, timers, counters, edge memory and any fault. Ends in STOP. */
	reset(): void {
		this.memory.reset();
		this.#vm = new VmState(this.#tapCount);
		this.#outputs.fill(0);
		this.#scanCount = 0;
		this.#timeMs = 0;
		this.#lastScanSteps = 0;
		this.#fault = null;
		this.#mode = 'STOP';
		this.#cyclicDueMs = this.#options.cyclic?.intervalMs ?? 0;
		this.#cyclicCount = 0;
		this.#cycle = { lastMs: 0, minMs: 0, maxMs: 0, execMs: 0 };
	}

	/** Sets a physical input terminal. The program sees it on the next scan. */
	setInput(address: string | Address, value: boolean): void {
		const addr = this.#terminal(address, 'I');
		const bit = 1 << addr.bit;
		if (value) this.#inputs[addr.byte] |= bit;
		else this.#inputs[addr.byte] &= ~bit;
	}

	/**
	 * Sets an input word / byte / double word from the field (e.g. an analog value, IW4).
	 * The program sees it on the next scan.
	 */
	setInputNumber(address: string | Address, value: number, type?: NumType): void {
		const addr = typeof address === 'string' ? parseAddress(address) : address;
		if (addr.area !== 'I' || addr.size === 'X') {
			throw new RangeError(`${formatAddress(addr)} is not an input byte or word (e.g. IW4)`);
		}
		checkAddress(addr, this.config);
		const view = new DataView(this.#inputs.buffer, this.#inputs.byteOffset);
		const int = Math.trunc(value);
		if (addr.size === 'B') view.setUint8(addr.byte, int);
		else if (addr.size === 'W') view.setInt16(addr.byte, int);
		else if (type === 'REAL') view.setFloat32(addr.byte, value);
		else view.setInt32(addr.byte, int);
	}

	getInput(address: string | Address): boolean {
		const addr = this.#terminal(address, 'I');
		return ((this.#inputs[addr.byte] >> addr.bit) & 1) === 1;
	}

	/** Reads a physical output terminal (updated at the end of each scan). */
	getOutput(address: string | Address): boolean {
		const addr = this.#terminal(address, 'Q');
		return ((this.#outputs[addr.byte] >> addr.bit) & 1) === 1;
	}

	/**
	 * Runs one scan cycle if the CPU is in RUN. `dtMs` is the minimum cycle time: when the previous
	 * cycle ran longer, this one starts later and its timers see the longer time — like a real CPU.
	 * Returns true when a scan was executed.
	 */
	scan(dtMs: number): boolean {
		if (!(dtMs >= 0) || !Number.isFinite(dtMs)) throw new RangeError(`Invalid scan time ${dtMs}`);
		if (this.#mode !== 'RUN') return false;

		const elapsed = Math.max(dtMs, this.#cycle.execMs);
		const o = this.#options;
		let steps = 0;
		let handling = false;
		const onError = (message: string, pc: number): boolean => {
			if (o.programmingError === undefined || handling) {
				this.#log(
					'error',
					`Błąd programowania: ${message} (instrukcja ${pc}) — brak OB121, CPU w STOP`
				);
				return false;
			}
			this.#log('warning', `Błąd programowania: ${message} (instrukcja ${pc}) — obsłużony w OB121`);
			handling = true;
			steps += this.#exec(0, o.programmingError);
			handling = false;
			return true;
		};
		const run = (dt: number, entry: number, limit = this.maxStepsPerScan) =>
			(steps += execute(
				this.#program,
				this.memory,
				this.#vm,
				dt,
				limit,
				undefined,
				entry,
				onError
			));

		this.memory.I.set(this.#inputs);
		this.#applyForces(true);
		try {
			if (this.#scanCount === 0 && o.startup !== undefined) {
				run(0, o.startup);
				this.#log('info', 'Rozruch: wykonano OB100');
			}
			// the cyclic interrupt interrupts the main program each time its interval elapses
			if (o.cyclic) {
				while (this.#timeMs + elapsed >= this.#cyclicDueMs) {
					run(o.cyclic.intervalMs, o.cyclic.entry);
					this.#cyclicDueMs += o.cyclic.intervalMs;
					this.#cyclicCount++;
				}
			}
			// the CPU stops when the cycle runs past twice the maximum cycle time
			const main = run(elapsed, 0, 2 * this.maxStepsPerScan);
			this.#lastScanSteps = main;
		} catch (e) {
			if (!(e instanceof PlcFault)) throw e;
			this.#halt(
				e,
				e.kind === 'watchdog'
					? `Przekroczony 2 × maksymalny czas cyklu (${2 * MAX_CYCLE_MS} ms) — CPU w STOP`
					: e.kind === 'program'
						? `CPU w STOP po błędzie programowania`
						: `Błąd CPU: ${e.message} — CPU w STOP`
			);
			return false;
		}

		const execMs = (steps * US_PER_INSTRUCTION) / 1000 + CYCLE_OVERHEAD_MS;
		if (steps > this.maxStepsPerScan) {
			const over = `Przekroczony maksymalny czas cyklu: ${execMs.toFixed(1)} ms > ${MAX_CYCLE_MS} ms`;
			if (o.timeError === undefined) {
				this.#halt(new PlcFault(over, 0, 'watchdog'), `${over} — brak OB80, CPU w STOP`);
				return false;
			}
			this.#log('warning', `${over} — obsłużony w OB80`);
			try {
				this.#exec(elapsed, o.timeError, onError);
			} catch (e) {
				if (!(e instanceof PlcFault)) throw e;
				this.#halt(e, `Błąd CPU w OB80: ${e.message} — CPU w STOP`);
				return false;
			}
		}

		this.#applyForces(false);
		this.#outputs.set(this.memory.Q);

		const c = this.#cycle;
		this.#cycle = {
			lastMs: elapsed,
			minMs: this.#scanCount === 0 ? elapsed : Math.min(c.minMs, elapsed),
			maxMs: Math.max(c.maxMs, elapsed),
			execMs
		};
		this.#scanCount++;
		this.#timeMs += elapsed;
		return true;
	}

	/** Runs one organisation block (an entry point of the program). */
	#exec(dt: number, entry: number, onError?: (message: string, pc: number) => boolean): number {
		return execute(
			this.#program,
			this.memory,
			this.#vm,
			dt,
			this.maxStepsPerScan,
			undefined,
			entry,
			onError
		);
	}

	snapshot(): PlcSnapshot {
		return {
			mode: this.#mode,
			scanCount: this.#scanCount,
			timeMs: this.#timeMs,
			lastScanSteps: this.#lastScanSteps,
			cycle: { ...this.#cycle },
			diagnostics: this.#diag.map((d) => ({ ...d })),
			cyclicCount: this.#cyclicCount,
			fault: this.#fault ? { message: this.#fault.message, pc: this.#fault.pc } : null,
			inputs: this.#inputs.slice(),
			outputs: this.#outputs.slice(),
			I: this.memory.I.slice(),
			Q: this.memory.Q.slice(),
			M: this.memory.M.slice(),
			timers: this.memory.timers.map((t) => ({ ...t })),
			counters: this.memory.counters.map((c) => ({ ...c })),
			taps: this.#vm.taps.slice(),
			forces: this.forces
		};
	}

	/**
	 * Forces a bit of I, Q or M to a fixed value (null removes the force). Forced inputs override
	 * the terminals, forced outputs and markers override whatever the program writes. Forces
	 * survive STOP and reset, like on a real CPU — clear them explicitly.
	 */
	force(address: string | Address, value: boolean | null): void {
		const addr = typeof address === 'string' ? parseAddress(address) : address;
		if (addr.area === 'T' || addr.area === 'C' || addr.size !== 'X') {
			throw new RangeError(`${formatAddress(addr)} cannot be forced — only bits of I, Q and M`);
		}
		checkAddress(addr, this.config);
		const key = formatAddress(addr);
		if (value === null) this.#forces.delete(key);
		else this.#forces.set(key, { addr, value });
	}

	clearForces(): void {
		this.#forces.clear();
	}

	get forces(): { address: string; value: boolean }[] {
		return [...this.#forces].map(([address, f]) => ({ address, value: f.value }));
	}

	/** Writes a value into Q or M once ("modify" in an online watch table). */
	modify(address: string | Address, value: number, type?: NumType): void {
		const addr = typeof address === 'string' ? parseAddress(address) : address;
		if (addr.area !== 'Q' && addr.area !== 'M') {
			throw new RangeError(`${formatAddress(addr)} cannot be modified — use a Q or M address`);
		}
		this.memory.writeNumber(addr, value, type);
		if (this.#mode === 'RUN' && addr.area === 'Q') this.#outputs.set(this.memory.Q);
	}

	/** Before the program: I, Q and M. After it: Q and M (the program may have overwritten them). */
	#applyForces(beforeProgram: boolean): void {
		for (const { addr, value } of this.#forces.values()) {
			if (beforeProgram || addr.area !== 'I') this.memory.writeBit(addr, value);
		}
	}

	#terminal(address: string | Address, area: 'I' | 'Q'): MemAddress {
		const addr = typeof address === 'string' ? parseAddress(address) : address;
		if (addr.area !== area || addr.size !== 'X') {
			throw new RangeError(
				`${formatAddress(addr)} is not a${area === 'I' ? 'n input' : 'n output'} terminal (e.g. ${area}0.0)`
			);
		}
		checkAddress(addr, this.config);
		return addr;
	}
}
