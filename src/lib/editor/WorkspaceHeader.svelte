<script lang="ts">
	import { resolve } from '$app/paths';
	import { t, type MessageKey } from '#lib/i18n/i18n.svelte.js';
	import type { ExportFormat } from '#lib/project/export-file.svelte.js';
	import type { View } from './views.js';

	type Props = {
		id: string;
		name: string;
		/** a lesson's title: the name cannot be changed */
		fixedName: string | null;
		online: boolean;
		canUndo: boolean;
		canRedo: boolean;
		views: View[];
		view: View;
		showTrend: boolean;
		/** views with problems get a red dot */
		problemViews: string[];
		pendingAlarms: number;
		forces: number;
		onName: (name: string) => void;
		onUndo: () => void;
		onRedo: () => void;
		onShare: () => void;
		onExport: (format: ExportFormat) => void;
	};
	let {
		id,
		name,
		fixedName,
		online,
		canUndo,
		canRedo,
		views,
		view = $bindable(),
		showTrend = $bindable(),
		problemViews,
		pendingAlarms,
		forces,
		onName,
		onUndo,
		onRedo,
		onShare,
		onExport
	}: Props = $props();

	const LABELS: Record<View, MessageKey> = {
		program: 'view.program',
		library: 'view.library',
		process: 'view.process',
		circuit: 'view.circuit',
		symbols: 'view.symbols',
		watch: 'view.watch',
		debug: 'view.debug',
		diag: 'view.diag',
		hmi: 'view.hmi',
		iocheck: 'view.iocheck',
		hardware: 'view.hardware',
		safety: 'view.safety'
	};
	const tool = 'rounded px-2 py-1 text-xs text-slate-300 hover:bg-slate-800';
</script>

<div class="flex min-w-0 items-center gap-2">
	<input
		class="w-40 rounded border border-transparent bg-transparent px-2 py-1 text-sm font-semibold text-white outline-none hover:border-slate-700 focus:border-emerald-500 disabled:opacity-70 xl:w-56"
		placeholder={fixedName ?? t('editor.untitled')}
		value={name}
		oninput={(e) => onName(e.currentTarget.value)}
		disabled={!!fixedName}
		aria-label={t('editor.projectName')}
	/>
	<div class="flex gap-0.5">
		<button
			class="rounded px-2 py-1 text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-30"
			title="{t('editor.undo')} (Ctrl+Z)"
			aria-label={t('editor.undo')}
			disabled={!canUndo || online}
			onclick={onUndo}>↶</button
		>
		<button
			class="rounded px-2 py-1 text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-30"
			title="{t('editor.redo')} (Ctrl+Shift+Z)"
			aria-label={t('editor.redo')}
			disabled={!canRedo || online}
			onclick={onRedo}>↷</button
		>
		<button class={tool} onclick={onShare}>{t('editor.share')}</button>
		<select
			class="{tool} bg-transparent"
			aria-label={t('editor.export')}
			value=""
			onchange={(e) => {
				const f = e.currentTarget.value as ExportFormat | '';
				e.currentTarget.value = '';
				if (f) onExport(f);
			}}
		>
			<option value="">{t('editor.export')}</option>
			<option value="json">{t('export.json')}</option>
			<option value="scl">{t('export.scl')}</option>
			<option value="xml">{t('export.xml')}</option>
			<option value="st">{t('export.st')}</option>
		</select>
		<a class={tool} href={resolve('/editor/[id]/report', { id })} title={t('editor.reportTitle')}
			>{t('editor.report')}</a
		>
	</div>
</div>
<nav
	class="flex max-w-full gap-0.5 overflow-x-auto rounded-md border border-slate-800 bg-slate-900 p-0.5"
	aria-label={t('editor.views')}
>
	{#each views as v (v)}
		<button
			class="shrink-0 rounded px-3 py-1.5 text-xs font-medium lg:py-1 {view === v
				? 'bg-slate-700 text-white'
				: 'text-slate-400 hover:text-white'}"
			aria-current={view === v ? 'page' : undefined}
			onclick={() => (view = v)}
		>
			{t(LABELS[v])}
			{#if problemViews.includes(v)}<span class="ml-1 text-red-400">●</span>{/if}
			{#if v === 'hmi' && pendingAlarms}<span
					class="ml-1 rounded-full bg-red-500 px-1.5 text-[10px] text-white"
					aria-label={t('editor.unackedAlarms', { n: pendingAlarms })}>{pendingAlarms}</span
				>{/if}
		</button>
	{/each}
	<span class="mx-1 w-px shrink-0 bg-slate-700"></span>
	<button
		class="shrink-0 rounded px-3 py-1.5 text-xs font-medium lg:py-1 {showTrend
			? 'bg-slate-700 text-white'
			: 'text-slate-400 hover:text-white'}"
		aria-pressed={showTrend}
		onclick={() => (showTrend = !showTrend)}
	>
		{t('view.trend')}
	</button>
	{#if forces}
		<button
			class="ml-1 shrink-0 rounded bg-red-600 px-2 py-1 text-[11px] font-bold text-white"
			title={t('editor.forcesTitle')}
			onclick={() => (view = 'watch')}
		>
			F × {forces}
		</button>
	{/if}
</nav>
