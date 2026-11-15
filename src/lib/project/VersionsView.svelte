<script lang="ts">
	import { t } from '#lib/i18n/i18n.svelte.js';
	import type { Project } from './project.js';
	import { compareProjects, MAX_VERSIONS, makeVersion, type ProjectVersion } from './versions.js';

	type Props = {
		history: ProjectVersion[];
		/** the project as it is now */
		current: () => Project;
		locked: boolean;
		onSave: (history: ProjectVersion[]) => void;
		onRestore: (v: ProjectVersion) => void;
	};
	let { history, current, locked, onSave, onRestore }: Props = $props();

	let name = $state('');
	let comment = $state('');
	/** the version to compare with; null = the newest */
	let picked = $state<string | null>(null);
	let showSame = $state(false);

	const base = $derived(history.find((v) => v.id === picked) ?? history.at(-1) ?? null);
	const against = $derived(base?.id ?? null);
	const diff = $derived(base ? compareProjects(base.snapshot, current()) : []);
	const changed = $derived(diff.reduce((n, s) => n + s.changed, 0));
	const date = (ms: number) =>
		new Date(ms).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });

	function save() {
		if (!name.trim() || !comment.trim()) return;
		const v = makeVersion(current(), name, comment);
		onSave([...history, v].slice(-MAX_VERSIONS));
		picked = v.id;
		name = '';
		comment = '';
	}
</script>

<div class="grid h-full min-h-0 gap-4 overflow-auto p-4 text-sm lg:grid-cols-[20rem_minmax(0,1fr)]">
	<section class="space-y-3">
		<p class="text-xs text-slate-400">{t('ver.intro')}</p>
		<div class="space-y-1.5 rounded border border-slate-800 p-2">
			<input
				class="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 text-slate-100"
				placeholder={t('ver.name')}
				aria-label={t('ver.name')}
				bind:value={name}
				disabled={locked}
			/>
			<textarea
				class="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-100"
				rows="3"
				placeholder={t('ver.comment')}
				aria-label={t('ver.comment')}
				bind:value={comment}
				disabled={locked}></textarea>
			<button
				class="rounded bg-sky-600 px-2 py-1 text-xs text-white hover:bg-sky-500 disabled:opacity-40"
				disabled={locked || !name.trim() || !comment.trim()}
				onclick={save}>{t('ver.save')}</button
			>
		</div>
		<ol class="space-y-1.5" aria-label={t('ver.list')}>
			{#each [...history].reverse() as v (v.id)}
				<li
					class="rounded border p-2 text-xs {against === v.id
						? 'border-sky-500/60 bg-sky-500/5'
						: 'border-slate-800'}"
				>
					<div class="flex items-center gap-2">
						<span class="font-semibold text-slate-100">{v.name}</span>
						<span class="text-slate-500">{date(v.at)}</span>
					</div>
					<p class="mt-0.5 whitespace-pre-line text-slate-400">{v.comment}</p>
					<div class="mt-1 flex gap-3">
						<button class="text-sky-300 underline" onclick={() => (picked = v.id)}
							>{t('ver.compare')}</button
						>
						<button
							class="text-amber-300 underline disabled:opacity-40"
							disabled={locked}
							onclick={() => confirm(t('ver.confirmRestore', { name: v.name })) && onRestore(v)}
							>{t('ver.restore')}</button
						>
					</div>
				</li>
			{:else}
				<li class="text-xs text-slate-500">{t('ver.none')}</li>
			{/each}
		</ol>
	</section>

	<section class="min-w-0 space-y-3" aria-label={t('ver.diff')}>
		{#if base}
			<div class="flex flex-wrap items-center gap-3">
				<h3 class="font-semibold text-slate-200">
					{t('ver.diffTitle', { name: base.name })}
				</h3>
				<span class="text-xs {changed ? 'text-amber-300' : 'text-emerald-300'}">
					{changed ? t('ver.changes', { n: changed }) : t('ver.same')}
				</span>
				<label class="ml-auto flex items-center gap-1 text-xs text-slate-400">
					<input type="checkbox" bind:checked={showSame} />
					{t('ver.showSame')}
				</label>
			</div>
			{#each diff.filter((s) => s.changed || showSame) as s (s.title)}
				<div class="rounded border border-slate-800">
					<p class="border-b border-slate-800 px-2 py-1 text-xs font-semibold text-slate-300">
						{s.title}
						{#if s.changed}<span class="ml-2 font-normal text-amber-300">±{s.changed}</span>{/if}
					</p>
					<pre
						class="overflow-auto p-2 font-mono text-[11px] leading-5">{#each s.lines.filter((l, i, all) => showSame || l.kind !== 'same' || all
									.slice(Math.max(0, i - 2), i + 3)
									.some((x) => x.kind !== 'same')) as l, i (i)}<span
								class="block {l.kind === 'added'
									? 'bg-emerald-500/10 text-emerald-300'
									: l.kind === 'removed'
										? 'bg-red-500/10 text-red-300'
										: 'text-slate-500'}"
								>{l.kind === 'added' ? '+ ' : l.kind === 'removed' ? '− ' : '  '}{l.text}</span
							>{/each}</pre>
				</div>
			{/each}
		{:else}
			<p class="text-xs text-slate-500">{t('ver.pick')}</p>
		{/if}
	</section>
</div>
