<script lang="ts">
	import { t } from '#lib/i18n/i18n.svelte.js';
	import { formatAddress } from '#lib/engine/index.js';
	import type { ProjectState } from '#lib/project/state.svelte.js';
	import { readBit, readNumber } from '#lib/runtime/read.js';
	import type { PlcRuntime } from '#lib/runtime/runtime.svelte.js';
	import { resolveSymbol } from '#lib/symbols/symbols.js';
	import {
		bitWidth,
		canForce,
		canModify,
		defaultFormat,
		formatValue,
		tryParse,
		WATCH_FORMATS,
		watchEntry,
		type WatchEntry
	} from './watch.js';

	type Props = { project: ProjectState; runtime: PlcRuntime };
	let { project, runtime }: Props = $props();

	let newOperand = $state('');
	let pending: Record<string, string> = $state({});

	const rows = $derived(
		project.watch.map((entry) => {
			const resolved = resolveSymbol(project.symbols.map, entry.operand);
			const addr = tryParse(resolved);
			const key = addr ? formatAddress(addr) : null;
			const s = runtime.snapshot;
			const value =
				!addr || !s
					? null
					: entry.format === 'BOOL'
						? readBit(s, addr)
						: readNumber(s, addr, entry.format === 'REAL' ? 'REAL' : undefined);
			return {
				entry,
				addr,
				key,
				alias: project.ladder.alias(entry.operand),
				text: addr ? formatValue(value, entry.format, bitWidth(addr)) : 'invalid',
				on: value === true,
				forced: key ? (runtime.forces.get(key) ?? null) : null
			};
		})
	);

	function add() {
		const operand = newOperand.trim();
		if (!operand) return;
		const addr = tryParse(resolveSymbol(project.symbols.map, operand));
		project.watch.push(watchEntry(operand, addr ? defaultFormat(addr) : undefined));
		newOperand = '';
	}

	function remove(entry: WatchEntry) {
		project.watch.splice(project.watch.indexOf(entry), 1);
	}

	function write(row: (typeof rows)[number]) {
		if (!row.key || !row.addr) return;
		const raw = (pending[row.entry.id] ?? '').trim();
		const value = /^16#/i.test(raw)
			? parseInt(raw.slice(3), 16)
			: /^2#/i.test(raw)
				? parseInt(raw.slice(2).replace(/_/g, ''), 2)
				: raw.toUpperCase() === 'TRUE'
					? 1
					: raw.toUpperCase() === 'FALSE'
						? 0
						: Number(raw);
		if (!Number.isFinite(value)) return;
		runtime.modify(row.key, value, row.entry.format === 'REAL' ? 'REAL' : undefined);
		pending[row.entry.id] = '';
	}

	const small =
		'rounded px-1.5 py-0.5 font-mono text-[11px] disabled:cursor-not-allowed disabled:opacity-30';
</script>

<div class="mx-auto max-w-5xl space-y-4 p-6">
	<div class="flex items-end justify-between gap-4">
		<div>
			<h1 class="text-lg font-semibold text-white">{t('watch.title')}</h1>
			<p class="mt-1 text-sm text-slate-400">
				{t('watch.live')} <b class="text-slate-300">Modify</b>
				{t('watch.modifyText')}
				<b class="text-slate-300">force</b>
				{t('watch.forceText')}
			</p>
		</div>
		<button
			class="shrink-0 rounded border border-red-500/40 px-2.5 py-1 text-xs text-red-300 hover:bg-red-500/10 disabled:opacity-40"
			disabled={runtime.forces.size === 0}
			onclick={runtime.clearForces}
		>
			Release all forces ({runtime.forces.size})
		</button>
	</div>

	{#if runtime.commandError}
		<p class="rounded bg-red-500/10 px-3 py-1.5 text-xs text-red-300">{runtime.commandError}</p>
	{/if}

	<table class="w-full border-separate border-spacing-y-1 text-left text-xs">
		<thead class="text-[11px] tracking-wider text-slate-500 uppercase">
			<tr>
				<th class="px-2 font-medium">Operand</th>
				<th class="w-20 px-2 font-medium">Format</th>
				<th class="w-40 px-2 font-medium">{t('watch.value')}</th>
				<th class="w-44 px-2 font-medium">Modify</th>
				<th class="w-28 px-2 font-medium">Force</th>
				<th class="w-12 px-2 text-center font-medium">Trend</th>
				<th class="w-8"></th>
			</tr>
		</thead>
		<tbody>
			{#each rows as row (row.entry.id)}
				{@const isBit = row.entry.format === 'BOOL'}
				<tr class="bg-slate-900/60">
					<td class="rounded-l px-2 py-1">
						<input
							class="w-full rounded bg-transparent px-1 py-0.5 font-mono text-slate-100 outline-none hover:bg-slate-800 focus:bg-slate-800"
							bind:value={row.entry.operand}
							aria-label="Operand"
							spellcheck="false"
						/>
						{#if row.alias}<div class="px-1 font-mono text-[10px] text-sky-300/80">
								{row.alias}
							</div>{/if}
					</td>
					<td class="px-2">
						<select
							class="rounded bg-slate-800 px-1 py-0.5 font-mono text-[11px] text-slate-200"
							bind:value={row.entry.format}
							aria-label={t('watch.displayFormat')}
						>
							{#each WATCH_FORMATS as f (f)}<option value={f}>{f}</option>{/each}
						</select>
					</td>
					<td class="px-2 font-mono">
						<span
							class={!row.addr
								? 'text-red-400'
								: !runtime.snapshot
									? 'text-slate-500'
									: isBit
										? row.on
											? 'text-emerald-300'
											: 'text-slate-400'
										: 'text-amber-300'}
						>
							{row.text}
						</span>
						{#if row.forced !== null}
							<span
								class="ml-1 rounded bg-red-600 px-1 text-[9px] font-bold text-white"
								title={t('watch.forced')}>F</span
							>
						{/if}
					</td>
					<td class="px-2">
						{#if row.addr && canModify(row.addr)}
							{#if isBit && row.addr.area !== 'T' && row.addr.area !== 'C'}
								<div class="flex gap-1">
									<button
										class="{small} bg-slate-800 hover:bg-slate-700"
										onclick={() => runtime.modify(row.key!, 0)}>0</button
									>
									<button
										class="{small} bg-slate-800 hover:bg-slate-700"
										onclick={() => runtime.modify(row.key!, 1)}>1</button
									>
								</div>
							{:else if !isBit}
								<form class="flex gap-1" onsubmit={(e) => (e.preventDefault(), write(row))}>
									<input
										class="w-24 rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[11px] text-slate-100 outline-none focus:ring-1 focus:ring-emerald-500"
										placeholder="value"
										bind:value={pending[row.entry.id]}
										aria-label={t('watch.newValue')}
									/>
									<button class="{small} bg-slate-800 hover:bg-slate-700">{t('watch.write')}</button
									>
								</form>
							{/if}
						{:else}
							<span class="text-slate-600">—</span>
						{/if}
					</td>
					<td class="px-2">
						{#if row.addr && canForce(row.addr)}
							<div class="flex gap-1">
								<button
									class="{small} {row.forced === false
										? 'bg-red-600 text-white'
										: 'bg-slate-800 hover:bg-slate-700'}"
									title={t('watch.force0')}
									onclick={() => runtime.force(row.key!, false)}>F0</button
								>
								<button
									class="{small} {row.forced === true
										? 'bg-red-600 text-white'
										: 'bg-slate-800 hover:bg-slate-700'}"
									title={t('watch.force1')}
									onclick={() => runtime.force(row.key!, true)}>F1</button
								>
								<button
									class="{small} bg-slate-800 hover:bg-slate-700"
									title={t('watch.release')}
									disabled={row.forced === null}
									onclick={() => runtime.force(row.key!, null)}>×</button
								>
							</div>
						{:else}
							<span class="text-slate-600">—</span>
						{/if}
					</td>
					<td class="px-2 text-center">
						<input
							type="checkbox"
							class="accent-emerald-500"
							bind:checked={row.entry.trend}
							aria-label={t('watch.showTrend')}
						/>
					</td>
					<td class="rounded-r">
						<button
							class="rounded px-2 text-slate-500 hover:bg-red-500/20 hover:text-red-300"
							aria-label="Remove {row.entry.operand}"
							onclick={() => remove(row.entry)}>×</button
						>
					</td>
				</tr>
			{/each}
		</tbody>
	</table>

	<form class="flex gap-2" onsubmit={(e) => (e.preventDefault(), add())}>
		<input
			class="w-56 rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 font-mono text-xs text-slate-100 outline-none focus:border-emerald-500"
			placeholder={t('watch.addressHint')}
			bind:value={newOperand}
			aria-label={t('watch.operandToWatch')}
		/>
		<button
			class="rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-200 hover:border-slate-500"
		>
			{t('watch.add')}
		</button>
	</form>
</div>
