<script lang="ts">
	import { FLOWS, grade, ZONES } from '#lib/net/it.js';

	let decisions = $state<Record<string, boolean | undefined>>({});
	let checked = $state(false);
	const result = $derived(grade(decisions));
	const all = $derived(FLOWS.every((f) => decisions[f.id] !== undefined));
</script>

<figure class="space-y-3 rounded-xl border border-slate-800 bg-slate-900/60 p-4 text-xs" lang="pl">
	<figcaption class="text-sm font-semibold text-white">
		Ćwiczenie: reguły firewalla między IT a OT
	</figcaption>
	<p class="text-slate-400">
		Strefy: <b class="text-slate-200">Biuro</b> → <b class="text-slate-200">DMZ</b> →
		<b class="text-slate-200">sieć maszyn</b>. Zdecyduj dla każdego połączenia: przepuścić czy
		zablokować?
	</p>
	<table class="w-full">
		<thead class="text-left text-slate-500">
			<tr
				><th class="py-1">Skąd → dokąd</th><th>Usługa</th><th>Co</th><th class="text-right"
					>Decyzja</th
				></tr
			>
		</thead>
		<tbody>
			{#each result.results as r (r.flow.id)}
				<tr class="border-t border-slate-800 align-top">
					<td class="py-1.5 pr-2 text-slate-300">{ZONES[r.flow.from]} → {ZONES[r.flow.to]}</td>
					<td class="pr-2 font-mono text-slate-400">{r.flow.service}</td>
					<td class="pr-2 text-slate-300">
						{r.flow.what}
						{#if checked}
							<p class="mt-0.5 {r.ok ? 'text-emerald-300' : 'text-red-300'}">
								{r.ok ? '✓' : '✗'}
								{r.flow.why}
							</p>
						{/if}
					</td>
					<td class="text-right whitespace-nowrap">
						<div role="radiogroup" aria-label="Decyzja: {r.flow.what}" class="inline-flex gap-1">
							<button
								role="radio"
								aria-checked={decisions[r.flow.id] === true}
								class="rounded border px-1.5 py-0.5 {decisions[r.flow.id] === true
									? 'border-emerald-400 bg-emerald-500/20 text-white'
									: 'border-slate-700 text-slate-400'}"
								onclick={() => (decisions[r.flow.id] = true)}>przepuść</button
							>
							<button
								role="radio"
								aria-checked={decisions[r.flow.id] === false}
								class="rounded border px-1.5 py-0.5 {decisions[r.flow.id] === false
									? 'border-red-400 bg-red-500/20 text-white'
									: 'border-slate-700 text-slate-400'}"
								onclick={() => (decisions[r.flow.id] = false)}>zablokuj</button
							>
						</div>
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
	<div class="flex items-center gap-3">
		<button
			class="rounded bg-sky-500 px-3 py-1.5 font-semibold text-slate-950 disabled:opacity-50"
			disabled={!all}
			onclick={() => (checked = true)}>Sprawdź reguły</button
		>
		{#if checked}
			<span
				role="status"
				class={result.correct === FLOWS.length ? 'text-emerald-300' : 'text-amber-300'}
				>Dobrze: {result.correct} / {FLOWS.length}. Zasada: domyślnie blokuj, przepuszczaj tylko to,
				co konkretnie potrzebne.</span
			>
		{/if}
	</div>
</figure>
