<script lang="ts">
	import { t } from '#lib/i18n/i18n.svelte.js';
	import type { XrefEntry } from '#lib/analysis/analysis.js';

	type Props = {
		entries: readonly XrefEntry[];
		/** address → symbol name */
		names: ReadonlyMap<string, string>;
		/** Short place label for an owner, e.g. "N2" or "line 7". */
		place: (owner: string) => string;
		selectedId: string | null;
		onJump: (owner: string) => void;
	};
	let { entries, names, place, selectedId, onJump }: Props = $props();

	let open = $state(false);
	let filter = $state('');

	const KIND: Record<string, string> = {
		coil: '( )',
		set: '(S)',
		reset: '(R)',
		move: 'MOVE',
		math: 'MATH',
		timer: 'box',
		counter: 'box'
	};

	const shown = $derived.by(() => {
		const q = filter.trim().toUpperCase();
		if (!q) return entries;
		return entries.filter(
			(e) => e.address.includes(q) || (names.get(e.address) ?? '').toUpperCase().includes(q)
		);
	});
	const touches = (e: XrefEntry) =>
		selectedId !== null &&
		(e.reads.includes(selectedId) || e.writes.some((w) => w.owner === selectedId));

	const chip =
		'rounded bg-slate-800 px-1 font-mono text-[10px] text-slate-300 hover:bg-slate-700 hover:text-white';
</script>

<section aria-labelledby="xref-title">
	<button
		id="xref-title"
		class="mb-2 flex w-full items-center justify-between text-xs font-semibold tracking-wider text-slate-400 uppercase hover:text-slate-200"
		aria-expanded={open}
		onclick={() => (open = !open)}
	>
		Cross-reference ({entries.length})
		<span aria-hidden="true">{open ? '▾' : '▸'}</span>
	</button>

	{#if open}
		<input
			class="mb-2 w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-slate-100 placeholder:text-slate-500"
			placeholder={t('xref.filter')}
			aria-label={t('xref.filterLabel')}
			bind:value={filter}
		/>
		{#if shown.length === 0}
			<p class="text-xs text-slate-500">{t('xref.none')}</p>
		{:else}
			<table class="w-full text-left text-xs">
				<thead class="text-[10px] text-slate-500 uppercase">
					<tr>
						<th class="py-1 font-medium">Address</th>
						<th class="py-1 font-medium">{t('xref.written')}</th>
						<th class="py-1 font-medium">{t('xref.read')}</th>
					</tr>
				</thead>
				<tbody>
					{#each shown as e (e.address)}
						<tr class="border-t border-slate-800 align-top {touches(e) ? 'bg-emerald-500/10' : ''}">
							<td class="py-1 pr-2">
								<div class="font-mono text-slate-100">{e.address}</div>
								{#if names.has(e.address)}
									<div class="text-[10px] text-sky-300/80">{names.get(e.address)}</div>
								{/if}
							</td>
							<td class="py-1 pr-2">
								<div class="flex flex-wrap gap-0.5">
									{#each e.writes as w, i (i)}
										<button
											class={chip}
											title="Go to {place(w.owner)}"
											onclick={() => onJump(w.owner)}>{place(w.owner)} {KIND[w.kind]}</button
										>
									{:else}
										<span class="text-slate-600">—</span>
									{/each}
								</div>
							</td>
							<td class="py-1">
								<div class="flex flex-wrap gap-0.5">
									{#each e.reads as r (r)}
										<button class={chip} title="Go to {place(r)}" onclick={() => onJump(r)}
											>{place(r)}</button
										>
									{:else}
										<span class="text-slate-600">—</span>
									{/each}
								</div>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		{/if}
	{/if}
</section>
