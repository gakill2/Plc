<script lang="ts">
	import { getLadderView } from '#lib/ladder/context.js';
	import type { Contact } from '#lib/ladder/model.js';
	import { operandInput, wireColor } from './colors.js';
	import Selectable from './Selectable.svelte';

	type Props = { el: Contact; inId: string | null };
	let { el, inId }: Props = $props();

	const view = getLadderView();
	const alias = $derived(view.doc.alias(el.operand));
	const online = $derived(view.monitor !== null);
	const inPower = $derived(view.monitor?.power(inId) ?? false);
	const outPower = $derived(view.monitor?.power(el.id) ?? false);
	/** Is the contact itself closed (regardless of the power coming from the left)? */
	const closed = $derived.by(() => {
		const m = view.monitor;
		if (!m) return false;
		const bit = m.bit(el.operand);
		if (el.type === 'NO') return bit === true;
		if (el.type === 'NC') return bit === false;
		return outPower;
	});
	const symbol = $derived(online ? (closed ? '#34d399' : '#64748b') : '#e2e8f0');
</script>

<Selectable id={el.id} label="{el.type} contact {el.operand}" class="h-16 w-24">
	<input
		class="{operandInput} absolute inset-x-1 top-0.5"
		value={el.operand}
		disabled={view.locked}
		spellcheck="false"
		aria-label="Contact operand"
		oninput={(e) => view.doc.update(el, { operand: e.currentTarget.value })}
		onclick={(e) => e.stopPropagation()}
	/>
	<svg class="pointer-events-none absolute inset-0" viewBox="0 0 96 64" aria-hidden="true">
		<line x1="0" y1="32" x2="38" y2="32" stroke={wireColor(online, inPower)} stroke-width="2" />
		<line x1="58" y1="32" x2="96" y2="32" stroke={wireColor(online, outPower)} stroke-width="2" />
		<g stroke={symbol} stroke-width="2.5" fill={symbol}>
			<line x1="39" y1="21" x2="39" y2="43" />
			<line x1="57" y1="21" x2="57" y2="43" />
			{#if el.type === 'NC'}
				<line x1="43" y1="43" x2="53" y2="21" stroke-width="2" />
			{:else if el.type === 'P' || el.type === 'N'}
				<text
					x="48"
					y="36.5"
					text-anchor="middle"
					font-size="12"
					stroke="none"
					font-family="monospace">{el.type}</text
				>
			{/if}
		</g>
	</svg>
	{#if alias}
		<span
			class="pointer-events-none absolute inset-x-0 bottom-0.5 truncate text-center font-mono text-[10px] text-sky-300/80"
			>{alias}</span
		>
	{/if}
</Selectable>
