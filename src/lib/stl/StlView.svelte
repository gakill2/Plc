<script lang="ts">
	import type { Snippet } from 'svelte';
	import StEditor from '#lib/st/StEditor.svelte';
	import type { StDiagnostic } from '#lib/st/compiler.js';
	import { t } from '#lib/i18n/i18n.svelte.js';
	import type { GeneratedStl } from './stl.js';

	type Props = {
		value: string;
		onChange: (text: string) => void;
		gen: GeneratedStl | null;
		/** problems of the compiled program, `stl:<line>` ids */
		problems: { id: string; message: string }[];
		online: boolean;
		valueOf: (text: string) => boolean | number | null;
		header: Snippet;
	};
	let { value, onChange, gen, problems, online, valueOf, header }: Props = $props();

	let showSt = $state(false);

	/** problems as editor diagnostics on their whole line */
	const diagnostics = $derived.by((): StDiagnostic[] => {
		const starts = [0];
		for (let i = 0; i < value.length; i++) if (value[i] === '\n') starts.push(i + 1);
		return problems.flatMap((p) => {
			const n = Number(/^stl:(\d+)$/.exec(p.id)?.[1]);
			if (!n || n > starts.length) return [];
			const from = starts[n - 1];
			const to = n < starts.length ? starts[n] - 1 : value.length;
			return [{ from, to: Math.max(from, to), message: p.message.replace(/^Line \d+: /, '') }];
		});
	});

	const lines = $derived(value.split('\n'));
	const rows = $derived(
		Object.entries(gen?.status ?? {})
			.map(([n, s]) => ({ n: Number(n), ...s }))
			.sort((a, b) => a.n - b.n)
	);
	const show = (v: boolean | number | null) =>
		v === null ? '–' : typeof v === 'boolean' ? (v ? '1' : '0') : String(v);
</script>

<div class="flex h-full flex-col">
	<div class="flex flex-wrap items-center gap-3 border-b border-slate-800 px-4 py-2">
		{@render header()}
		<span class="text-[11px] text-slate-500">{t('stl.hint')}</span>
		<button
			class="ml-auto rounded border border-slate-700 px-2 py-0.5 text-[11px] text-slate-300 hover:bg-slate-800"
			aria-pressed={showSt}
			onclick={() => (showSt = !showSt)}
		>
			{t('stl.showSt')}
		</button>
	</div>
	<div class="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_18rem]">
		<StEditor
			{value}
			{onChange}
			{diagnostics}
			readOnly={online}
			names={() => ({ symbols: [], variables: [] })}
			mode="stl"
		/>
		<div class="min-h-0 overflow-auto border-l border-slate-800 p-3 text-xs">
			{#if showSt}
				<pre
					class="font-mono text-[11px] text-slate-300"
					aria-label={t('stl.generated')}>{gen?.source ?? ''}</pre>
			{:else}
				<p class="mb-2 font-semibold text-slate-300">{t('stl.status')}</p>
				{#if !online}
					<p class="text-[11px] text-slate-500">{t('stl.statusOffline')}</p>
				{:else}
					<table class="w-full font-mono text-[11px]" aria-label={t('stl.status')}>
						<thead class="text-slate-500">
							<tr>
								<th class="text-left font-normal">#</th>
								<th class="text-left font-normal">STL</th>
								<th class="font-normal">STA</th>
								<th class="font-normal">RLO</th>
								<th class="font-normal">ACCU1</th>
							</tr>
						</thead>
						<tbody>
							{#each rows as r (r.n)}
								{@const rlo = r.rlo ? valueOf(r.rlo) : null}
								<tr class="border-t border-slate-800/60">
									<td class="pr-1 text-slate-600">{r.n}</td>
									<td class="max-w-[7rem] truncate pr-1 text-slate-300">{lines[r.n - 1]?.trim()}</td
									>
									<td class="text-center text-slate-400">{r.sta ? show(valueOf(r.sta)) : ''}</td>
									<td class="text-center {rlo === true ? 'text-emerald-300' : 'text-slate-400'}">
										{r.rlo ? show(rlo) : ''}
									</td>
									<td class="text-center text-sky-300">{r.accu ? show(valueOf(r.accu)) : ''}</td>
								</tr>
							{/each}
						</tbody>
					</table>
					<p class="mt-2 text-[10px] text-slate-500">{t('stl.legend')}</p>
				{/if}
			{/if}
		</div>
	</div>
</div>
