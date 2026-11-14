<script lang="ts">
	import type { PlcRuntime } from '#lib/runtime/runtime.svelte.js';
	import ConveyorView from './ConveyorView.svelte';
	import CraneView from './CraneView.svelte';
	import OvenView from './OvenView.svelte';
	import RemoteView from './RemoteView.svelte';
	import DriveView from './DriveView.svelte';
	import LineView from './LineView.svelte';
	import TankView from './TankView.svelte';
	import TrafficView from './TrafficView.svelte';

	import { plantInfo } from './plants.js';

	let { runtime }: { runtime: PlcRuntime } = $props();
	const info = $derived(plantInfo(runtime.snapshot?.process?.kind));

	const state = $derived(runtime.snapshot?.process ?? null);
	const command = (name: string, value?: unknown) => runtime.processCommand(name, value);
</script>

{#if !state}
	<p class="p-6 text-sm text-slate-500">Starting the plant simulation…</p>
{:else if state.kind === 'traffic'}
	<TrafficView {state} />
{:else if state.kind === 'tank'}
	<TankView {state} {command} online={runtime.status === 'RUN'} />
{:else if state.kind === 'line'}
	<LineView {state} {command} online={runtime.status === 'RUN'} />
{:else if state.kind === 'oven'}
	<OvenView {state} {command} online={runtime.status === 'RUN'} />
{:else if state.kind === 'drive'}
	<DriveView {state} {command} />
{:else if state.kind === 'remote'}
	<RemoteView {state} {command} online={runtime.status === 'RUN'} />
{:else if state.kind === 'crane'}
	<CraneView {state} {command} online={runtime.status === 'RUN'} />
{:else}
	<ConveyorView {state} {command} online={runtime.status === 'RUN'} />
{/if}

{#if info}
	<section
		class="mx-6 mb-6 max-w-2xl rounded-lg border border-slate-800 bg-slate-900/60 p-3 text-xs"
	>
		<h2 class="mb-1 font-semibold text-slate-200">{info.name} — PLC connections</h2>
		<p class="mb-2 text-slate-400">{info.description}</p>
		<table class="w-full text-left">
			<tbody>
				{#each info.io as io (io.address)}
					<tr class="border-t border-slate-800">
						<td
							class="py-1 pr-3 font-mono {io.address.startsWith('I')
								? 'text-sky-300'
								: 'text-amber-300'}">{io.address}</td
						>
						<td class="py-1 pr-3 font-mono text-slate-200">{io.name}</td>
						<td class="py-1 text-slate-400">{io.comment}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	</section>
{/if}
