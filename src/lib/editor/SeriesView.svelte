<script lang="ts">
	import { inputTap } from '#lib/ladder/compiler.js';
	import { getLadderView } from '#lib/ladder/context.js';
	import type { Series } from '#lib/ladder/model.js';
	import BoxEl from './BoxEl.svelte';
	import ContactEl from './ContactEl.svelte';
	import SeriesView from './SeriesView.svelte';
	import Vertical from './Vertical.svelte';
	import Wire from './Wire.svelte';

	/** `inId` — node whose power feeds this series (null = left rail). */
	type Props = { series: Series; inId: string | null };
	let { series, inId }: Props = $props();

	const view = getLadderView();
	const power = (id: string | null) => view.monitor?.power(id) ?? false;
</script>

<div class="flex items-start">
	{#each series.items as el, i (el.id)}
		{@const feed = i === 0 ? inId : series.items[i - 1].id}
		{#if el.kind === 'parallel'}
			{@const input = inputTap(el.id)}
			<div class="flex flex-col">
				{#each el.branches as branch, b (branch.id)}
					<div class="relative flex items-start">
						<Vertical side="left" index={b} count={el.branches.length} powered={power(input)} />
						<Wire width={14} powered={power(input)} />
						<SeriesView series={branch} inId={input} />
						<Wire grow powered={power(branch.id)} />
						<Vertical side="right" index={b} count={el.branches.length} powered={power(el.id)} />
					</div>
				{/each}
			</div>
		{:else if el.kind === 'contact'}
			<ContactEl {el} inId={feed} />
		{:else}
			<BoxEl {el} inId={feed} />
		{/if}
	{/each}
</div>
