<script lang="ts">
	/** Renders text where `backticks` mark code and **stars** mark bold — enough for lessons. */
	import TermText from '#lib/tips/TermText.svelte';

	let { text }: { text: string } = $props();
	const parts = $derived(
		text
			.split('`')
			.flatMap((t, i) =>
				i % 2 === 1
					? [{ t, code: true, bold: false }]
					: t.split('**').map((u, j) => ({ t: u, code: false, bold: j % 2 === 1 }))
			)
	);
</script>

{#each parts as p, i (i)}{#if p.code}<code
			class="rounded bg-slate-800 px-1 font-mono text-[0.9em] text-emerald-300">{p.t}</code
		>{:else if p.bold}<strong class="font-semibold text-white"><TermText text={p.t} /></strong
		>{:else}<TermText text={p.t} />{/if}{/each}
