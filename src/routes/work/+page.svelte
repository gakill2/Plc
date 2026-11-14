<script lang="ts">
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';
	import { lessonProjectId } from '#lib/lessons/lessons.js';
	import {
		career,
		downtime,
		isUnlocked,
		loadStory,
		totalStars,
		type StoryProgress
	} from '#lib/story/progress.js';
	import { PRIORITY_STYLE, TICKETS, WEEKS } from '#lib/story/tickets.js';

	let progress = $state<StoryProgress>({});
	onMount(() => (progress = loadStory()));

	const stars = $derived(totalStars(progress));
	const level = $derived(career(stars));
	const solved = $derived(TICKETS.filter((t) => progress[t.id]?.solvedAt !== undefined).length);
	const cost = $derived(
		TICKETS.reduce((n, t) => {
			const r = progress[t.id];
			return r?.solvedAt !== undefined ? n + downtime(r, t.costPerHour).cost : n;
		}, 0)
	);
	const levelSpan = $derived(
		level.next ? (stars - level.current.stars) / (level.next.stars - level.current.stars) : 1
	);

	const href = (id: string, lesson: string) =>
		`${resolve('/editor/[id]', { id: lessonProjectId(lesson) })}?ticket=${id}`;
	const starText = (n = 0) => '★'.repeat(n) + '☆'.repeat(3 - n);
</script>

<svelte:head>
	<title>Zgłoszenia · PLC Sim</title>
</svelte:head>

<section class="mx-auto max-w-4xl px-4 py-12" lang="pl">
	<h1 class="text-3xl font-bold text-white">Zgłoszenia z hali</h1>
	<p class="mt-2 max-w-2xl text-slate-400">
		Jesteś nowym automatykiem w zakładzie. Mistrz zmiany, utrzymanie ruchu i technolog przysyłają
		zgłoszenia: coś zbudować, coś naprawić, coś uruchomić. Każde zgłoszenie to zadanie w edytorze —
		oceniane gwiazdkami za liczbę prób i podpowiedzi. Maszyna stoi, dopóki nie skończysz.
	</p>

	<div class="mt-6 grid gap-3 sm:grid-cols-3">
		<div class="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 sm:col-span-2">
			<p class="text-xs font-semibold tracking-wider text-amber-300 uppercase">Stanowisko</p>
			<p class="mt-1 text-xl font-bold text-white" data-testid="career">{level.current.title}</p>
			<div class="mt-2 h-1.5 overflow-hidden rounded bg-slate-800">
				<div class="h-full bg-amber-400" style:width="{levelSpan * 100}%"></div>
			</div>
			<p class="mt-1 text-xs text-slate-400">
				{#if level.next}
					{stars} ★ · awans na „{level.next.title}” przy {level.next.stars} ★
				{:else}
					{stars} ★ · najwyższe stanowisko!
				{/if}
			</p>
		</div>
		<div class="rounded-xl border border-slate-800 bg-slate-900/60 p-4 text-sm text-slate-300">
			<p>Zamknięte: <b class="text-white">{solved} / {TICKETS.length}</b></p>
			<p class="mt-1">
				Koszt przestojów: <b class="text-white">{cost.toLocaleString('pl-PL')} zł</b>
			</p>
		</div>
	</div>

	{#each WEEKS as week (week.week)}
		<h2 class="mt-10 text-lg font-semibold text-white">{week.title}</h2>
		<p class="text-sm text-slate-500">{week.summary}</p>
		<ul class="mt-3 space-y-2">
			{#each TICKETS.filter((t) => t.week === week.week) as t (t.id)}
				{@const r = progress[t.id]}
				{@const open = isUnlocked(t.id, progress)}
				<li>
					{#if open}
						<!-- eslint-disable svelte/no-navigation-without-resolve -- resolve() + ?ticket query -->
						<a
							href={href(t.id, t.lesson)}
							class="flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-900/60 p-3 transition-colors hover:border-sky-500/60"
						>
							<span class="w-10 font-mono text-xs text-slate-500">#{t.id.slice(1)}</span>
							<span class="min-w-0 flex-1">
								<span class="block font-medium text-white">{t.title}</span>
								<span class="block text-xs text-slate-400">{t.machine} · {t.from}</span>
							</span>
							<span class="rounded px-1.5 py-0.5 text-[10px] uppercase {PRIORITY_STYLE[t.priority]}"
								>{t.priority}</span
							>
							{#if r?.solvedAt !== undefined}
								<span class="w-12 text-right text-amber-300" aria-label="{r.stars} z 3 gwiazdek"
									>{starText(r.stars)}</span
								>
							{:else}
								<span class="w-12 text-right text-xs text-sky-300">{r ? 'w toku' : 'nowe'}</span>
							{/if}
						</a>
						<!-- eslint-enable svelte/no-navigation-without-resolve -->
					{:else}
						<div
							class="flex items-center gap-3 rounded-lg border border-slate-900 p-3 text-slate-600"
							aria-disabled="true"
						>
							<span class="w-10 font-mono text-xs">#{t.id.slice(1)}</span>
							<span class="flex-1">{t.title}</span>
							<span aria-label="zablokowane">🔒</span>
						</div>
					{/if}
				</li>
			{/each}
		</ul>
	{/each}
</section>
