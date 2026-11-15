<script lang="ts">
	import { resolve } from '$app/paths';
	import { CHAPTERS, getChapter } from '#lib/tutorial/chapters.js';
	import ChapterView from '#lib/tutorial/ChapterView.svelte';
	import PolishNote from '#lib/learn/PolishNote.svelte';
	import { localized } from '#lib/learn/path.js';
	import { i18n, t } from '#lib/i18n/i18n.svelte.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	// chapters hold functions (ladder factories), so they are looked up here rather than passed through load
	const chapter = $derived(getChapter(data.slug)!);
	const prev = $derived(data.prev ? getChapter(data.prev) : null);
	const next = $derived(data.next ? getChapter(data.next) : null);
	const title = (c: { slug: string; title: string; summary: string }) =>
		localized({ ...c, kind: 'chapter' }, i18n.locale).title;
</script>

<svelte:head>
	<title>{title(chapter)} · {t('learn.basics')}</title>
	<meta name="description" content={chapter.summary} />
</svelte:head>

<div class="mx-auto grid max-w-6xl gap-10 px-4 py-10 lg:grid-cols-[14rem_minmax(0,1fr)]">
	<nav class="hidden lg:block" aria-label={t('learn.chapters')} lang={i18n.locale}>
		<div class="sticky top-6 space-y-1 text-sm">
			<a
				href={resolve('/learn/basics')}
				class="mb-3 block font-semibold text-slate-300 hover:text-white">{t('learn.basics')}</a
			>
			{#each CHAPTERS as c, i (c.slug)}
				<a
					href={resolve('/learn/basics/[slug]', { slug: c.slug })}
					class="block rounded px-2 py-1 {c.slug === chapter.slug
						? 'bg-slate-800 text-white'
						: 'text-slate-400 hover:text-white'}"
					aria-current={c.slug === chapter.slug ? 'page' : undefined}
				>
					<span class="font-mono text-xs text-slate-500">{i + 1}.</span>
					{title(c)}
				</a>
			{/each}
			<a href={resolve('/learn/glossary')} class="mt-3 block px-2 text-sky-300 hover:text-sky-200"
				>{t('learn.glossary')}</a
			>
		</div>
	</nav>

	<article class="min-w-0">
		<p class="text-xs font-semibold tracking-wider text-sky-300 uppercase" lang={i18n.locale}>
			{t('learn.chapterOf', { n: data.index + 1, total: CHAPTERS.length })} · {chapter.minutes} min
		</p>
		<h1 class="mt-1 mb-6 text-3xl font-bold text-white" lang={i18n.locale}>{title(chapter)}</h1>
		<PolishNote />

		<div lang="pl">
			{#key chapter.slug}
				<ChapterView {chapter} />
			{/key}
		</div>

		<nav
			class="mt-12 grid gap-3 border-t border-slate-800 pt-6 sm:grid-cols-2"
			aria-label={t('learn.prevNext')}
			lang={i18n.locale}
		>
			{#if prev}
				<a
					href={resolve('/learn/basics/[slug]', { slug: prev.slug })}
					class="rounded-lg border border-slate-800 p-4 hover:border-slate-600"
				>
					<span class="block text-xs text-slate-500">← {t('learn.prev')}</span>
					<span class="font-semibold text-slate-200">{title(prev)}</span>
				</a>
			{:else}
				<span></span>
			{/if}
			{#if next}
				<a
					href={resolve('/learn/basics/[slug]', { slug: next.slug })}
					class="rounded-lg border border-slate-800 p-4 text-right hover:border-slate-600"
				>
					<span class="block text-xs text-slate-500">{t('learn.next')} →</span>
					<span class="font-semibold text-slate-200">{title(next)}</span>
				</a>
			{:else}
				<a
					href={resolve('/learn')}
					class="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-4 text-right hover:border-emerald-400"
				>
					<span class="block text-xs text-emerald-300">{t('learn.end')}</span>
					<span class="font-semibold text-white">{t('learn.toLessons')} →</span>
				</a>
			{/if}
		</nav>
	</article>
</div>
