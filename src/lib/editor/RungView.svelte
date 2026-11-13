<script lang="ts">
	import { getLadderView } from '#lib/ladder/context.js';
	import type { Rung } from '#lib/ladder/model.js';
	import { wireColor } from './colors.js';
	import CoilEl from './CoilEl.svelte';
	import SeriesView from './SeriesView.svelte';
	import Vertical from './Vertical.svelte';
	import Wire from './Wire.svelte';

	type Props = { rung: Rung; index: number };
	let { rung, index }: Props = $props();

	const view = getLadderView();
	const online = $derived(view.monitor !== null);
	const selected = $derived(view.doc.selectedId === rung.id);
	const out = $derived(view.monitor?.power(rung.id) ?? false);
	const errors = $derived(view.doc.diagnosticsFor(rung.id));
	const rail = $derived(wireColor(online, true));
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
<section
	onclick={(e) => {
		e.stopPropagation();
		view.doc.select(rung.id);
	}}
	class="rounded-lg border bg-slate-900/40 {selected
		? 'border-emerald-500/60'
		: 'border-slate-800'}"
	aria-label="Network {index + 1}"
>
	<header class="flex items-center gap-2 border-b border-slate-800/80 px-3 py-1.5">
		<span
			class="font-mono text-xs font-semibold {selected ? 'text-emerald-300' : 'text-slate-400'}"
		>
			Network {index + 1}
		</span>
		<input
			class="min-w-0 flex-1 bg-transparent text-xs text-slate-400 outline-none placeholder:text-slate-600 focus:text-slate-200"
			value={rung.comment}
			placeholder="Comment…"
			disabled={view.locked}
			aria-label="Network {index + 1} comment"
			oninput={(e) => view.doc.update(rung, { comment: e.currentTarget.value })}
		/>
		{#each errors as d (d.message)}
			<span class="text-xs text-red-400">{d.message}</span>
		{/each}
	</header>

	<div class="flex items-stretch overflow-x-auto px-3 py-3">
		<div class="w-1 shrink-0 rounded" style:background-color={rail}></div>
		<div class="flex flex-1 items-start">
			<Wire width={16} powered={online} />
			<SeriesView series={rung.logic} inId={null} />
			<Wire grow powered={out} />
			<div class="flex flex-col">
				{#each rung.coils as c, i (c.id)}
					<div class="relative flex items-start">
						<Vertical side="left" index={i} count={rung.coils.length} powered={out} />
						<Wire width={14} powered={out} />
						<CoilEl coil={c} powered={out} />
						<Wire width={16} powered={false} />
						<Vertical side="right" index={i} count={rung.coils.length} powered={false} />
					</div>
				{/each}
			</div>
		</div>
		<div class="w-1 shrink-0 rounded" style:background-color={wireColor(online, false)}></div>
	</div>
</section>
