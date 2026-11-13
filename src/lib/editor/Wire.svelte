<script lang="ts">
	import { getLadderView } from '#lib/ladder/context.js';
	import { wireColor } from './colors.js';

	type Props = { powered?: boolean; grow?: boolean; width?: number };
	let { powered = false, grow = false, width = 16 }: Props = $props();

	const view = getLadderView();
	const color = $derived(wireColor(view.monitor !== null, powered));
</script>

<div
	class="relative h-16 shrink-0 {grow ? 'min-w-4 flex-1' : ''}"
	style:width={grow ? undefined : `${width}px`}
	aria-hidden="true"
>
	<div
		class="absolute inset-x-0 top-[31px] h-0.5 transition-colors"
		style:background-color={color}
		style:box-shadow={powered && view.monitor ? `0 0 6px ${color}` : undefined}
	></div>
</div>
