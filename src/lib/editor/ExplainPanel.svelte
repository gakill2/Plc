<script lang="ts">
	import { t } from '#lib/i18n/i18n.svelte.js';
	import { parseAddress } from '#lib/engine/index.js';
	import type { LadderDocument } from '#lib/ladder/document.svelte.js';
	import { blockers, explainRung } from '#lib/ladder/explain.js';
	import type { Monitor } from '#lib/ladder/monitor.js';
	import type { BoxType, Fbd, FbdValue } from '#lib/fbd/fbd.js';
	import { explainNetwork, whyZero } from '#lib/fbd/explain.js';

	type Props = {
		doc: LadderDocument;
		monitor: Monitor | null;
		language: 'ladder' | 'st' | 'sfc' | 'fbd';
		/** the FBD diagram, its box types and its live values (null offline) */
		fbd?: { fbd: Fbd; types: BoxType[]; live: ((v: FbdValue) => boolean | number | null) | null };
	};
	let { doc, monitor, language, fbd }: Props = $props();

	const fbdItems = $derived(
		language === 'fbd' && fbd
			? fbd.fbd.networks.map((n, i) => ({
					id: n.id,
					index: i + 1,
					text: explainNetwork(n, fbd.types, name),
					why: fbd.live ? whyZero(n, fbd.types, name, fbd.live) : null
				}))
			: []
	);

	let open = $state(true);
	let all = $state(false);

	const isAddress = (text: string) => {
		try {
			parseAddress(text);
			return true;
		} catch {
			return false;
		}
	};
	/** "Start (I0.0)" whichever of the two the program uses. */
	const name = (op: string) => {
		const other = doc.alias(op);
		if (!other) return op.trim() || '?';
		return isAddress(op) ? `${other} (${op.trim().toUpperCase()})` : `${op.trim()} (${other})`;
	};

	const rungs = $derived(all ? doc.program.rungs : doc.selectedRung ? [doc.selectedRung] : []);
	const items = $derived(
		rungs.map((r) => ({
			rung: r,
			index: doc.program.rungs.indexOf(r) + 1,
			text: explainRung(r, name),
			why: monitor ? blockers(r, monitor, name) : null
		}))
	);
</script>

<section aria-labelledby="explain-title">
	<button
		id="explain-title"
		class="mb-2 flex w-full items-center justify-between text-xs font-semibold tracking-wider text-sky-300 uppercase hover:text-sky-200"
		aria-expanded={open}
		onclick={() => (open = !open)}
	>
		{t('explain.title')}
		<span aria-hidden="true">{open ? '▾' : '▸'}</span>
	</button>

	{#if open}
		{#if language === 'fbd'}
			<ol class="space-y-3 text-xs leading-relaxed text-slate-300">
				{#each fbdItems as item (item.id)}
					<li class="rounded border border-slate-800 bg-slate-900/60 p-2">
						<p class="mb-1 font-mono text-[10px] text-slate-500">Network {item.index}</p>
						{#each item.text as sentence, i (i)}<p>{sentence}</p>{:else}<p class="text-slate-500">
								{t('explain.noCoil')}
							</p>{/each}
						{#if item.why}
							<p
								class="mt-1.5 rounded px-1.5 py-1 {item.why.length
									? 'bg-amber-400/10 text-amber-200'
									: 'bg-emerald-500/10 text-emerald-200'}"
								role="status"
							>
								{item.why.length ? item.why.join(' ') : t('explain.fbdOn')}
							</p>
						{/if}
					</li>
				{/each}
			</ol>
		{:else if language !== 'ladder'}
			<p class="text-xs text-slate-500">
				{t('explain.ladderOnly')}
			</p>
		{:else}
			<label class="mb-2 flex items-center gap-1.5 text-xs text-slate-400">
				<input type="checkbox" class="accent-sky-500" bind:checked={all} />
				{t('explain.whole')}
			</label>
			{#if items.length === 0}
				<p class="text-xs text-slate-500">
					{t('explain.click')}
				</p>
			{/if}
			<ol class="space-y-3 text-xs leading-relaxed text-slate-300">
				{#each items as item (item.rung.id)}
					<li class="rounded border border-slate-800 bg-slate-900/60 p-2">
						<button
							class="mb-1 font-mono text-[10px] text-slate-500 hover:text-slate-300"
							onclick={() => doc.select(item.rung.id)}>Network {item.index}</button
						>
						{#each item.text.results as sentence, i (i)}
							<p>{sentence}</p>
						{:else}
							<p class="text-slate-500">{t('explain.noCoil')}</p>
						{/each}
						{#if item.text.actions.length}
							<p class="mt-1 text-slate-400">
								Po drodze (gdy płynie zasilanie): {item.text.actions.join(', ')}.
							</p>
						{/if}
						{#if item.why}
							<p
								class="mt-1.5 rounded px-1.5 py-1 {item.why.length
									? 'bg-amber-400/10 text-amber-200'
									: 'bg-emerald-500/10 text-emerald-200'}"
								role="status"
							>
								{#if item.why.length}
									Teraz zasilanie nie dochodzi do cewek, bo: {item.why.join('; ')}.
								{:else}
									Teraz zasilanie dochodzi do cewek.
								{/if}
							</p>
						{/if}
					</li>
				{/each}
			</ol>
		{/if}
	{/if}
</section>
