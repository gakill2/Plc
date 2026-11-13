import type { Instr, ProgramIssue } from '#lib/engine/index.js';
import type { RuntimeCommand, RuntimeEvent, RuntimeSnapshot, RuntimeStatus } from './protocol.js';

/** UI-side handle to the PLC running in a Web Worker. */
export class PlcRuntime {
	snapshot = $state.raw<RuntimeSnapshot | null>(null);
	loadError = $state.raw<{ message: string; issues: ProgramIssue[] } | null>(null);

	readonly status: RuntimeStatus = $derived(this.snapshot?.status ?? 'STOP');
	/** True while the program is running or paused — the editor shows live values then. */
	readonly online: boolean = $derived(this.status !== 'STOP');

	#worker: Worker;

	constructor() {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- Vite worker import pattern
		this.#worker = new Worker(new URL('./plc.worker.ts', import.meta.url), { type: 'module' });
		this.#worker.onmessage = (e: MessageEvent<RuntimeEvent>) => {
			const event = e.data;
			if (event.type === 'snapshot') this.snapshot = event.snapshot;
			else this.loadError = { message: event.message, issues: event.issues };
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

	step(program: Instr[]) {
		if (this.status === 'STOP') {
			this.loadError = null;
			this.#send({ type: 'load', program: $state.snapshot(program) as Instr[] });
		}
		this.#send({ type: 'step' });
	}

	setInput(address: string, value: boolean) {
		this.#send({ type: 'setInput', address, value });
	}

	setSpeed(speed: number) {
		this.#send({ type: 'setSpeed', speed });
	}

	dispose() {
		this.#worker.terminate();
	}
}
