<script lang="ts">
	import { resolve } from '$app/paths';
	import type { CompiledLadder } from '#lib/ladder/compiler.js';
	import { markCompleted } from './progress.js';
	import RichText from './RichText.svelte';
	import { runLessonTests } from './runner.js';
	import type { Lesson, TestResult } from './types.js';

	type Props = {
		lesson: Lesson;
		compiled: CompiledLadder;
		blocked: boolean;
		onShowSolution: () => void;
		onRestart: () => void;
	};
	let { lesson, compiled, blocked, onShowSolution, onRestart }: Props = $props();

	let results = $state.raw<TestResult[] | null>(null);
	let hintsShown = $state(0);
	let checking = $state(false);

	const passed = $derived(results !== null && results.every((r) => r.passed));

	function check() {
		if (blocked) {
			results = [
				{ name: 'Program', passed: false, message: 'Fix the problems listed below first.' }
			];
			return;
		}
		checking = true;
		// let the button show its busy state, then run the (synchronous) simulation
		setTimeout(() => {
			results = runLessonTests(lesson, compiled.program);
			checking = false;
			if (results.every((r) => r.passed)) markCompleted(lesson.slug);
		}, 20);
	}
</script>

<section
	aria-labelledby="lesson-title"
	class="space-y-3 rounded-lg border border-sky-500/30 bg-sky-500/5 p-3"
>
	<div>
		<p class="text-[10px] font-semibold tracking-wider text-sky-300 uppercase">
			Lesson · {lesson.level}
		</p>
		<h2 id="lesson-title" class="text-sm font-semibold text-white">{lesson.title}</h2>
	</div>

	<div class="space-y-2 text-xs leading-relaxed text-slate-300">
		{#each lesson.instructions as p, i (i)}<p><RichText text={p} /></p>{/each}
	</div>

	<div class="flex flex-wrap gap-2">
		<button
			class="rounded-md bg-sky-500 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-sky-400 disabled:opacity-60"
			disabled={checking}
			onclick={check}
		>
			{checking ? 'Checking…' : 'Check my solution'}
		</button>
		{#if hintsShown < lesson.hints.length}
			<button
				class="rounded-md border border-slate-700 px-2.5 py-1.5 text-xs hover:border-slate-500"
				onclick={() => hintsShown++}
			>
				Hint {hintsShown + 1}/{lesson.hints.length}
			</button>
		{/if}
	</div>

	{#if hintsShown > 0}
		<ul class="space-y-1.5 text-xs text-amber-200/90">
			{#each lesson.hints.slice(0, hintsShown) as h, i (i)}<li>💡 <RichText text={h} /></li>{/each}
		</ul>
	{/if}

	{#if results}
		<ul class="space-y-1 text-xs" aria-live="polite">
			{#each results as r (r.name)}
				<li
					class="rounded px-2 py-1 {r.passed
						? 'bg-emerald-500/10 text-emerald-200'
						: 'bg-red-500/10 text-red-200'}"
				>
					{r.passed ? '✓' : '✗'}
					{r.name}
					{#if r.message}
						<div class="mt-0.5 text-[11px] text-red-300/90">
							{r.message}{#if r.atMs !== undefined}
								<span class="text-slate-500"> (at {(r.atMs / 1000).toFixed(2)} s)</span>{/if}
						</div>
					{/if}
				</li>
			{/each}
		</ul>
		{#if passed}
			<p class="rounded bg-emerald-500/15 px-2 py-1.5 text-xs font-semibold text-emerald-200">
				Lesson complete! <a href={resolve('/learn')} class="underline">Next lesson →</a>
			</p>
		{/if}
	{/if}

	<div class="flex gap-3 border-t border-slate-800 pt-2 text-[11px]">
		<button class="text-slate-400 underline hover:text-slate-200" onclick={onShowSolution}
			>Show solution</button
		>
		<button class="text-slate-400 underline hover:text-slate-200" onclick={onRestart}
			>Restart lesson</button
		>
	</div>
</section>
