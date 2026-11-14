import type { Instr, NumType, ProgramIssue } from '#lib/engine/index.js';
import type {
	RuntimeCommand,
	RuntimeEvent,
	RuntimeSnapshot,
	RuntimeStatus,
	TraceSignal
} from './protocol.js';
import { TraceBuffer } from './trace.js';
import type { ProcessKind } from '#lib/processes/types.js';

/** UI-side handle to the PLC running in a Web Worker. */
export class PlcRuntime {
	snapshot = $state.raw<RuntimeSnapshot | null>(null);
	loadError = $state.raw<{ message: string; issues: ProgramIssue[] } | null>(null);
	commandError = $state.raw<string | null>(null);
	/** History of the traced signals (filled before `snapshot` changes, so readers see both). */
	readonly trace = new TraceBuffer();

	readonly status: RuntimeStatus = $derived(this.snapshot?.status ?? 'STOP');
	/** True while the program is running or paused — the editor shows live values then. */
	readonly online: boolean = $derived(this.status !== 'STOP');
	/** Forced bits, address → value. */
	readonly forces: ReadonlyMap<string, boolean> = $derived(
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- immutable, rebuilt per snapshot
		new Map((this.snapshot?.forces ?? []).map((f) => [f.address, f.value]))
	);

	#worker: Worker;
	#errorTimer: ReturnType<typeof setTimeout> | undefined;

	constructor() {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- Vite worker import pattern
		this.#worker = new Worker(new URL('./plc.worker.ts', import.meta.url), { type: 'module' });
		this.#worker.onmessage = (e: MessageEvent<RuntimeEvent>) => {
			const event = e.data;
			if (event.type === 'snapshot') {
				this.trace.push(event.snapshot.trace);
				this.snapshot = event.snapshot;
			} else if (event.type === 'loadError') {
				this.loadError = { message: event.message, issues: event.issues };
			} else {
				this.commandError = event.message;
				clearTimeout(this.#errorTimer);
				this.#errorTimer = setTimeout(() => (this.commandError = null), 4000);
			}
		};
	}

	#send(cmd: RuntimeCommand) {
		this.#worker.postMessage(cmd);
	}

	/** Downloads the program and starts it (cold start). */
	start(program: Instr[]) {
		this.loadError = null;
		this.#send({ type: 'load', program: $state.snapshot(program) as Instr[] });
		this.#send({ type: 'run' });
	}

	resume = () => this.#send({ type: 'run' });
	pause = () => this.#send({ type: 'pause' });
	stop = () => this.#send({ type: 'stop' });
	reset = () => this.#send({ type: 'reset' });
	clearForces = () => this.#send({ type: 'clearForces' });

	step(program: Instr[]) {
		if (this.status === 'STOP') {
			this.loadError = null;
			this.#send({ type: 'load', program: $state.snapshot(program) as Instr[] });
		}
		this.#send({ type: 'step' });
	}

	setInputNumber(address: string, value: number) {
		this.#send({ type: 'setInputNumber', address, value });
	}

	setInput(address: string, value: boolean) {
		this.#send({ type: 'setInput', address, value });
	}

	setSpeed(speed: number) {
		this.#send({ type: 'setSpeed', speed });
	}

	force(address: string, value: boolean | null) {
		this.#send({ type: 'force', address, value });
	}

	modify(address: string, value: number, numType?: NumType) {
		this.#send({ type: 'modify', address, value, numType });
	}

	setProcess(kind: ProcessKind | null) {
		this.#send({ type: 'setProcess', kind });
	}

	processCommand(name: string, value?: unknown) {
		this.#send({ type: 'processCommand', name, value: $state.snapshot(value) });
	}

	setTrace(signals: TraceSignal[]) {
		this.#send({ type: 'setTrace', signals: $state.snapshot(signals) as TraceSignal[] });
	}

	dispose() {
		clearTimeout(this.#errorTimer);
		this.#worker.terminate();
	}
}
