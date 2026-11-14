<script lang="ts">
	import { Handle, Position } from '@xyflow/svelte';
	import { getCircuitView, terminalBit } from './context.js';
	import { portOf } from './model.js';

	const view = getCircuitView();

	const rows = Array.from({ length: 16 }, (_, i) => ({
		i: `I${i >> 3}.${i & 7}`,
		q: `Q${i >> 3}.${i & 7}`
	}));

	const labels = $derived.by(() => {
		const map: Record<string, string> = {};
		for (const w of view.project.circuit.wires) {
			const d = view.project.circuit.devices.find((x) => x.id === w.device);
			if (!d) continue;
			const label = d.label + (portOf(d.type, w.port)?.suffix ?? '');
			map[w.terminal] = map[w.terminal] ? `${map[w.terminal]}, ${label}` : label;
		}
		return map;
	});

	const status = $derived(view.snapshot?.status ?? 'STOP');
	const led = (on: boolean, color: string) =>
		on ? `${color} shadow-[0_0_6px] shadow-current` : 'bg-slate-700 text-slate-700';
</script>

<div class="w-64 rounded-lg border-2 border-slate-600 bg-slate-800 text-slate-200 shadow-xl">
	<div class="flex items-center justify-between border-b border-slate-600 px-3 py-2">
		<div>
			<div class="font-mono text-xs font-bold">CPU · PLC Sim</div>
			<div class="text-[10px] text-slate-400">DI 16 × 24 V · DQ 16 × relay</div>
		</div>
		<div class="grid grid-cols-3 gap-x-1.5 text-center font-mono text-[8px] text-slate-400">
			<span
				class="mx-auto size-2 rounded-full {led(
					status === 'RUN',
					'bg-emerald-400 text-emerald-400'
				)}"
			></span>
			<span
				class="mx-auto size-2 rounded-full {led(
					status === 'STOP' || status === 'PAUSED',
					'bg-amber-400 text-amber-400'
				)}"
			></span>
			<span class="mx-auto size-2 rounded-full {led(status === 'FAULT', 'bg-red-500 text-red-500')}"
			></span>
			<span>RUN</span><span>STOP</span><span>SF</span>
		</div>
	</div>

	<div class="py-1">
		{#each rows as r (r.i)}
			{@const inOn = terminalBit(view.snapshot?.inputs, r.i)}
			{@const outOn = terminalBit(view.snapshot?.outputs, r.q)}
			<div class="grid h-[22px] grid-cols-2 items-center font-mono text-[10px]">
				<div class="relative flex min-w-0 items-center gap-1.5 pl-3">
					<Handle
						type="target"
						position={Position.Left}
						id={r.i}
						isConnectable={!view.locked}
						class="!size-2.5 !border-slate-900 !bg-sky-400"
					/>
					<span class="size-1.5 shrink-0 rounded-full {inOn ? 'bg-emerald-400' : 'bg-slate-600'}"
					></span>
					<span class="text-slate-300">{r.i}</span>
					<span class="truncate text-slate-500">{labels[r.i] ?? ''}</span>
				</div>
				<div class="relative flex min-w-0 items-center justify-end gap-1.5 pr-3">
					<span class="truncate text-slate-500">{labels[r.q] ?? ''}</span>
					<span class="text-slate-300">{r.q}</span>
					<span class="size-1.5 shrink-0 rounded-full {outOn ? 'bg-amber-300' : 'bg-slate-600'}"
					></span>
					<Handle
						type="source"
						position={Position.Right}
						id={r.q}
						isConnectable={!view.locked}
						class="!size-2.5 !border-slate-900 !bg-amber-400"
					/>
				</div>
			</div>
		{/each}
	</div>
</div>
