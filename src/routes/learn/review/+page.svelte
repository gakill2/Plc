<script lang="ts">
	import { i18n, t } from '#lib/i18n/i18n.svelte.js';
	import PolishNote from '#lib/learn/PolishNote.svelte';
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';
	import Quiz from '#lib/tutorial/Quiz.svelte';
	import { solvedQuizzes } from '#lib/tutorial/progress.js';
	import {
		pickReview,
		recordAnswer,
		reviewItems,
		reviewStats,
		shuffled,
		type ReviewItem
	} from '#lib/tutorial/review.js';

	const SIZE = 5;
	let questions = $state.raw<ReviewItem[]>([]);
	let index = $state(0);
	/** First answer per question: true = right */
	let firsts = $state<Record<string, boolean>>({});
	let ready = $state(false);

	function start() {
		questions = pickReview(reviewItems(), reviewStats(), solvedQuizzes(), SIZE).map((q) =>
			shuffled(q)
		);
		index = 0;
		firsts = {};
		ready = true;
	}
	onMount(start);

	const current = $derived(questions[index] ?? null);
	const answered = $derived(current ? current.id in firsts : false);
	const finished = $derived(ready && index >= questions.length);
	const score = $derived(Object.values(firsts).filter(Boolean).length);

	function onAnswer(right: boolean) {
		if (!current || current.id in firsts) return;
		firsts[current.id] = right;
		recordAnswer(current.id, right);
	}
</script>

<svelte:head>
	<title>{t('learn.review')} · PLC Sim</title>
</svelte:head>

<section class="mx-auto max-w-2xl px-4 py-12" lang={i18n.locale}>
	<a href={resolve('/learn')} class="text-sm text-slate-400 hover:text-white"
		>← {t('learn.title')}</a
	>
	<h1 class="mt-3 text-3xl font-bold text-white">{t('learn.review')}</h1>
	<p class="mt-2 text-slate-400">{t('review.intro', { n: SIZE })}</p>
	<PolishNote />

	{#if ready && questions.length === 0}
		<p class="mt-8 text-slate-400">{t('review.empty')}</p>
	{:else if finished}
		<div class="mt-8 rounded-lg border border-slate-800 bg-slate-900/60 p-6 text-center">
			<p class="text-4xl font-bold text-white">{score} / {questions.length}</p>
			<p class="mt-2 text-slate-400">
				{score === questions.length ? t('review.perfect') : t('review.again')}
			</p>
			<ul class="mt-4 space-y-1 text-left text-sm">
				{#each questions as q (q.id)}
					<li class={firsts[q.id] ? 'text-emerald-300' : 'text-amber-300'}>
						{firsts[q.id] ? '✓' : '✗'}
						{q.question}
						<a
							href={resolve('/learn/basics/[slug]', { slug: q.chapter })}
							class="ml-1 text-xs text-slate-500 underline hover:text-slate-300">{q.chapterTitle}</a
						>
					</li>
				{/each}
			</ul>
			<button
				class="mt-6 rounded-md bg-sky-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-sky-400"
				onclick={start}>{t('review.new')}</button
			>
		</div>
	{:else if current}
		<div class="mt-8 mb-3 flex items-center justify-between text-xs text-slate-400">
			<span
				>{t('review.question', { n: index + 1, total: questions.length })} · {current.chapterTitle}</span
			>
			<span>{t('review.correct', { n: score })}</span>
		</div>
		{#key current.id}
			<Quiz
				question={current.question}
				options={current.options}
				correct={current.correct}
				explanation={current.explanation}
				solved={false}
				onSolved={() => {}}
				{onAnswer}
			/>
		{/key}
		<div class="mt-4 flex justify-end">
			<button
				class="rounded-md bg-sky-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-sky-400 disabled:opacity-40"
				disabled={!answered}
				onclick={() => index++}
			>
				{index + 1 < questions.length ? `${t('review.next')} →` : t('review.result')}
			</button>
		</div>
	{/if}
</section>
