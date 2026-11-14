<script lang="ts">
	import { onMount } from 'svelte';
	import { completedLessons } from '#lib/lessons/progress.js';
	import { solvedQuizzes } from '#lib/tutorial/progress.js';
	import { isDone, learningPath, nextStep, type PathStep } from './path.js';
	import StepLink from './StepLink.svelte';

	/** "Continue where you left off" — the next step of the learning path. */
	let { showWhenFresh = true }: { showWhenFresh?: boolean } = $props();

	const stages = learningPath();
	const total = stages.reduce((n, s) => n + s.steps.length, 0);
	let next = $state<PathStep | null>(null);
	let done = $state(0);
	let ready = $state(false);

	onMount(() => {
		const p = { solvedQuizzes: solvedQuizzes(), lessonsDone: completedLessons() };
		next = nextStep(stages, p);
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
			<span class="min-w-0 flex-1" lang="pl">
				<span class="block text-xs text-emerald-300"
					>{done === 0 ? 'Zacznij naukę' : 'Kontynuuj naukę'} · {done}/{total} kroków</span
				>
				<span class="block font-semibold text-white"
					>{next.kind === 'chapter' ? '📘' : next.debug ? '🐞' : '🛠'} {next.title}</span
				>
				<span class="block truncate text-sm text-slate-400">{next.summary}</span>
			</span>
			<span class="text-slate-400" aria-hidden="true">→</span>
		</StepLink>
	{:else}
		<p class="rounded-xl border border-emerald-500/40 p-4 text-sm text-emerald-200" lang="pl">
			🎉 Cała ścieżka ukończona ({total}/{total}). Spróbuj własnego projektu z linią produkcyjną.
		</p>
	{/if}
{/if}
