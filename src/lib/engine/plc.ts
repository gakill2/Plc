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
import { DEFAULT_MAX_STEPS, execute, PlcFault, VmState } from './vm.js';
import type { Address, MemAddress } from './types.js';

export type PlcMode = 'STOP' | 'RUN' | 'FAULT';

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
	maxStepsPerScan = DEFAULT_MAX_STEPS;

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

	/** Validates and downloads a program. Puts the CPU in STOP with cleared memory. */
	load(program: Program): void {
		const issues = validateProgram(program, this.config);
		if (issues.length > 0) throw new ProgramError(issues);
		this.#program = [...program];
		this.#tapCount = program.reduce(
			(max, ins) => (ins.op === 'TAP' || ins.op === 'LDT' ? Math.max(max, ins.slot + 1) : max),
			0
		);
		this.reset();
	}

	/** Switches to RUN. Returns false when the CPU is in FAULT (call reset first). */
	run(): boolean {
		if (this.#mode === 'FAULT') return false;
		this.#mode = 'RUN';
		return true;
	}

	/** Switches to STOP. Outputs go off, memory is kept (warm restart on next run). */
	stop(): void {
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
	}

	/** Sets a physical input terminal. The program sees it on the next scan. */
	setInput(address: string | Address, value: boolean): void {
		const addr = this.#terminal(address, 'I');
		const bit = 1 << addr.bit;
		if (value) this.#inputs[addr.byte] |= bit;
		else this.#inputs[addr.byte] &= ~bit;
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

	/** Runs one scan cycle if the CPU is in RUN. Returns true when a scan was executed. */
	scan(dtMs: number): boolean {
		if (!(dtMs >= 0) || !Number.isFinite(dtMs)) throw new RangeError(`Invalid scan time ${dtMs}`);
		if (this.#mode !== 'RUN') return false;

		this.memory.I.set(this.#inputs);
		try {
			this.#lastScanSteps = execute(
				this.#program,
				this.memory,
				this.#vm,
				dtMs,
				this.maxStepsPerScan
			);
		} catch (e) {
			if (!(e instanceof PlcFault)) throw e;
			this.#fault = e;
			this.#mode = 'FAULT';
			this.#outputs.fill(0);
			return false;
		}
		this.#outputs.set(this.memory.Q);

		this.#scanCount++;
		this.#timeMs += dtMs;
		return true;
	}

	snapshot(): PlcSnapshot {
		return {
			mode: this.#mode,
			scanCount: this.#scanCount,
			timeMs: this.#timeMs,
			lastScanSteps: this.#lastScanSteps,
			fault: this.#fault ? { message: this.#fault.message, pc: this.#fault.pc } : null,
			inputs: this.#inputs.slice(),
			outputs: this.#outputs.slice(),
			I: this.memory.I.slice(),
			Q: this.memory.Q.slice(),
			M: this.memory.M.slice(),
			timers: this.memory.timers.map((t) => ({ ...t })),
			counters: this.memory.counters.map((c) => ({ ...c })),
			taps: this.#vm.taps.slice()
		};
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
