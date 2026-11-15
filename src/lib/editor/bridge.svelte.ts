import { untrack } from 'svelte';
import { inputDrive } from '#lib/circuit/model.js';
import { terminalBit } from '#lib/circuit/context.js';
import type { CircuitSim } from '#lib/circuit/sim.svelte.js';
import { parseAddress } from '#lib/engine/index.js';
import { ackAlarms, newAlarmLog, shelveAlarm, unacked, updateAlarms } from '#lib/hmi/alarms.js';
import type { ProjectState } from '#lib/project/state.svelte.js';
import { readBit, readNumber } from '#lib/runtime/read.js';
import type { PlcRuntime } from '#lib/runtime/runtime.svelte.js';
import { resolveSymbol } from '#lib/symbols/symbols.js';

/**
 * Connects the circuit to the PLC while the editor is open: devices drive the input terminals
 * they are wired to, and frequency inverters run on the PLC's simulated time and drive analog
 * input words. Create it during component initialisation (it sets up effects).
 */
export function connectCircuit(project: () => ProjectState, runtime: PlcRuntime, sim: CircuitSim) {
	// eslint-disable-next-line svelte/prefer-svelte-reactivity -- bookkeeping, not state
	let sent = new Map<string, boolean>();
	$effect(() => {
		const outputs = runtime.snapshot?.outputs;
		const drive = inputDrive(project().circuit, sim.actuated, {
			positions: sim.positions,
			faults: sim.faults,
			output: (t) => terminalBit(outputs, t),
			vfd: (id) => sim.vfd[id]
		});
		untrack(() => {
			for (const [terminal, value] of drive)
				if (sent.get(terminal) !== value) runtime.setInput(terminal, value);
			for (const terminal of sent.keys())
				if (!drive.has(terminal)) runtime.setInput(terminal, false);
			sent = drive;
		});
	});

	let deviceTime = 0;
	// eslint-disable-next-line svelte/prefer-svelte-reactivity -- bookkeeping, not state
	let sentWords = new Map<string, number>();
	$effect(() => {
		const snap = runtime.snapshot;
		if (!snap) return;
		untrack(() => {
			const dt = snap.timeMs - deviceTime;
			deviceTime = snap.timeMs;
			const circuit = project().circuit;
			if (!circuit.devices.some((d) => d.type === 'vfd')) return;
			const words = sim.stepDevices(circuit, Math.min(500, Math.max(0, dt)), {
				bit: (t) => terminalBit(snap.outputs, t),
				word: (a) => readNumber(snap, parseAddress(a)) ?? 0
			});
			for (const [address, value] of words)
				if (sentWords.get(address) !== value) runtime.setInputNumber(address, value);
			sentWords = words;
		});
	});
}

/** The operator panel's alarm log, fed from the PLC snapshots. Create during initialisation. */
export class AlarmLog {
	log = $state.raw(newAlarmLog());
	readonly pending: number;
	#ackPending = false;

	constructor(
		private readonly project: () => ProjectState,
		private readonly runtime: PlcRuntime
	) {
		this.pending = $derived(unacked(this.log));
		$effect(() => {
			const snap = runtime.snapshot;
			if (!snap) return;
			untrack(() => {
				const p = project();
				if (this.#ackPending && p.hmi.ackTag.trim()) {
					this.#ackPending = false;
					this.write(p.hmi.ackTag, 0);
				}
				this.log = updateAlarms(
					this.log,
					p.hmi.alarms,
					(tag) => {
						try {
							return readBit(snap, parseAddress(resolveSymbol(p.symbols.map, tag.trim())));
						} catch {
							return null;
						}
					},
					snap.timeMs
				);
			});
		});
	}

	/** A write from the panel (a button, a setpoint). */
	write(tag: string, value: number) {
		try {
			this.runtime.modify(resolveSymbol(this.project().symbols.map, tag.trim()), value);
		} catch {
			// an invalid tag is reported in the panel editor
		}
	}

	/** Shelving: the alarm is taken off the list for 10 minutes of simulated time. */
	shelve(defId: string) {
		this.log = shelveAlarm(this.log, defId, this.runtime.snapshot?.timeMs ?? 0, 600_000);
	}

	ack(seqs?: number[]) {
		this.log = ackAlarms(this.log, this.runtime.snapshot?.timeMs ?? 0, seqs);
		const tag = this.project().hmi.ackTag;
		if (tag.trim()) {
			this.write(tag, 1);
			this.#ackPending = true;
		}
	}
}
