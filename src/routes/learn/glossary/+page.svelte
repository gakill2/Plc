<script lang="ts">
	import { resolve } from '$app/paths';
	import { getChapter } from '#lib/tutorial/chapters.js';
	import { GLOSSARY } from '#lib/tutorial/glossary.js';
	import { localized } from '#lib/learn/path.js';
	import { i18n, t } from '#lib/i18n/i18n.svelte.js';

	let query = $state('');
	const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
	const entries = $derived(
		[...GLOSSARY]
			.sort((a, b) => a.pl.localeCompare(b.pl, 'pl'))
			.filter(
				(e) => !query.trim() || norm(`${e.pl} ${e.en} ${e.text}`).includes(norm(query.trim()))
			)
	);
</script>

<svelte:head>
	<title>{t('learn.glossary')} · PLC Sim</title>
</svelte:head>

<section class="mx-auto max-w-4xl px-4 py-12" lang={i18n.locale}>
	<a href={resolve('/learn/basics')} class="text-sm text-slate-400 hover:text-white"
		>← {t('learn.basics')}</a
	>
	<h1 class="mt-3 text-3xl font-bold text-white">{t('learn.glossary')}</h1>
	<p class="mt-2 text-slate-400">{t('glossary.intro')}</p>

	<input
		class="mt-6 w-full max-w-sm rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-sky-400"
		placeholder={t('glossary.placeholder')}
		bind:value={query}
		aria-label={t('glossary.search')}
	/>

	<dl class="mt-6 divide-y divide-slate-800 rounded-lg border border-slate-800">
		{#each entries as e (e.pl)}
			{@const chapter = e.chapter ? getChapter(e.chapter) : null}
			<div class="grid gap-1 p-4 sm:grid-cols-[1fr_1fr_2fr] sm:gap-4">
				<dt class="font-semibold text-white">{e.pl}</dt>
				<dd class="text-sky-300 italic">{e.en}</dd>
				<dd class="text-sm text-slate-400" lang="pl">
					{e.text}
					{#if chapter}
						<a
							href={resolve('/learn/basics/[slug]', { slug: chapter.slug })}
							class="ml-1 whitespace-nowrap text-sky-300 hover:underline"
						>
							→ {localized({ ...chapter, kind: 'chapter' }, i18n.locale).title}
						</a>
					{/if}
				</dd>
			</div>
		{:else}
			<p class="p-4 text-sm text-slate-500">{t('glossary.none')}</p>
		{/each}
	</dl>
</section>
