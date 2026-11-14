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
	import PneumaticView from './PneumaticView.svelte';
	import MixerView from './MixerView.svelte';

	import { plantInfo } from './plants.js';
	import { SIGNAL_FAULTS, type SignalFault } from './field.js';

	let { runtime }: { runtime: PlcRuntime } = $props();
	const info = $derived(plantInfo(runtime.snapshot?.process?.kind));

	const state = $derived(runtime.snapshot?.process ?? null);
	const command = (name: string, value?: unknown) => runtime.processCommand(name, value);

	const field = $derived(runtime.snapshot?.field);
	/** sensors of the plant: inputs (bits and words) */
	const sensors = $derived(info?.io.filter((io) => io.address.startsWith('I')) ?? []);
	const choices = (address: string) =>
		(Object.keys(SIGNAL_FAULTS) as SignalFault[]).filter(
			(f) => SIGNAL_FAULTS[f].analog === /^IW|^ID/i.test(address)
		);
	const faultCount = $derived(
		Object.keys(field?.faults ?? {}).length + (field?.plantFaults.length ?? 0)
	);
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
{:else if state.kind === 'pneumatic'}
	<PneumaticView {state} {command} online={runtime.status === 'RUN'} />
{:else if state.kind === 'mixer'}
	<MixerView {state} {command} online={runtime.status === 'RUN'} />
{:else if state.kind === 'crane'}
	<CraneView {state} {command} online={runtime.status === 'RUN'} />
{:else}
	<ConveyorView {state} {command} online={runtime.status === 'RUN'} />
{/if}

{#if info}
	<details
		class="mx-6 mb-4 max-w-2xl rounded-lg border border-slate-800 bg-slate-900/60 p-3 text-xs"
		lang="pl"
	>
		<summary class="cursor-pointer font-semibold text-slate-200">
			Czujniki i usterki
			{#if faultCount}<span class="ml-2 rounded bg-red-500/20 px-1.5 text-red-300"
					>{faultCount} aktywne</span
				>{/if}
			{#if field?.realism}<span class="ml-2 rounded bg-sky-500/20 px-1.5 text-sky-300"
					>realistyczne sygnały</span
				>{/if}
		</summary>
		<div class="mt-3 space-y-3">
			<label class="flex items-start gap-2 text-slate-300">
				<input
					type="checkbox"
					checked={field?.realism ?? false}
					onchange={(e) => command('field:realism', e.currentTarget.checked)}
				/>
				<span
					>Realistyczne sygnały — szum na wejściach analogowych, a wartość poza zakresem pomiarowym
					czytana jako 32767 (przepełnienie), jak na module S7.</span
				>
			</label>
			<table class="w-full text-left" aria-label="Usterki czujników">
				<tbody>
					{#each sensors as io (io.address)}
						{@const f = field?.faults[io.address.toUpperCase()] ?? ''}
						<tr class="border-t border-slate-800">
							<td class="py-1 pr-3 font-mono text-sky-300">{io.address}</td>
							<td class="py-1 pr-3 font-mono text-slate-200">{io.name}</td>
							<td class="py-1">
								<select
									class="rounded border bg-slate-950 px-1 py-0.5 {f
										? 'border-red-500 text-red-300'
										: 'border-slate-700 text-slate-300'}"
									aria-label="Usterka {io.name}"
									value={f}
									onchange={(e) =>
										command('field:fault', {
											address: io.address,
											fault: e.currentTarget.value || null
										})}
								>
									<option value="">sprawny</option>
									{#each choices(io.address) as c (c)}
										<option value={c}>{SIGNAL_FAULTS[c].label}</option>
									{/each}
								</select>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
			{#if info.faults?.length}
				<div class="space-y-1">
					<h3 class="font-semibold text-slate-300">Usterki obiektu</h3>
					{#each info.faults as pf (pf.id)}
						<label class="flex items-center gap-2 text-slate-300">
							<input
								type="checkbox"
								checked={field?.plantFaults.includes(pf.id) ?? false}
								onchange={(e) => command('field:plant', { id: pf.id, on: e.currentTarget.checked })}
							/>
							{pf.label}
						</label>
					{/each}
				</div>
			{/if}
			<p class="text-slate-500">
				Usterki zostają do odznaczenia — także po Stop → Run. Dobry program wykrywa je sam: brak
				potwierdzenia ruchu w czasie, wartość analogowa 32767, sprzeczne czujniki.
			</p>
		</div>
	</details>

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
