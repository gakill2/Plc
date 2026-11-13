<script lang="ts">
	import { BaseEdge, getSmoothStepPath, type EdgeProps } from '@xyflow/svelte';
	import { getCircuitView, terminalBit } from './context.js';

	let {
		id,
		sourceX,
		sourceY,
		targetX,
		targetY,
		sourcePosition,
		targetPosition,
		data,
		selected
	}: EdgeProps = $props();

	const view = getCircuitView();
	const [path] = $derived(
		getSmoothStepPath({
			sourceX,
			sourceY,
			targetX,
			targetY,
			sourcePosition,
			targetPosition,
			borderRadius: 10
		})
	);
	const on = $derived.by(() => {
		const terminal = String(data?.terminal ?? '');
		const image = terminal.startsWith('I') ? view.snapshot?.inputs : view.snapshot?.outputs;
		return terminalBit(image, terminal);
	});
	const stroke = $derived(
		on ? (String(data?.terminal).startsWith('I') ? '#34d399' : '#fcd34d') : '#64748b'
	);
</script>

<BaseEdge
	{id}
	{path}
	style="stroke: {stroke}; stroke-width: {selected ? 3.5 : 2.5}; {on
		? `filter: drop-shadow(0 0 3px ${stroke});`
		: ''}"
/>
