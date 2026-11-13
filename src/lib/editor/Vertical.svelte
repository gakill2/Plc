<script lang="ts">
	import { getLadderView } from '#lib/ladder/context.js';
	import { wireColor } from './colors.js';

	/**
	 * Vertical connector of a parallel block, drawn per branch row:
	 * the first row draws from the wire down, the last from the top to the wire,
	 * middle rows draw the full height — together they form one continuous line.
	 */
	type Props = { side: 'left' | 'right'; index: number; count: number; powered: boolean };
	let { side, index, count, powered }: Props = $props();

	const view = getLadderView();
	const color = $derived(wireColor(view.monitor !== null, powered));
	const pos = $derived(side === 'left' ? 'left-0' : 'right-0');
</script>

{#if index > 0}
	<div class="absolute top-0 h-[33px] w-0.5 {pos}" style:background-color={color}></div>
{/if}
{#if index < count - 1}
	<div class="absolute top-[31px] bottom-0 w-0.5 {pos}" style:background-color={color}></div>
{/if}
