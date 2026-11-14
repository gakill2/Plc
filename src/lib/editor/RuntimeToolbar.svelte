<script lang="ts">
	import { t } from '#lib/i18n/i18n.svelte.js';
	import StatusLed from '#lib/components/StatusLed.svelte';
	import { SPEEDS } from '#lib/runtime/core.js';
	import type { PlcRuntime } from '#lib/runtime/runtime.svelte.js';

	type Props = { runtime: PlcRuntime; onRun: () => void; onStep: () => void };
	let { runtime, onRun, onStep }: Props = $props();

	const status = $derived(runtime.status);
	const snapshot = $derived(runtime.snapshot);
	const led = $derived(
		status === 'RUN'
			? { color: 'green' as const, on: true }
			: status === 'PAUSED'
				? { color: 'amber' as const, on: true }
				: status === 'FAULT'
					? { color: 'red' as const, on: true }
					: { color: 'green' as const, on: false }
	);

	const button =
		'flex items-center gap-1 rounded px-2.5 py-1 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-40';
</script>

<div class="flex flex-wrap items-center gap-2" role="toolbar" aria-label={t('rt.controls')}>
	<div class="flex items-center gap-2 rounded-md border border-slate-800 bg-slate-900 px-2.5 py-1">
		<StatusLed on={led.on} color={led.color} label={status} />
		<span class="w-14 font-mono text-xs font-semibold" role="status" aria-label={t('rt.status')}
			>{status}</span
		>
		<span class="font-mono text-[11px] text-slate-500" title={t('rt.timeTitle')}>
			{((snapshot?.timeMs ?? 0) / 1000).toFixed(2)} s · #{snapshot?.scanCount ?? 0}
		</span>
		{#if snapshot?.cycle && snapshot.scanCount > 0}
			<span
				class="font-mono text-[11px] {snapshot.cycle.lastMs > 10
					? 'text-amber-300'
					: 'text-slate-500'}"
				title={t('rt.cycleTitle', { ms: snapshot.cycle.execMs.toFixed(2) })}
				aria-label={t('rt.cycle')}
				>{t('rt.cycleText', {
					last: snapshot.cycle.lastMs.toFixed(0),
					max: snapshot.cycle.maxMs.toFixed(0)
				})}</span
			>
		{/if}
		{#if snapshot?.cyclicCount}
			<span
				class="font-mono text-[11px] text-sky-400"
				title={t('rt.ob30Title')}
				aria-label={t('rt.ob30')}>OB30 ×{snapshot.cyclicCount}</span
			>
		{/if}
	</div>

	<div class="flex items-center gap-0.5 rounded-md border border-slate-800 bg-slate-900 p-0.5">
		<button
			class="{button} bg-emerald-500 text-slate-950 hover:bg-emerald-400"
			disabled={status === 'RUN'}
			onclick={onRun}
			title={t('rt.runTitle')}
		>
			▶ {t('rt.run')}
		</button>
		<button
			class="{button} hover:bg-slate-700"
			disabled={status !== 'RUN'}
			onclick={runtime.pause}
			title={t('rt.pauseTitle')}
		>
			❚❚ {t('rt.pause')}
		</button>
		<button
			class="{button} hover:bg-slate-700"
			disabled={status === 'RUN' || status === 'FAULT'}
			onclick={onStep}
			title={t('rt.stepTitle', { ms: snapshot?.scanMs ?? 10 })}
		>
			⏭ {t('rt.step')}
		</button>
		<button
			class="{button} hover:bg-slate-700"
			disabled={status === 'STOP'}
			onclick={runtime.stop}
			title={t('rt.stopTitle')}
		>
			■ {t('rt.stop')}
		</button>
		<button class="{button} hover:bg-slate-700" onclick={runtime.reset} title={t('rt.resetTitle')}>
			↺ {t('rt.reset')}
		</button>
	</div>

	<label class="flex items-center gap-1.5 text-xs text-slate-400">
		{t('rt.speed')}
		<select
			class="rounded border border-slate-800 bg-slate-900 px-1 py-1 font-mono text-xs text-slate-200"
			value={snapshot?.speed ?? 1}
			onchange={(e) => runtime.setSpeed(Number(e.currentTarget.value))}
		>
			{#each SPEEDS as s (s)}<option value={s}>×{s}</option>{/each}
		</select>
	</label>

	{#if snapshot?.fault}
		<span class="rounded bg-red-500/15 px-2 py-1 font-mono text-xs text-red-300">
			FAULT @{snapshot.fault.pc}: {snapshot.fault.message}
			<span class="text-red-200/70">{t('rt.faultHint')}</span>
		</span>
	{/if}
</div>
