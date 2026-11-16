<script lang="ts">
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';
	import { i18n, t } from '#lib/i18n/i18n.svelte.js';
	import { learningPath } from '#lib/learn/path.js';
	import {
		KIND_LABEL,
		KIND_LABEL_EN,
		portfolioEntries,
		portfolioMarkdown,
		type PortfolioEntry
	} from '#lib/learn/portfolio.js';
	import { ROLES, roleOf, savedRole, saveRole, type RoleId } from '#lib/learn/roles.js';
	import { completedLessons } from '#lib/lessons/progress.js';
	import { readProject } from '#lib/project/storage.js';
	import { CHAPTERS, quizCount } from '#lib/tutorial/chapters.js';
	import { chapterDone, solvedQuizzes } from '#lib/tutorial/progress.js';

	const NAME_KEY = 'plcsim:portfolio-name';

	let entries = $state<PortfolioEntry[]>([]);
	let chaptersDone = $state(0);
	let name = $state('');
	let roleId = $state<RoleId | null>(null);
	let ready = $state(false);
	const date = new Date().toISOString().slice(0, 10);
	const role = $derived(roleOf(roleId));
	const kindLabel = (k: string) => (i18n.locale === 'en' ? KIND_LABEL_EN : KIND_LABEL)[k] ?? k;

	onMount(() => {
		const done = completedLessons();
		entries = portfolioEntries(learningPath(i18n.locale), done, (slug) =>
			readProject(localStorage, `lesson-${slug}`)
		);
		const quizzes = solvedQuizzes();
		chaptersDone = CHAPTERS.filter((c) => chapterDone(c.slug, quizCount(c), quizzes)).length;
		try {
			name = localStorage.getItem(NAME_KEY) ?? '';
		} catch {
			name = '';
		}
		roleId = savedRole();
		ready = true;
	});

	function rememberName() {
		try {
			localStorage.setItem(NAME_KEY, name);
		} catch {
			// storage unavailable — the name stays for this visit
		}
	}

	function downloadMarkdown() {
		const text = portfolioMarkdown({
			name: name.trim(),
			role: role?.title.pl ?? null,
			date,
			chaptersDone,
			chaptersTotal: CHAPTERS.length,
			entries
		});
		const a = document.createElement('a');
		a.href = URL.createObjectURL(new Blob([text], { type: 'text/markdown' }));
		a.download = `portfolio-plc${name.trim() ? `-${name.trim().replace(/\s+/g, '_')}` : ''}.md`;
		a.click();
		URL.revokeObjectURL(a.href);
	}

	const kinds = $derived(
		Object.entries(
			entries.reduce<Record<string, number>>((m, e) => ((m[e.kind] = (m[e.kind] ?? 0) + 1), m), {})
		)
	);
</script>

<svelte:head>
	<title>{t('portfolio.title')} · PLC Sim</title>
</svelte:head>

<section class="mx-auto max-w-4xl px-4 py-12 print:max-w-none print:p-0" lang={i18n.locale}>
	<div class="print:hidden">
		<h1 class="text-3xl font-bold text-white">{t('portfolio.title')}</h1>
		<p class="mt-2 max-w-2xl text-slate-400">{t('portfolio.intro')}</p>

		<div class="mt-6 flex flex-wrap items-end gap-4">
			<label class="text-sm text-slate-400">
				{t('portfolio.name')}
				<input
					class="mt-1 block w-64 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-white"
					bind:value={name}
					oninput={rememberName}
				/>
			</label>
			<label class="text-sm text-slate-400">
				{t('portfolio.role')}
				<select
					class="mt-1 block rounded border border-slate-700 bg-slate-900 px-2 py-1 text-white"
					value={roleId ?? ''}
					onchange={(e) => {
						roleId = (e.currentTarget.value || null) as RoleId | null;
						saveRole(roleId);
					}}
				>
					<option value="">{t('learn.roleAll')}</option>
					{#each ROLES as r (r.id)}<option value={r.id}>{r.title[i18n.locale]}</option>{/each}
				</select>
			</label>
			<button
				class="rounded-md bg-sky-500 px-3 py-1.5 text-sm font-semibold text-slate-950 hover:bg-sky-400 disabled:opacity-50"
				disabled={!entries.length}
				onclick={() => window.print()}>{t('portfolio.print')}</button
			>
			<button
				class="rounded-md border border-slate-700 px-3 py-1.5 text-sm hover:border-slate-500 disabled:opacity-50"
				disabled={!entries.length}
				onclick={downloadMarkdown}>{t('portfolio.markdown')}</button
			>
		</div>
	</div>

	{#if ready && !entries.length}
		<p class="mt-8 rounded-lg border border-slate-800 bg-slate-900/40 p-4 text-sm text-slate-400">
			{t('portfolio.empty')}
			<a href={resolve('/learn')} class="text-sky-300 underline">{t('learn.title')}</a>
		</p>
	{:else if ready}
		<article class="mt-10 print:mt-0" aria-label={t('portfolio.title')}>
			<header class="border-b border-slate-800 pb-4 print:border-black">
				<h2 class="text-2xl font-bold text-white print:text-black">
					Portfolio PLC{name.trim() ? ` — ${name.trim()}` : ''}
				</h2>
				<p class="mt-1 text-sm text-slate-400 print:text-black">
					PLC Sim · {date}{role ? ` · ${role.title[i18n.locale]}` : ''}
				</p>
				<p class="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
					<span
						><b class="text-white print:text-black">{entries.length}</b>
						{t('portfolio.lessons')}</span
					>
					<span
						><b class="text-white print:text-black">{chaptersDone} / {CHAPTERS.length}</b>
						{t('portfolio.chapters')}</span
					>
					{#each kinds as [k, n] (k)}<span class="text-slate-400 print:text-black"
							>{kindLabel(k)}: {n}</span
						>{/each}
				</p>
				<p class="mt-2 text-xs text-slate-500 print:text-black">{t('portfolio.note')}</p>
			</header>

			{#each entries as e (e.slug)}
				<section class="mt-8 break-inside-avoid-page" lang="pl">
					<h3 class="text-lg font-semibold text-white print:text-black">{e.title}</h3>
					<p class="text-xs text-slate-500 print:text-black">
						{kindLabel(e.kind)} · {e.language}
					</p>
					<p class="mt-1 text-sm text-slate-300 print:text-black">
						{e.summary.replace(/\*\*/g, '')}
					</p>
					<p class="mt-3 text-xs font-semibold text-slate-400 print:text-black">
						{t('portfolio.tests')}
					</p>
					<ul class="mt-1 space-y-0.5 text-sm text-emerald-200 print:text-black">
						{#each e.tests as test, i (i)}<li>✓ {test}</li>{/each}
					</ul>
					{#if e.code}
						<details class="mt-3 print:block" open>
							<summary class="cursor-pointer text-xs font-semibold text-slate-400 print:hidden"
								>{t('portfolio.code')}</summary
							>
							<pre
								class="mt-1 max-h-96 overflow-auto rounded border border-slate-800 bg-slate-900 p-3 font-mono text-[11px] leading-snug text-slate-200 print:max-h-none print:overflow-visible print:border-black print:bg-white print:text-black">{e.code}</pre>
						</details>
					{:else}
						<p class="mt-2 text-xs text-slate-500 print:text-black">{t('portfolio.noCode')}</p>
					{/if}
				</section>
			{/each}
		</article>
	{/if}
</section>
