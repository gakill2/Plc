<script lang="ts">
	import type { Snippet } from 'svelte';
	import { getLadderView } from '#lib/ladder/context.js';

	type Props = { id: string; label: string; class?: string; children: Snippet };
	let { id, label, class: className = '', children }: Props = $props();

	const view = getLadderView();
	const selected = $derived(view.doc.selectedId === id);
	const errors = $derived(view.doc.diagnosticsFor(id));

	function select(e: Event) {
		e.stopPropagation();
		view.doc.select(id);
	}
</script>

<div
	role="button"
	tabindex="0"
	aria-label={label}
	aria-pressed={selected}
	title={errors.map((d) => d.message).join('\n') || undefined}
	class="relative shrink-0 rounded-md outline-none {className} {selected
		? 'bg-emerald-400/10 ring-1 ring-emerald-400/70'
		: 'hover:bg-slate-800/50'} {errors.length ? 'ring-1 ring-red-500/80' : ''}"
	onclick={select}
	onkeydown={(e) => {
		if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) select(e);
	}}
>
	{@render children()}
	{#if errors.length}
		<span
			class="absolute -top-1 -right-1 grid size-4 place-items-center rounded-full bg-red-500 text-[10px] font-bold text-white"
			aria-label="{errors.length} problem(s)">!</span
		>
	{/if}
</div>
