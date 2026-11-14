<script lang="ts">
	/** Plain text where known abbreviations (TON, NC, HMI…) explain themselves on hover / focus. */
	import { resolve } from '$app/paths';
	import { splitTerms } from './terms.js';

	let { text }: { text: string } = $props();
	const parts = $derived(splitTerms(text));
	const uid = $props.id();
</script>

{#each parts as p, i (i)}{#if p.term}<span class="group/term relative inline-block"
			><!-- svelte-ignore a11y_no_noninteractive_tabindex --><abbr
				tabindex="0"
				class="cursor-help underline decoration-sky-400/60 decoration-dotted underline-offset-2"
				aria-describedby="{uid}-{i}">{p.t}</abbr
			><span
				role="tooltip"
				id="{uid}-{i}"
				class="invisible absolute bottom-full left-1/2 z-50 w-64 -translate-x-1/2 rounded-md border border-slate-700 bg-slate-900 p-2 text-left text-xs leading-snug font-normal text-slate-300 normal-case opacity-0 shadow-xl transition-opacity group-focus-within/term:visible group-focus-within/term:opacity-100 group-hover/term:visible group-hover/term:opacity-100"
				><b class="block text-white">{p.t} · {p.term.name}</b>{p.term.text}{#if p.term.chapter}
					<a
						href={resolve('/learn/basics/[slug]', { slug: p.term.chapter })}
						target="_blank"
						rel="noopener"
						class="mt-1 block text-sky-300 underline">Więcej w rozdziale →</a
					>{/if}</span
			></span
		>{:else}{p.t}{/if}{/each}
