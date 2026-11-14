<script lang="ts">
	import StatusLed from '#lib/components/StatusLed.svelte';
	import { SPEEDS } from '#lib/runtime/core.js';
	import type { PlcRuntime } from '#lib/runtime/runtime.svelte.js';

	type Props = { runtime: PlcRuntime; onRun: () => void; onStep: () => void };
	let { runtime, onRun, onStep }: Props = $props();

	const status = $derived(runtime.status);
	const snapshot = $derived(runtime.snapshot);
	const led = $derived(
		status === 'RUN'
			? { color: 'green' as const, on: true }
			: status === 'PAUSED'
				? { color: 'amber' as const, on: true }
				: status === 'FAULT'
					? { color: 'red' as const, on: true }
					: { color: 'green' as const, on: false }
	);

	const button =
		'flex items-center gap-1 rounded px-2.5 py-1 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-40';
</script>

<div class="flex flex-wrap items-center gap-2" role="toolbar" aria-label="PLC controls">
	<div class="flex items-center gap-2 rounded-md border border-slate-800 bg-slate-900 px-2.5 py-1">
		<StatusLed on={led.on} color={led.color} label={status} />
		<span class="w-14 font-mono text-xs font-semibold" role="status" aria-label="PLC status"
			>{status}</span
		>
		<span class="font-mono text-[11px] text-slate-500" title="Simulated time · scan count">
			{((snapshot?.timeMs ?? 0) / 1000).toFixed(2)} s · #{snapshot?.scanCount ?? 0}
		</span>
	</div>

	<div class="flex items-center gap-0.5 rounded-md border border-slate-800 bg-slate-900 p-0.5">
		<button
			class="{button} bg-emerald-500 text-slate-950 hover:bg-emerald-400"
			disabled={status === 'RUN'}
			onclick={onRun}
			title="Download the program and run (or resume)"
		>
			▶ Run
		</button>
		<button
			class="{button} hover:bg-slate-700"
			disabled={status !== 'RUN'}
			onclick={runtime.pause}
			title="Pause the simulation clock"
		>
			❚❚ Pause
		</button>
		<button
			class="{button} hover:bg-slate-700"
			disabled={status === 'RUN' || status === 'FAULT'}
			onclick={onStep}
			title="Execute exactly one scan cycle ({snapshot?.scanMs ?? 10} ms)"
		>
			⏭ Step
		</button>
		<button
			class="{button} hover:bg-slate-700"
			disabled={status === 'STOP'}
			onclick={runtime.stop}
			title="Stop — outputs go off, edit again"
		>
			■ Stop
		</button>
		<button
			class="{button} hover:bg-slate-700"
			onclick={runtime.reset}
			title="Cold restart: clear memory"
		>
			↺ Reset
		</button>
	</div>

	<label class="flex items-center gap-1.5 text-xs text-slate-400">
		Speed
		<select
			class="rounded border border-slate-800 bg-slate-900 px-1 py-1 font-mono text-xs text-slate-200"
			value={snapshot?.speed ?? 1}
			onchange={(e) => runtime.setSpeed(Number(e.currentTarget.value))}
		>
			{#each SPEEDS as s (s)}<option value={s}>×{s}</option>{/each}
		</select>
	</label>

	{#if snapshot?.fault}
		<span class="rounded bg-red-500/15 px-2 py-1 font-mono text-xs text-red-300">
			FAULT @{snapshot.fault.pc}: {snapshot.fault.message}
		</span>
	{/if}
</div>
