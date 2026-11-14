<script lang="ts">
	import { t, type MessageKey } from '#lib/i18n/i18n.svelte.js';
	import { en } from '#lib/i18n/en.js';
	import type { DiagEntry } from '#lib/engine/index.js';
	import type { RuntimeSnapshot } from '#lib/runtime/protocol.js';
	import { MAX_CYCLE_MS } from '#lib/engine/index.js';

	type Props = { snapshot: RuntimeSnapshot | null };
	let { snapshot }: Props = $props();

	/** the event in the interface language (the engine also gives it in Polish) */
	const msg = (d: DiagEntry) => {
		const key = `diag.msg.${d.code}`;
		return key in en ? t(key as MessageKey, d.params) : d.text;
	};
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

<div class="h-full space-y-5 overflow-auto p-4">
	<section aria-labelledby="diag-cycle" class="space-y-2">
		<h2 id="diag-cycle" class="text-xs font-semibold tracking-wider text-slate-400 uppercase">
			{t('diag.cycle')}
		</h2>
		<div class="grid max-w-xl grid-cols-4 gap-2 font-mono text-sm">
			{#each [[t('diag.last'), c?.lastMs], ['min', c?.minMs], ['max', c?.maxMs], [t('diag.program'), c?.execMs]] as const as [label, v] (label)}
				<div class="rounded border border-slate-800 bg-slate-900 px-3 py-2">
					<div class="text-[10px] tracking-wider text-slate-500 uppercase">{label}</div>
					<div class="text-slate-100">{v === undefined ? '–' : `${fmt(v)} ms`}</div>
				</div>
			{/each}
		</div>
		<p class="max-w-2xl text-xs leading-relaxed text-slate-400">
			{t('diag.cycleText', { max: MAX_CYCLE_MS })}
		</p>
	</section>

	<section aria-labelledby="diag-buffer" class="space-y-2">
		<h2 id="diag-buffer" class="text-xs font-semibold tracking-wider text-slate-400 uppercase">
			{t('diag.buffer')}
		</h2>
		{#if entries.length === 0}
			<p class="text-xs text-slate-500">{t('diag.empty')}</p>
		{:else}
			<table class="w-full max-w-4xl text-left text-xs" aria-label={t('diag.buffer')}>
				<thead class="text-[10px] tracking-wider text-slate-500 uppercase">
					<tr>
						<th class="w-12 py-1 pr-2 font-medium">{t('diag.no')}</th>
						<th class="w-20 py-1 pr-2 font-medium">{t('diag.time')}</th>
						<th class="py-1 font-medium">{t('diag.event')}</th>
					</tr>
				</thead>
				<tbody>
					{#each entries as d (d.n)}
						<tr class="border-t border-slate-800 {COLORS[d.kind]}">
							<td class="py-1 pr-2 font-mono text-slate-500">{d.n}</td>
							<td class="py-1 pr-2 font-mono text-slate-500">{time(d.timeMs)}</td>
							<td class="py-1"><span aria-hidden="true">{ICONS[d.kind]}</span> {msg(d)}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		{/if}
	</section>

	<section aria-labelledby="diag-obs" class="max-w-2xl space-y-2 text-xs text-slate-400">
		<h2 id="diag-obs" class="text-xs font-semibold tracking-wider text-slate-400 uppercase">
			{t('diag.obs')}
		</h2>
		<pre
			class="rounded bg-slate-900 p-2 font-mono text-[11px] text-slate-300">ORGANIZATION_BLOCK OB100   (* {t(
				'diag.ob100'
			)} *)
END_ORGANIZATION_BLOCK
ORGANIZATION_BLOCK OB121   (* {t('diag.ob121')} *)
END_ORGANIZATION_BLOCK
ORGANIZATION_BLOCK OB80    (* {t('diag.ob80')} *)
END_ORGANIZATION_BLOCK</pre>
		<p>{t('diag.obsText')}</p>
	</section>
</div>
