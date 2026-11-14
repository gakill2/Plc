<script lang="ts">
	import { resolve } from '$app/paths';
	import type { CompiledLadder } from '#lib/ladder/compiler.js';
	import type { LadderProgram } from '#lib/ladder/model.js';
	import type { Circuit } from '#lib/circuit/model.js';
	import type { SymbolMap } from '#lib/symbols/symbols.js';
	import { addressResolver, GUIDES } from './guide.js';
	import { onMount } from 'svelte';
	import { completedLessons, markCompleted } from './progress.js';
	import RichText from './RichText.svelte';
	import { runLessonTests } from './runner.js';
	import type { Lesson, TestResult } from './types.js';

	type Props = {
		lesson: Lesson;
		compiled: CompiledLadder;
		blocked: boolean;
		onShowSolution: () => void;
		onRestart: () => void;
		ladder: LadderProgram;
		symbols: SymbolMap;
		online: boolean;
		language: 'ladder' | 'st';
		circuit: Circuit;
	};
	let {
		lesson,
		compiled,
		blocked,
		onShowSolution,
		onRestart,
		ladder,
		symbols,
		online,
		language,
		circuit
	}: Props = $props();

	let results = $state.raw<TestResult[] | null>(null);
	let hintsShown = $state(0);
	let checking = $state(false);

	const LEVELS = {
		basics: 'podstawy',
		logic: 'logika',
		timers: 'timery',
		process: 'proces'
	} as const;
	const passed = $derived(results !== null && results.every((r) => r.passed));
	let completedBefore = $state(false);
	onMount(() => (completedBefore = completedLessons().has(lesson.slug)));

	/* live step-by-step guide */
	const guide = $derived(GUIDES[lesson.slug] ?? []);
	const ticks = $derived.by(() => {
		const ctx = {
			ladder,
			circuit,
			addr: addressResolver(symbols),
			online,
			passed: passed || completedBefore
		};
		return guide.map((step) => step.done(ctx));
	});
	const nextStep = $derived(ticks.indexOf(false));

	function check() {
		if (blocked) {
			results = [
				{ name: 'Program', passed: false, message: 'Najpierw popraw błędy z listy Problems.' }
			];
			return;
		}
		checking = true;
		// let the button show its busy state, then run the (synchronous) simulation
		setTimeout(() => {
			results = runLessonTests(lesson, compiled.program, $state.snapshot(circuit) as Circuit);
			checking = false;
			if (results.every((r) => r.passed)) markCompleted(lesson.slug);
		}, 20);
	}
</script>

<section
	lang="pl"
	aria-labelledby="lesson-title"
	class="space-y-3 rounded-lg border border-sky-500/30 bg-sky-500/5 p-3"
>
	<div>
		<p class="text-[10px] font-semibold tracking-wider text-sky-300 uppercase">
			{lesson.kind === 'debug'
				? '🐞 Znajdź błąd'
				: lesson.kind === 'commissioning'
					? '🔧 Uruchomienie'
					: 'Ćwiczenie'} · {LEVELS[lesson.level]}
		</p>
		<h2 id="lesson-title" class="text-sm font-semibold text-white">{lesson.title}</h2>
	</div>

	<div class="space-y-2 text-xs leading-relaxed text-slate-300">
		{#each lesson.instructions as p, i (i)}<p><RichText text={p} /></p>{/each}
	</div>

	{#if guide.length && (language === 'ladder' || lesson.kind === 'commissioning')}
		<div lang="pl">
			<p class="mb-1 text-[10px] font-semibold tracking-wider text-sky-300 uppercase">
				Krok po kroku · {ticks.filter(Boolean).length}/{guide.length}
			</p>
			<ol class="space-y-1 text-xs" aria-label="Krok po kroku">
				{#each guide as step, i (i)}
					<li
						class="flex gap-2 rounded px-1.5 py-1 {i === nextStep
							? 'bg-sky-500/15 text-white ring-1 ring-sky-500/40'
							: ticks[i]
								? 'text-slate-400'
								: 'text-slate-500'}"
						aria-current={i === nextStep ? 'step' : undefined}
					>
						<span
							class="mt-px grid size-4 shrink-0 place-items-center rounded-full text-[10px] {ticks[
								i
							]
								? 'bg-emerald-500 text-slate-950'
								: 'border border-slate-600'}"
							aria-label={ticks[i] ? 'zrobione' : 'do zrobienia'}>{ticks[i] ? '✓' : i + 1}</span
						>
						<span class="leading-relaxed"><RichText text={step.text} /></span>
					</li>
				{/each}
			</ol>
		</div>
	{/if}

	<div class="flex flex-wrap gap-2">
		<button
			class="rounded-md bg-sky-500 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-sky-400 disabled:opacity-60"
			disabled={checking}
			onclick={check}
		>
			{checking ? 'Sprawdzam…' : 'Sprawdź rozwiązanie'}
		</button>
		{#if hintsShown < lesson.hints.length}
			<button
				class="rounded-md border border-slate-700 px-2.5 py-1.5 text-xs hover:border-slate-500"
				onclick={() => hintsShown++}
			>
				Podpowiedź {hintsShown + 1}/{lesson.hints.length}
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
								<span class="text-slate-500"> (w {(r.atMs / 1000).toFixed(2)} s)</span>{/if}
						</div>
					{/if}
				</li>
			{/each}
		</ul>
		{#if passed}
			<p class="rounded bg-emerald-500/15 px-2 py-1.5 text-xs font-semibold text-emerald-200">
				Zaliczone! <a href={resolve('/learn')} class="underline">Dalej na ścieżce →</a>
			</p>
		{/if}
	{/if}

	<div class="flex gap-3 border-t border-slate-800 pt-2 text-[11px]">
		<button class="text-slate-400 underline hover:text-slate-200" onclick={onShowSolution}
			>Pokaż rozwiązanie</button
		>
		<button class="text-slate-400 underline hover:text-slate-200" onclick={onRestart}
			>Zacznij od nowa</button
		>
	</div>
</section>
