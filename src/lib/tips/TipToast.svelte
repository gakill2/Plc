<script lang="ts">
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';
	import RichText from '#lib/lessons/RichText.svelte';
	import { markTipSeen, nextTip, seenTips, setTipsOff, tipsOff, type TipInput } from './tips.js';

	type Props = { input: TipInput; quiet?: boolean };
	let { input, quiet = false }: Props = $props();

	let seen = $state<string[]>([]);
	let off = $state(true);
	onMount(() => {
		seen = seenTips();
		off = tipsOff();
	});

	/* sample once a second instead of on every edit — a tip shouldn't flash mid-click */
	let sampled = $state.raw<TipInput | null>(null);
	onMount(() => {
		const t = setInterval(() => (sampled = $state.snapshot(input) as TipInput), 1000);
		return () => clearInterval(t);
	});

	const tip = $derived(off || quiet || !sampled ? null : nextTip(sampled, seen));

	function dismiss() {
		if (!tip) return;
		markTipSeen(tip.id);
		seen = [...seen, tip.id];
	}
	function disable() {
		setTipsOff(true);
		off = true;
	}
</script>

{#if tip}
	<aside
		lang="pl"
		class="fixed bottom-4 left-4 z-40 w-80 rounded-lg border border-violet-500/50 bg-slate-900/95 p-3 text-xs shadow-2xl backdrop-blur"
		aria-live="polite"
		aria-label="Podpowiedź"
	>
		<p class="text-[10px] font-semibold tracking-wider text-violet-300 uppercase">💡 Podpowiedź</p>
		<p class="mt-0.5 text-sm font-semibold text-white">{tip.title}</p>
		<p class="mt-1 leading-relaxed text-slate-300"><RichText text={tip.text} /></p>
		<div class="mt-2 flex items-center gap-3">
			<button
				class="rounded bg-violet-500 px-2 py-1 font-semibold text-slate-950 hover:bg-violet-400"
				onclick={dismiss}>Rozumiem</button
			>
			<a
				href={resolve('/learn/basics/[slug]', { slug: tip.chapter })}
				target="_blank"
				rel="noopener"
				class="text-violet-300 underline hover:text-violet-200"
				onclick={dismiss}>Więcej →</a
			>
			<button
				class="ml-auto text-[11px] text-slate-500 underline hover:text-slate-300"
				onclick={disable}>Wyłącz podpowiedzi</button
			>
		</div>
	</aside>
{/if}
