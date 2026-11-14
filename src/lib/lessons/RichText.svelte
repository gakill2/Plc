<script lang="ts">
	/** Renders text where `backticks` mark code — enough markup for lesson instructions. */
	let { text }: { text: string } = $props();
	const parts = $derived(text.split('`').map((t, i) => ({ t, code: i % 2 === 1 })));
</script>

{#each parts as p, i (i)}{#if p.code}<code
			class="rounded bg-slate-800 px-1 font-mono text-[0.9em] text-emerald-300">{p.t}</code
		>{:else}{p.t}{/if}{/each}
