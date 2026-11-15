<script lang="ts">
	import type { Warning } from '#lib/analysis/analysis.js';
	import type { Problem } from '#lib/project/state.svelte.js';
	import { t } from '#lib/i18n/i18n.svelte.js';

	type Props = {
		problems: Problem[];
		warnings: Warning[];
		/** briefly highlight the list (a download was refused) */
		flash: boolean;
		loadError: string | null;
		/** ladder: rung of a warning */
		place: ((owner: string) => string) | null;
		onProblem: (p: Problem) => void;
		onWarning: (owner: string | null) => void;
	};
	let { problems, warnings, flash, loadError, place, onProblem, onWarning }: Props = $props();
	const SOURCES = {
		program: 'problems.program',
		circuit: 'problems.circuit',
		symbols: 'problems.symbols',
		hardware: 'problems.hardware',
		safety: 'problems.safety'
	} as const;
</script>

<section aria-labelledby="problems-title">
	<h2
		id="problems-title"
		class="mb-2 text-xs font-semibold tracking-wider uppercase {problems.length
			? 'text-red-400'
			: 'text-slate-400'}"
	>
		{t('problems.title')} ({problems.length})
	</h2>
	{#if problems.length === 0}
		<p class="text-xs text-slate-500">{t('problems.none')}</p>
	{:else}
		<ul class="space-y-1 text-xs {flash ? 'animate-pulse' : ''}">
			{#each problems as p, i (i)}
				<li>
					<button
						class="w-full rounded bg-red-500/10 px-2 py-1.5 text-left text-red-200 hover:bg-red-500/20"
						onclick={() => onProblem(p)}
					>
						<span class="text-[10px] text-red-400 uppercase">{t(SOURCES[p.source])}</span>
						{p.message}
					</button>
				</li>
			{/each}
		</ul>
	{/if}
	{#if warnings.length}
		<h3 class="mt-3 mb-1 text-xs font-semibold tracking-wider text-amber-400 uppercase">
			{t('problems.warnings')} ({warnings.length})
		</h3>
		<ul class="space-y-1 text-xs" aria-label={t('problems.warnings')}>
			{#each warnings as w, i (i)}
				<li>
					<button
						class="w-full rounded bg-amber-400/10 px-2 py-1.5 text-left text-amber-100 hover:bg-amber-400/20"
						onclick={() => onWarning(w.id)}
					>
						{#if w.id && place}
							<span class="text-[10px] text-amber-400">{place(w.id)}</span>
						{/if}
						{w.message}
					</button>
				</li>
			{/each}
		</ul>
	{/if}
	{#if loadError}
		<p class="mt-2 rounded bg-red-500/10 px-2 py-1 text-xs text-red-200">{loadError}</p>
	{/if}
</section>
