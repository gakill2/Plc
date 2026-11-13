<script lang="ts">
	import { getLadderView } from '#lib/ladder/context.js';
	import type { Coil } from '#lib/ladder/model.js';
	import { operandInput, wireColor } from './colors.js';
	import Selectable from './Selectable.svelte';

	type Props = { coil: Coil; powered: boolean };
	let { coil, powered }: Props = $props();

	const view = getLadderView();
	const online = $derived(view.monitor !== null);
	const energized = $derived(view.monitor?.bit(coil.operand) === true);
	const symbol = $derived(online ? (energized ? '#34d399' : '#64748b') : '#e2e8f0');
	const letter = $derived(coil.type === 'SET' ? 'S' : coil.type === 'RESET' ? 'R' : '');
</script>

<Selectable id={coil.id} label="{coil.type} coil {coil.operand}" class="h-16 w-24">
	<input
		class="{operandInput} absolute inset-x-1 top-0.5"
		value={coil.operand}
		disabled={view.locked}
		spellcheck="false"
		aria-label="Coil operand"
		oninput={(e) => view.doc.update(coil, { operand: e.currentTarget.value })}
		onclick={(e) => e.stopPropagation()}
	/>
	<svg class="pointer-events-none absolute inset-0" viewBox="0 0 96 64" aria-hidden="true">
		<line x1="0" y1="32" x2="36" y2="32" stroke={wireColor(online, powered)} stroke-width="2" />
		<line x1="60" y1="32" x2="96" y2="32" stroke={wireColor(online, powered)} stroke-width="2" />
		<g stroke={symbol} stroke-width="2.5" fill="none">
			<path d="M 42 20 Q 34 32 42 44" />
			<path d="M 54 20 Q 62 32 54 44" />
			{#if coil.type === 'NCOIL'}
				<line x1="43" y1="42" x2="53" y2="22" stroke-width="2" />
			{/if}
		</g>
		{#if letter}
			<text
				x="48"
				y="36.5"
				text-anchor="middle"
				font-size="12"
				fill={symbol}
				font-family="monospace">{letter}</text
			>
		{/if}
	</svg>
</Selectable>
