<script lang="ts">
	import type { RuntimeSnapshot } from '#lib/runtime/protocol.js';
	import { MAX_CYCLE_MS } from '#lib/engine/index.js';

	type Props = { snapshot: RuntimeSnapshot | null };
	let { snapshot }: Props = $props();

	const entries = $derived([...(snapshot?.diagnostics ?? [])].reverse());
	const c = $derived(snapshot?.cycle);
	const fmt = (ms: number) => (ms < 10 ? ms.toFixed(2) : ms.toFixed(1));
	const time = (ms: number) => `${(ms / 1000).toFixed(2)} s`;
	const COLORS = {
		info: 'text-slate-300',
		warning: 'text-amber-300',
		error: 'text-red-300'
	} as const;
	const ICONS = { info: 'ℹ', warning: '⚠', error: '✖' } as const;
</script>

<div class="h-full space-y-5 overflow-auto p-4" lang="pl">
	<section aria-labelledby="diag-cycle" class="space-y-2">
		<h2 id="diag-cycle" class="text-xs font-semibold tracking-wider text-slate-400 uppercase">
			Czas cyklu
		</h2>
		<div class="grid max-w-xl grid-cols-4 gap-2 font-mono text-sm">
			{#each [['ostatni', c?.lastMs], ['min', c?.minMs], ['max', c?.maxMs], ['program', c?.execMs]] as const as [label, v] (label)}
				<div class="rounded border border-slate-800 bg-slate-900 px-3 py-2">
					<div class="text-[10px] tracking-wider text-slate-500 uppercase">{label}</div>
					<div class="text-slate-100">{v === undefined ? '–' : `${fmt(v)} ms`}</div>
				</div>
			{/each}
		</div>
		<p class="max-w-2xl text-xs leading-relaxed text-slate-400">
			Minimalny czas cyklu to 10 ms: krótki program czeka na następny cykl. Program, który liczy
			dłużej (pętle), wydłuża cykl — timery i proces widzą prawdziwy czas. Przekroczenie
			<b>{MAX_CYCLE_MS} ms</b> wywołuje OB80 (błąd czasu), a bez niego zatrzymuje CPU. Szybkość: ok. 1
			µs na instrukcję IL.
		</p>
	</section>

	<section aria-labelledby="diag-buffer" class="space-y-2">
		<h2 id="diag-buffer" class="text-xs font-semibold tracking-wider text-slate-400 uppercase">
			Bufor diagnostyczny
		</h2>
		{#if entries.length === 0}
			<p class="text-xs text-slate-500">Pusto — uruchom PLC, żeby zobaczyć zdarzenia.</p>
		{:else}
			<table class="w-full max-w-4xl text-left text-xs" aria-label="Bufor diagnostyczny">
				<thead class="text-[10px] tracking-wider text-slate-500 uppercase">
					<tr>
						<th class="w-12 py-1 pr-2 font-medium">Nr</th>
						<th class="w-20 py-1 pr-2 font-medium">Czas</th>
						<th class="py-1 font-medium">Zdarzenie</th>
					</tr>
				</thead>
				<tbody>
					{#each entries as d (d.n)}
						<tr class="border-t border-slate-800 {COLORS[d.kind]}">
							<td class="py-1 pr-2 font-mono text-slate-500">{d.n}</td>
							<td class="py-1 pr-2 font-mono text-slate-500">{time(d.timeMs)}</td>
							<td class="py-1"><span aria-hidden="true">{ICONS[d.kind]}</span> {d.text}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		{/if}
	</section>

	<section aria-labelledby="diag-obs" class="max-w-2xl space-y-2 text-xs text-slate-400">
		<h2 id="diag-obs" class="text-xs font-semibold tracking-wider text-slate-400 uppercase">
			Bloki zdarzeń (ST)
		</h2>
		<pre
			class="rounded bg-slate-900 p-2 font-mono text-[11px] text-slate-300">ORGANIZATION_BLOCK OB100   (* rozruch: raz przed pierwszym cyklem *)
END_ORGANIZATION_BLOCK
ORGANIZATION_BLOCK OB121   (* błąd programowania, np. indeks tablicy *)
END_ORGANIZATION_BLOCK
ORGANIZATION_BLOCK OB80    (* przekroczony czas cyklu *)
END_ORGANIZATION_BLOCK</pre>
		<p>
			Piszesz je na końcu programu ST, po programie głównym. Bez OB121 i OB80 CPU przy błędzie
			przechodzi w STOP — jak S7-1500.
		</p>
	</section>
</div>
