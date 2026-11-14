<script lang="ts">
	import { t } from '#lib/i18n/i18n.svelte.js';
	import { parseAddress } from '#lib/engine/index.js';
	import type { RuntimeSnapshot } from '#lib/runtime/protocol.js';
	import { readBit, readNumber } from '#lib/runtime/read.js';
	import type { StVariable } from './compiler.js';

	type Props = { variables: StVariable[]; snapshot: RuntimeSnapshot | null; online: boolean };
	let { variables, snapshot, online }: Props = $props();

	function show(read: StVariable['reads'][number]): string {
		if (!snapshot || !online) return '—';
		const a = parseAddress(read.address);
		if (read.kind === 'bool') return readBit(snapshot, a) ? 'TRUE' : 'FALSE';
		const v = readNumber(snapshot, a, read.numType);
		if (v === null) return '—';
		return read.numType === 'REAL' ? String(Number(v.toPrecision(7))) : String(v);
	}
</script>

<section class="space-y-2" aria-labelledby="st-vars">
	<h2 id="st-vars" class="text-xs font-semibold tracking-wider text-slate-400 uppercase">
		{t('stv.title')}
	</h2>
	{#if variables.length === 0}
		<p class="text-xs text-slate-500">
			{t('stv.declare')} <code class="text-emerald-300">VAR … END_VAR</code> block.
		</p>
	{:else}
		<table class="w-full text-left text-xs">
			<tbody>
				{#each variables as v (v.name)}
					{#each v.reads as r, i (r.label)}
						<tr class="border-b border-slate-800/70">
							<td class="py-1 pr-2 font-mono text-slate-200">
								{i === 0 ? v.name : ''}{r.label ? `.${r.label}` : ''}
							</td>
							<td class="pr-2 text-[10px] text-slate-500">{i === 0 ? v.type : ''}</td>
							<td class="pr-2 font-mono text-[10px] text-sky-300/70">{r.address}</td>
							<td
								class="text-right font-mono {show(r) === 'TRUE'
									? 'text-emerald-300'
									: show(r) === 'FALSE'
										? 'text-slate-500'
										: 'text-amber-300'}"
							>
								{show(r)}
							</td>
						</tr>
					{/each}
				{/each}
			</tbody>
		</table>
	{/if}
</section>
