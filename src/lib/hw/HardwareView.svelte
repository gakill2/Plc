<script lang="ts">
	import { t } from '#lib/i18n/i18n.svelte.js';
	import type { Problem } from '#lib/project/state.svelte.js';
	import {
		AI_MODES,
		MODULES,
		SIGNALS,
		channelAddress,
		rangeText,
		type AiMode,
		type Hardware,
		type HwModule
	} from './hw.js';

	type Props = { hw: Hardware; locked: boolean; problems: Problem[] };
	let { hw, locked, problems }: Props = $props();

	const issues = $derived(problems.filter((p) => p.source === 'hardware'));
	const flagged = (m: HwModule) => issues.some((i) => i.id.startsWith(`hw:${m.slot}:`));
	const sorted = $derived([...hw.modules].sort((a, b) => a.slot - b.slot));
	const wiresOf = (slot: number) => hw.wiring.filter((w) => w.slot === slot);
	const modeIds = Object.keys(AI_MODES) as AiMode[];
</script>

<div class="h-full overflow-auto p-4 text-sm">
	<p class="mb-3 max-w-3xl text-xs text-slate-400">{t('hw.intro')}</p>

	<!-- the rack -->
	<div class="flex gap-1 overflow-x-auto pb-2" role="list" aria-label={t('hw.rack')}>
		<div
			class="flex w-36 shrink-0 flex-col rounded-md border border-slate-600 bg-slate-800 p-2"
			role="listitem"
		>
			<span class="text-[10px] text-slate-500">{t('hw.slot')} 1</span>
			<span class="font-semibold text-slate-100">{hw.cpu}</span>
			<span class="mt-1 text-[11px] text-slate-400">
				{t('hw.image', { n: hw.imageBytes })}
			</span>
		</div>
		{#each sorted as m (m.slot)}
			{@const info = MODULES[m.kind]}
			<div
				class="flex w-44 shrink-0 flex-col rounded-md border p-2 {flagged(m)
					? 'border-red-500/70 bg-red-950/30'
					: info.area === 'I'
						? 'border-sky-700/60 bg-slate-900'
						: 'border-amber-700/60 bg-slate-900'}"
				role="listitem"
				aria-label="{t('hw.slot')} {m.slot}"
			>
				<span class="text-[10px] text-slate-500">{t('hw.slot')} {m.slot}</span>
				<span class="font-semibold text-slate-100">{info.name}</span>
				<label class="mt-2 text-[11px] text-slate-400">
					{t('hw.start')}
					<div class="mt-0.5 flex items-center gap-1">
						<span class="font-mono text-slate-500">{info.area}{info.analog ? 'W' : 'B'}</span>
						<input
							type="number"
							min="0"
							class="w-16 rounded border border-slate-700 bg-slate-950 px-1 py-0.5 font-mono text-slate-100"
							value={m.start}
							disabled={locked}
							aria-label="{t('hw.start')} — {t('hw.slot')} {m.slot}"
							oninput={(e) => (m.start = Number(e.currentTarget.value))}
						/>
					</div>
				</label>
				<span class="mt-1 font-mono text-[11px] text-slate-300">{rangeText(m)}</span>
			</div>
		{/each}
	</div>

	{#if issues.length}
		<ul class="mt-2 space-y-1 text-xs text-red-300" aria-label={t('problems.hardware')}>
			{#each issues as i (i.id + i.message)}<li>✗ {i.message}</li>{/each}
		</ul>
	{/if}

	<!-- analog channels -->
	{#each sorted.filter((m) => m.ai) as m (m.slot)}
		<h3 class="mt-5 mb-2 font-semibold text-slate-200">
			{t('hw.channels')} — {t('hw.slot')}
			{m.slot} ({MODULES[m.kind].name})
		</h3>
		<table class="w-full max-w-4xl text-xs" aria-label="{t('hw.channels')} {m.slot}">
			<thead class="text-left text-slate-500">
				<tr>
					<th class="py-1 font-normal">{t('hw.channel')}</th>
					<th class="font-normal">{t('hw.address')}</th>
					<th class="font-normal">{t('hw.device')}</th>
					<th class="font-normal">{t('hw.mode')}</th>
					<th class="font-normal">{t('hw.diag')}</th>
				</tr>
			</thead>
			<tbody>
				{#each m.ai ?? [] as ch, i (i)}
					{@const wire = wiresOf(m.slot).find((w) => w.channel === i)}
					<tr class="border-t border-slate-800">
						<td class="py-1.5 font-mono text-slate-400">{i}</td>
						<td class="font-mono text-slate-200">{channelAddress(hw, m.slot, i)}</td>
						<td class="text-slate-300">
							{#if wire}{wire.device}
								<span class="text-slate-500">· {SIGNALS[wire.signal ?? 'I_4_20']}</span>
							{:else}<span class="text-slate-600">—</span>{/if}
						</td>
						<td>
							<select
								class="rounded border border-slate-700 bg-slate-950 px-1 py-0.5 text-slate-100"
								value={ch.mode}
								disabled={locked}
								aria-label="{t('hw.mode')} {m.slot}.{i}"
								onchange={(e) => (ch.mode = e.currentTarget.value as AiMode)}
							>
								{#each modeIds as id (id)}<option value={id}>{AI_MODES[id]}</option>{/each}
							</select>
						</td>
						<td>
							<input
								type="checkbox"
								checked={ch.diag}
								disabled={locked || ch.mode === 'off'}
								aria-label="{t('hw.diag')} {m.slot}.{i}"
								onchange={(e) => (ch.diag = e.currentTarget.checked)}
							/>
						</td>
					</tr>
				{/each}
			</tbody>
		</table>
	{/each}

	<!-- the I/O list from the cabinet -->
	<h3 class="mt-5 mb-1 font-semibold text-slate-200">{t('hw.iolist')}</h3>
	<p class="mb-2 text-[11px] text-slate-500">{t('hw.iolistHint')}</p>
	<table class="w-full max-w-4xl text-xs" aria-label={t('hw.iolist')}>
		<thead class="text-left text-slate-500">
			<tr>
				<th class="py-1 font-normal">{t('hw.device')}</th>
				<th class="font-normal">{t('hw.wired')}</th>
				<th class="font-normal">{t('hw.address')}</th>
			</tr>
		</thead>
		<tbody>
			{#each hw.wiring as w (w.terminal)}
				{@const m = hw.modules.find((x) => x.slot === w.slot)}
				{@const a = m ? channelAddress(hw, w.slot, w.channel) : null}
				<tr class="border-t border-slate-800">
					<td class="py-1 text-slate-300">{w.device}</td>
					<td class="font-mono text-slate-400"
						>{t('hw.slot')} {w.slot} · {t('hw.channel')} {w.channel}</td
					>
					<td class="font-mono {a ? 'text-slate-100' : 'text-red-300'}">{a ?? t('hw.noModule')}</td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>
