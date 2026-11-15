<script lang="ts">
	import { onMount } from 'svelte';
	import { completedLessons } from '#lib/lessons/progress.js';
	import { solvedQuizzes } from '#lib/tutorial/progress.js';
	import { isDone, learningPath, nextStep, type PathStep } from './path.js';
	import StepLink from './StepLink.svelte';
	import { i18n, t } from '#lib/i18n/i18n.svelte.js';

	/** "Continue where you left off" — the next step of the learning path. */
	let { showWhenFresh = true }: { showWhenFresh?: boolean } = $props();

	const stages = $derived(learningPath(i18n.locale));
	const total = $derived(stages.reduce((n, s) => n + s.steps.length, 0));
	let slug = $state<string | null>(null);
	const next = $derived<PathStep | null>(
		stages.flatMap((s) => s.steps).find((s) => `${s.kind}:${s.slug}` === slug) ?? null
	);
	let done = $state(0);
	let ready = $state(false);

	onMount(() => {
		const p = { solvedQuizzes: solvedQuizzes(), lessonsDone: completedLessons() };
		const n = nextStep(stages, p);
		slug = n ? `${n.kind}:${n.slug}` : null;
		done = stages.flatMap((s) => s.steps).filter((s) => isDone(s, p)).length;
		ready = true;
	});
</script>

{#if ready && (done > 0 || showWhenFresh)}
	{#if next}
		<StepLink
			step={next}
			class="flex items-center gap-4 rounded-xl border border-emerald-500/40 bg-gradient-to-r from-emerald-500/15 to-transparent p-4 transition-colors hover:border-emerald-400"
		>
			<span
				class="grid size-11 shrink-0 place-items-center rounded-full bg-emerald-500 text-lg text-slate-950"
				aria-hidden="true">▶</span
			>
			<span class="min-w-0 flex-1" lang={i18n.locale}>
				<span class="block text-xs text-emerald-300"
					>{done === 0 ? t('learn.start') : t('learn.continue')} · {t('learn.steps', {
						done,
						total
					})}</span
				>
				<span class="block font-semibold text-white"
					>{next.kind === 'chapter' ? '📘' : next.debug ? '🐞' : '🛠'} {next.title}</span
				>
				<span class="block truncate text-sm text-slate-400">{next.summary}</span>
			</span>
			<span class="text-slate-400" aria-hidden="true">→</span>
		</StepLink>
	{:else}
		<p class="rounded-xl border border-emerald-500/40 p-4 text-sm text-emerald-200">
			{t('learn.allDone', { total })}
		</p>
	{/if}
{/if}
