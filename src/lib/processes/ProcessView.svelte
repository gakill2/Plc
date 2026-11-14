<script lang="ts">
	import type { PlcRuntime } from '#lib/runtime/runtime.svelte.js';
	import ConveyorView from './ConveyorView.svelte';
	import TankView from './TankView.svelte';
	import TrafficView from './TrafficView.svelte';

	let { runtime }: { runtime: PlcRuntime } = $props();

	const state = $derived(runtime.snapshot?.process ?? null);
	const command = (name: string, value?: unknown) => runtime.processCommand(name, value);
</script>

{#if !state}
	<p class="p-6 text-sm text-slate-500">Starting the plant simulation…</p>
{:else if state.kind === 'traffic'}
	<TrafficView {state} />
{:else if state.kind === 'tank'}
	<TankView {state} {command} online={runtime.status === 'RUN'} />
{:else}
	<ConveyorView {state} {command} online={runtime.status === 'RUN'} />
{/if}
