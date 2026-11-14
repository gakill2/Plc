<script lang="ts">
	import { resolve } from '$app/paths';
	import { CHAPTERS, getChapter } from '#lib/tutorial/chapters.js';
	import ChapterView from '#lib/tutorial/ChapterView.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	// chapters hold functions (ladder factories), so they are looked up here rather than passed through load
	const chapter = $derived(getChapter(data.slug)!);
	const prev = $derived(data.prev ? getChapter(data.prev) : null);
	const next = $derived(data.next ? getChapter(data.next) : null);
</script>

<svelte:head>
	<title>{chapter.title} · Podstawy PLC</title>
	<meta name="description" content={chapter.summary} />
</svelte:head>

<div class="mx-auto grid max-w-6xl gap-10 px-4 py-10 lg:grid-cols-[14rem_minmax(0,1fr)]" lang="pl">
	<nav class="hidden lg:block" aria-label="Rozdziały">
		<div class="sticky top-6 space-y-1 text-sm">
			<a
				href={resolve('/learn/basics')}
				class="mb-3 block font-semibold text-slate-300 hover:text-white">Podstawy PLC</a
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
					{c.title}
				</a>
			{/each}
			<a href={resolve('/learn/glossary')} class="mt-3 block px-2 text-sky-300 hover:text-sky-200"
				>Słowniczek PL – EN</a
			>
		</div>
	</nav>

	<article class="min-w-0">
		<p class="text-xs font-semibold tracking-wider text-sky-300 uppercase">
			Rozdział {data.index + 1} z {CHAPTERS.length} · {chapter.minutes} min
		</p>
		<h1 class="mt-1 mb-6 text-3xl font-bold text-white">{chapter.title}</h1>

		{#key chapter.slug}
			<ChapterView {chapter} />
		{/key}

		<nav
			class="mt-12 grid gap-3 border-t border-slate-800 pt-6 sm:grid-cols-2"
			aria-label="Następny i poprzedni rozdział"
		>
			{#if prev}
				<a
					href={resolve('/learn/basics/[slug]', { slug: prev.slug })}
					class="rounded-lg border border-slate-800 p-4 hover:border-slate-600"
				>
					<span class="block text-xs text-slate-500">← Poprzedni</span>
					<span class="font-semibold text-slate-200">{prev.title}</span>
				</a>
			{:else}
				<span></span>
			{/if}
			{#if next}
				<a
					href={resolve('/learn/basics/[slug]', { slug: next.slug })}
					class="rounded-lg border border-slate-800 p-4 text-right hover:border-slate-600"
				>
					<span class="block text-xs text-slate-500">Następny →</span>
					<span class="font-semibold text-slate-200">{next.title}</span>
				</a>
			{:else}
				<a
					href={resolve('/learn')}
					class="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-4 text-right hover:border-emerald-400"
				>
					<span class="block text-xs text-emerald-300">Koniec samouczka</span>
					<span class="font-semibold text-white">Przejdź do lekcji praktycznych →</span>
				</a>
			{/if}
		</nav>
	</article>
</div>
