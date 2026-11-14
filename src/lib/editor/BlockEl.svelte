<script lang="ts">
	import { getLadderView } from '#lib/ladder/context.js';
	import type { BlockBox } from '#lib/ladder/model.js';
	import { operandInput, wireColor } from './colors.js';
	import Selectable from './Selectable.svelte';

	type Props = { el: BlockBox; inId: string | null };
	let { el, inId }: Props = $props();

	const view = getLadderView();
	const online = $derived(view.monitor !== null);
	const inPower = $derived(view.monitor?.power(inId) ?? false);
	const outPower = $derived(view.monitor?.power(el.id) ?? false);
	const info = $derived(
		view.doc.catalog.find((b) => b.name.toUpperCase() === el.type.toUpperCase())
	);

	function setPin(key: string, value: string) {
		view.doc.update(el, { pins: { ...el.pins, [key]: value } });
	}
	const stop = (e: Event) => e.stopPropagation();
	const field = 'grid grid-cols-[3.5rem_1fr] items-center gap-1';
	const label = 'truncate text-[10px] font-semibold text-slate-500';
</script>

<Selectable id={el.id} label="{el.type} block" class="w-52 pb-2">
	<div
		class="absolute top-[31px] left-0 h-0.5 w-3"
		style:background-color={wireColor(online, inPower)}
	></div>
	<div
		class="absolute top-[31px] right-0 h-0.5 w-3"
		style:background-color={wireColor(online, outPower)}
	></div>

	<div
		class="mx-3 mt-3 space-y-1 rounded border-2 bg-slate-950 px-1.5 py-1 transition-colors"
		style:border-color={online ? (outPower ? '#34d399' : '#475569') : '#64748b'}
	>
		<div class="flex items-center justify-between gap-1">
			<span class="font-mono text-xs font-bold text-violet-300" title={info?.comment ?? ''}
				>{el.type}</span
			>
			<input
				class="{operandInput} w-24"
				value={el.instance}
				disabled={view.locked}
				aria-label="Instance"
				title="Instancja — własna pamięć tego bloku"
				oninput={(e) => view.doc.update(el, { instance: e.currentTarget.value.trim() })}
				onclick={stop}
			/>
		</div>
		{#if !info}
			<p class="text-[10px] text-red-300">Brak bloku {el.type} w bibliotece</p>
		{:else}
			{#each info.inputs as pin (pin.name)}
				<label class={field} title="{pin.name} : {pin.type}">
					<span class={label}>{pin.name}</span>
					<input
						list={view.listId}
						class="{operandInput} text-left"
						value={el.pins[pin.name] ?? ''}
						placeholder={pin.init ?? '—'}
						disabled={view.locked}
						aria-label="{el.instance} {pin.name}"
						oninput={(e) => setPin(pin.name, e.currentTarget.value)}
						onclick={stop}
					/>
				</label>
			{/each}
			<div class="border-t border-slate-800 pt-1"></div>
			{#each info.outputs as pin (pin.name)}
				{@const text = el.pins[`>${pin.name}`] ?? ''}
				<label class={field} title="{pin.name} : {pin.type} (wyjście)">
					<span class="{label} text-right text-amber-400/80">{pin.name} ⇒</span>
					<input
						list={view.listId}
						class="{operandInput} text-left"
						value={text}
						placeholder="—"
						disabled={view.locked}
						aria-label="{el.instance} {pin.name} output"
						oninput={(e) => setPin(`>${pin.name}`, e.currentTarget.value)}
						onclick={stop}
					/>
				</label>
				{#if view.monitor && text}
					<div class="-mt-1 text-right font-mono text-[10px] text-amber-300">
						= {view.monitor.number(text) ?? '–'}
					</div>
				{/if}
			{/each}
		{/if}
	</div>
</Selectable>
