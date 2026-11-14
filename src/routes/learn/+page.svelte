<script lang="ts">
	import { resolve } from '$app/paths';
	import { LESSONS, lessonProjectId } from '#lib/lessons/lessons.js';
	import { completedLessons } from '#lib/lessons/progress.js';
	import { onMount } from 'svelte';

	let done = $state<ReadonlySet<string>>(new Set());
	onMount(() => (done = completedLessons()));

	const LEVELS = {
		basics: 'bg-slate-700 text-slate-200',
		logic: 'bg-sky-500/20 text-sky-200',
		timers: 'bg-amber-500/20 text-amber-200',
		process: 'bg-pink-500/20 text-pink-200'
	} as const;
</script>

<svelte:head>
	<title>Learn · PLC Sim</title>
</svelte:head>

<section class="mx-auto max-w-4xl px-4 py-12">
	<h1 class="text-3xl font-bold text-white">Learn</h1>
	<p class="mt-2 max-w-2xl text-slate-400">
		Short hands-on lessons, from a single contact to controlling a simulated plant. Each one is
		checked automatically: your program runs against a set of test cases in a headless PLC.
	</p>
	<p class="mt-2 text-sm text-slate-500">{done.size} / {LESSONS.length} completed</p>

	<a
		href={resolve('/learn/basics')}
		lang="pl"
		class="mt-8 flex items-center gap-5 rounded-xl border border-sky-500/40 bg-gradient-to-r from-sky-500/15 to-transparent p-5 transition-colors hover:border-sky-400"
	>
		<span
			class="grid size-12 shrink-0 place-items-center rounded-full bg-sky-500 text-xl text-slate-950"
			>📘</span
		>
		<span class="min-w-0 flex-1">
			<span class="flex items-center gap-2">
				<span class="text-lg font-semibold text-white">Podstawy PLC — samouczek</span>
				<span class="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-300">PL</span>
			</span>
			<span class="block text-sm text-slate-400">
				Teoria krok po kroku z działającymi symulatorami i pytaniami: cykl skanowania, styki i
				cewki, timery, liczniki, ST, bezpieczeństwo. Plus słowniczek PL – EN.
			</span>
		</span>
		<span class="text-slate-400" aria-hidden="true">→</span>
	</a>

	<h2 class="mt-10 text-sm font-semibold tracking-wider text-slate-400 uppercase">
		Hands-on lessons
	</h2>

	<ol class="mt-3 space-y-3">
		{#each LESSONS as lesson, i (lesson.slug)}
			<li>
				<a
					href={resolve('/editor/[id]', { id: lessonProjectId(lesson.slug) })}
					class="flex items-center gap-4 rounded-lg border border-slate-800 bg-slate-900/50 p-4 transition-colors hover:border-slate-600"
				>
					<span
						class="grid size-9 shrink-0 place-items-center rounded-full font-mono text-sm {done.has(
							lesson.slug
						)
							? 'bg-emerald-500 text-slate-950'
							: 'bg-slate-800 text-slate-300'}"
					>
						{done.has(lesson.slug) ? '✓' : i + 1}
					</span>
					<div class="min-w-0 flex-1">
						<div class="flex flex-wrap items-center gap-2">
							<h2 class="font-semibold text-white">{lesson.title}</h2>
							<span class="rounded px-1.5 py-0.5 text-[10px] uppercase {LEVELS[lesson.level]}"
								>{lesson.level}</span
							>
							{#if lesson.scenario}
								<span
									class="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-300 uppercase"
								>
									plant: {lesson.scenario}
								</span>
							{/if}
						</div>
						<p class="mt-0.5 text-sm text-slate-400">{lesson.summary}</p>
					</div>
					<span class="text-slate-500" aria-hidden="true">→</span>
				</a>
			</li>
		{/each}
	</ol>
</section>
