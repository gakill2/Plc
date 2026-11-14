<script lang="ts">
	import { onMount } from 'svelte';
	import { beginShift, resumeHref } from '#lib/oncall/begin.js';
	import { getMachine, MACHINES } from '#lib/oncall/machines.js';
	import { downtimeMin, incidentOf, loadLog, type ShiftLog } from '#lib/oncall/shift.js';

	let log = $state<ShiftLog>({ current: null, history: [] });
	onMount(() => (log = loadLog()));

	const open = $derived(log.current && log.current.solvedAt === undefined ? log.current : null);
	const avg = $derived(
		log.history.length
			? (log.history.reduce((n, s) => n + (s.stars ?? 0), 0) / log.history.length).toFixed(1)
			: '–'
	);
	const total = $derived(log.history.reduce((n, s) => n + downtimeMin(s), 0));
</script>

<svelte:head>
	<title>Dyżur · PLC Sim</title>
</svelte:head>

<section class="mx-auto max-w-4xl px-4 py-12" lang="pl">
	<h1 class="text-3xl font-bold text-white">Dyżur: zmiana nocna</h1>
	<p class="mt-2 max-w-2xl text-slate-400">
		Jesteś na dyżurze utrzymania ruchu. Maszyny działały — aż coś się zepsuło: przewód, czujnik,
		stycznik, falownik. Program i okablowanie są dobre. Odtwórz objaw, znajdź uszkodzony element i
		zgłoś naprawę. Liczy się czas przestoju, a każda zbędna naprawa to {5} min więcej.
	</p>

	<div class="mt-6 flex flex-wrap items-center gap-3">
		{#if open}
			<a
				href={resumeHref(open.machine)}
				class="rounded-lg bg-orange-400 px-4 py-2 font-semibold text-slate-950 hover:bg-orange-300"
				>Wróć do wezwania: {getMachine(open.machine)?.name}</a
			>
		{/if}
		<button
			class="rounded-lg border border-orange-400/60 px-4 py-2 font-semibold text-orange-200 hover:bg-orange-500/10"
			onclick={() => beginShift()}>📞 Odbierz nowe wezwanie</button
		>
		<span class="text-sm text-slate-400"
			>Wezwania: <b class="text-white">{log.history.length}</b> · średnio
			<b class="text-white">{avg} ★</b> · przestoje łącznie
			<b class="text-white">{total} min</b></span
		>
	</div>

	<h2 class="mt-10 text-lg font-semibold text-white">Maszyny na dyżurze</h2>
	<ul class="mt-3 grid gap-3 sm:grid-cols-3">
		{#each MACHINES as m (m.id)}
			<li class="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
				<p class="font-medium text-white">{m.name}</p>
				<p class="text-xs text-slate-400">{m.area} · {m.incidents.length} możliwych usterek</p>
				<div class="mt-2 flex gap-3 text-xs">
					<button class="text-orange-300 underline" onclick={() => beginShift(m.id)}
						>Wezwanie</button
					>
					<a href={resumeHref(m.id)} class="text-slate-400 underline">Poznaj maszynę</a>
				</div>
			</li>
		{/each}
	</ul>

	{#if log.history.length}
		<h2 class="mt-10 text-lg font-semibold text-white">Ostatnie wezwania</h2>
		<ul class="mt-3 space-y-1 text-sm">
			{#each log.history.slice(0, 10) as s, i (i)}
				{@const inc = incidentOf(s)}
				<li class="flex gap-3 rounded border border-slate-800 px-3 py-2 text-slate-300">
					<span class="w-40 shrink-0 text-slate-400">{getMachine(s.machine)?.name}</span>
					<span class="min-w-0 flex-1 truncate">{inc?.cause}</span>
					<span class="text-slate-400">{downtimeMin(s)} min</span>
					<span class="text-amber-300"
						>{'★'.repeat(s.stars ?? 0)}{'☆'.repeat(3 - (s.stars ?? 0))}</span
					>
				</li>
			{/each}
		</ul>
	{/if}
</section>
