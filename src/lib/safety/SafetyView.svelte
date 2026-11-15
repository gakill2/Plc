<script lang="ts">
	import StEditor from '#lib/st/StEditor.svelte';
	import { t } from '#lib/i18n/i18n.svelte.js';
	import type { Problem } from '#lib/project/state.svelte.js';
	import { signature, type SafetyConfig } from './safety.js';

	type Props = {
		safety: SafetyConfig;
		online: boolean;
		problems: Problem[];
		valueOf: (text: string) => boolean | number | null;
	};
	let { safety, online, problems, valueOf }: Props = $props();

	const issues = $derived(problems.filter((p) => p.source === 'safety'));
	const sig = $derived(signature(safety));
	const bit = (name: string) => {
		const v = valueOf(name);
		return v === null ? '–' : v ? '1' : '0';
	};
</script>

<div class="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] text-sm">
	<div class="space-y-3 border-b border-slate-800 p-4">
		<div class="flex flex-wrap items-center gap-3">
			<span class="rounded bg-yellow-400 px-2 py-0.5 text-xs font-bold text-slate-950">F</span>
			<p class="max-w-3xl text-xs text-slate-400">{t('safety.intro')}</p>
			<span
				class="ml-auto rounded border border-yellow-500/40 px-2 py-0.5 font-mono text-xs text-yellow-200"
				title={t('safety.signatureHint')}
				aria-label={t('safety.signature')}
			>
				{t('safety.signature')}: {sig}
			</span>
		</div>

		<table class="w-full max-w-4xl text-xs" aria-label={t('safety.inputs')}>
			<thead class="text-left text-slate-500">
				<tr>
					<th class="py-1 font-normal">{t('safety.fValue')}</th>
					<th class="font-normal">{t('safety.channels')}</th>
					<th class="font-normal">{t('safety.discrepancy')}</th>
					<th class="font-normal">{t('safety.value')}</th>
					<th class="font-normal">QBAD</th>
					<th class="font-normal">ACK_REQ</th>
				</tr>
			</thead>
			<tbody>
				{#each safety.inputs as i (i.name)}
					<tr class="border-t border-slate-800">
						<td class="py-1 font-mono text-yellow-200">{i.name}</td>
						<td class="font-mono text-slate-300"
							>{i.ch1} · {i.ch2} <span class="text-slate-500">(1oo2)</span></td
						>
						<td>
							<input
								type="number"
								min="10"
								step="10"
								class="w-20 rounded border border-slate-700 bg-slate-950 px-1 py-0.5 font-mono text-slate-100"
								value={i.discrepancyMs}
								disabled={online}
								aria-label="{t('safety.discrepancy')} {i.name}"
								oninput={(e) => (i.discrepancyMs = Number(e.currentTarget.value))}
							/>
							<span class="text-slate-500">ms</span>
						</td>
						<td class="font-mono">{online ? bit(i.name) : '–'}</td>
						<td class="font-mono {online && valueOf(`${i.name}_QBAD`) ? 'text-red-300' : ''}">
							{online ? bit(`${i.name}_QBAD`) : '–'}
						</td>
						<td class="font-mono">{online ? bit(`${i.name}_ACK_REQ`) : '–'}</td>
					</tr>
				{/each}
			</tbody>
		</table>
		<p class="text-xs text-slate-400">
			{t('safety.outputs')}:
			<span class="font-mono text-yellow-200">{safety.outputs.join(', ') || '—'}</span>
			· {t('safety.ackRei')}: <span class="font-mono text-slate-200">{safety.ackRei || '—'}</span>
		</p>
		{#if issues.length}
			<ul class="space-y-1 text-xs text-red-300" aria-label={t('problems.safety')}>
				{#each issues as p (p.id + p.message)}<li>✗ {p.message}</li>{/each}
			</ul>
		{/if}
	</div>
	<div class="grid min-h-0 grid-cols-[minmax(0,1fr)_16rem]">
		<StEditor
			value={safety.program}
			onChange={(text) => (safety.program = text)}
			diagnostics={[]}
			readOnly={online}
			names={() => ({ symbols: [], variables: [] })}
		/>
		<div class="overflow-auto border-l border-slate-800 p-3 text-[11px] text-slate-400">
			<p class="mb-2 font-semibold text-slate-200">{t('safety.blocks')}</p>
			<p class="mb-2">
				<code class="text-yellow-200">ESTOP1</code>(E_STOP, ACK_NEC, ACK) → Q, ACK_REQ
			</p>
			<p class="mb-2">
				<code class="text-yellow-200">FDBACK</code>(ON, FEEDBACK, QBAD_FIO, ACK, FDB_TIME) → Q,
				ERROR, ACK_REQ
			</p>
			<p>{t('safety.rules')}</p>
		</div>
	</div>
</div>
