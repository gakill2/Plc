<script lang="ts">
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';
	import { CHAPTERS, quizCount } from '#lib/tutorial/chapters.js';
	import { chapterDone, solvedQuizzes } from '#lib/tutorial/progress.js';
	import { localized } from '#lib/learn/path.js';
	import { i18n, t } from '#lib/i18n/i18n.svelte.js';
	const chapters = $derived(CHAPTERS.map((c) => localized({ ...c, kind: 'chapter' }, i18n.locale)));

	let solved = $state<ReadonlySet<string>>(new Set());
	onMount(() => (solved = solvedQuizzes()));

	const done = $derived(CHAPTERS.filter((c) => chapterDone(c.slug, quizCount(c), solved)).length);
	const total = CHAPTERS.reduce((sum, c) => sum + c.minutes, 0);
</script>

<svelte:head>
	<title>{t('learn.basics')} · PLC Sim</title>
</svelte:head>

<section class="mx-auto max-w-4xl px-4 py-12" lang={i18n.locale}>
	<a href={resolve('/learn')} class="text-sm text-slate-400 hover:text-white">← Learn</a>
	<h1 class="mt-3 text-3xl font-bold text-white">{t('learn.basics')}</h1>
	<p class="mt-2 max-w-2xl text-slate-400">{t('learn.basicsIntro')}</p>
	<div class="mt-4 flex flex-wrap items-center gap-4 text-sm">
		<span class="text-slate-400">{t('learn.chaptersTime', { n: CHAPTERS.length, min: total })}</span
		>
		<span class="text-slate-400"
			>{t('learn.done')}: <b class="text-white">{done} / {CHAPTERS.length}</b></span
		>
		<a href={resolve('/learn/glossary')} class="text-sky-300 underline hover:text-sky-200"
			>{t('learn.glossary')}</a
		>
	</div>
	<div class="mt-3 h-1.5 max-w-md overflow-hidden rounded bg-slate-800">
		<div
			class="h-full bg-emerald-400 transition-all"
			style:width="{(done / CHAPTERS.length) * 100}%"
		></div>
	</div>

	<ol class="mt-8 space-y-2">
		{#each chapters as c, i (c.slug)}
			{@const isDone = chapterDone(c.slug, quizCount(c), solved)}
			<li>
				<a
					href={resolve('/learn/basics/[slug]', { slug: c.slug })}
					class="flex items-center gap-4 rounded-lg border border-slate-800 bg-slate-900/50 p-4 transition-colors hover:border-slate-600"
				>
					<span
						class="grid size-9 shrink-0 place-items-center rounded-full font-mono text-sm {isDone
							? 'bg-emerald-500 text-slate-950'
							: 'bg-slate-800 text-slate-300'}"
					>
						{isDone ? '✓' : i + 1}
					</span>
					<span class="min-w-0 flex-1">
						<span class="block font-semibold text-white">{c.title}</span>
						<span class="block text-sm text-slate-400">{c.summary}</span>
					</span>
					<span class="shrink-0 text-xs text-slate-500">{c.minutes} min</span>
				</a>
			</li>
		{/each}
	</ol>
</section>
