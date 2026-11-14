<script lang="ts">
	import { t } from '#lib/i18n/i18n.svelte.js';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';
	import { getLesson, LESSON_PREFIX } from '#lib/lessons/lessons.js';
	import { demoProject, parseProject, type Project } from '#lib/project/project.js';
	import {
		deleteProject,
		emptyProject,
		listProjects,
		newProjectId,
		readProject,
		saveProject,
		type ProjectSummary
	} from '#lib/project/storage.js';

	let projects = $state<ProjectSummary[]>([]);
	let importError = $state<string | null>(null);
	let fileInput: HTMLInputElement;

	const refresh = () => (projects = listProjects(localStorage));
	onMount(refresh);

	const own = $derived(projects.filter((p) => !p.id.startsWith(LESSON_PREFIX)));
	const lessons = $derived(projects.filter((p) => p.id.startsWith(LESSON_PREFIX)));

	const open = (id: string) => goto(resolve('/editor/[id]', { id }));

	function create(project: Project) {
		const id = newProjectId();
		saveProject(localStorage, id, project);
		open(id);
	}

	function duplicate(p: ProjectSummary) {
		const project = readProject(localStorage, p.id);
		if (!project) return;
		saveProject(localStorage, newProjectId(), {
			...project,
			name: `${p.name} (copy)`,
			lesson: undefined
		});
		refresh();
	}

	function remove(p: ProjectSummary) {
		const what = p.id.startsWith(LESSON_PREFIX) ? 'your progress in this lesson' : `“${p.name}”`;
		if (!confirm(t('proj.confirmDelete', { what }))) return;
		deleteProject(localStorage, p.id);
		refresh();
	}

	function exportProject(p: ProjectSummary) {
		const project = readProject(localStorage, p.id);
		if (!project) return;
		const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
		const a = document.createElement('a');
		a.href = URL.createObjectURL(blob);
		a.download = `${p.name.replace(/[^\w-]+/g, '_') || 'project'}.plcsim.json`;
		a.click();
		URL.revokeObjectURL(a.href);
	}

	async function importFile(e: Event) {
		const file = (e.currentTarget as HTMLInputElement).files?.[0];
		if (!file) return;
		importError = null;
		try {
			const project = parseProject(JSON.parse(await file.text()));
			if (!project) throw new Error('not a PLC Sim project');
			create({
				...project,
				name: project.name ?? file.name.replace(/\.plcsim\.json$|\.json$/, '')
			});
		} catch (err) {
			importError = `Could not import ${file.name}: ${(err as Error).message}`;
		}
		(e.currentTarget as HTMLInputElement).value = '';
	}

	const when = (t: number) =>
		t ? new Date(t).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—';
	const titleOf = (p: ProjectSummary) =>
		p.lesson ? (getLesson(p.lesson)?.title ?? p.name) : p.name;
</script>

<svelte:head>
	<title>Projects · PLC Sim</title>
</svelte:head>

<section class="mx-auto max-w-5xl px-4 py-12">
	<div class="flex flex-wrap items-end justify-between gap-4">
		<div>
			<h1 class="text-3xl font-bold text-white">{t('proj.title')}</h1>
			<p class="mt-2 text-slate-400">
				{t('proj.saved')}
			</p>
		</div>
		<div class="flex flex-wrap gap-2">
			<button
				class="rounded-md bg-emerald-500 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-emerald-400"
				onclick={() => create(emptyProject())}
			>
				{t('proj.new')}
			</button>
			<button
				class="rounded-md border border-slate-700 px-4 py-2 text-sm hover:border-slate-500"
				onclick={() => create({ ...demoProject(), name: 'Motor demo' })}
			>
				{t('proj.fromDemo')}
			</button>
			<button
				class="rounded-md border border-slate-700 px-4 py-2 text-sm hover:border-slate-500"
				onclick={() => fileInput.click()}
			>
				{t('proj.import')}
			</button>
			<input
				bind:this={fileInput}
				type="file"
				accept=".json,application/json"
				class="hidden"
				aria-label={t('proj.importLabel')}
				onchange={importFile}
			/>
		</div>
	</div>

	{#if importError}
		<p class="mt-4 rounded bg-red-500/10 px-3 py-2 text-sm text-red-300">{importError}</p>
	{/if}

	{#snippet card(p: ProjectSummary)}
		<li class="flex items-center gap-4 rounded-lg border border-slate-800 bg-slate-900/50 p-4">
			<a href={resolve('/editor/[id]', { id: p.id })} class="min-w-0 flex-1 hover:text-white">
				<div class="flex flex-wrap items-center gap-2">
					<h3 class="truncate font-semibold text-slate-100">{titleOf(p)}</h3>
					<span class="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-300 uppercase">
						{p.language === 'st' ? 'ST' : 'LAD'}
					</span>
					{#if p.scenario}
						<span class="rounded bg-pink-500/20 px-1.5 py-0.5 text-[10px] text-pink-200 uppercase"
							>{p.scenario}</span
						>
					{/if}
				</div>
				<p class="mt-0.5 text-xs text-slate-500">
					{p.networks} networks · {p.devices} devices · changed {when(p.updatedAt)}
				</p>
			</a>
			<div class="flex shrink-0 gap-1 text-xs">
				{#if !p.lesson}
					<button
						class="rounded px-2 py-1 text-slate-300 hover:bg-slate-800"
						onclick={() => duplicate(p)}>{t('proj.duplicate')}</button
					>
				{/if}
				<button
					class="rounded px-2 py-1 text-slate-300 hover:bg-slate-800"
					onclick={() => exportProject(p)}>{t('editor.export')}</button
				>
				<button class="rounded px-2 py-1 text-red-300 hover:bg-red-500/15" onclick={() => remove(p)}
					>{t('proj.delete')}</button
				>
			</div>
		</li>
	{/snippet}

	<h2 class="mt-10 mb-3 text-sm font-semibold tracking-wider text-slate-400 uppercase">
		{t('proj.mine')}
	</h2>
	{#if own.length === 0}
		<p
			class="rounded-lg border border-dashed border-slate-700 p-6 text-center text-sm text-slate-500"
		>
			{t('proj.none')}
		</p>
	{:else}
		<ul class="space-y-2">
			{#each own as p (p.id)}{@render card(p)}{/each}
		</ul>
	{/if}

	{#if lessons.length}
		<h2 class="mt-10 mb-3 text-sm font-semibold tracking-wider text-slate-400 uppercase">
			{t('proj.lessons')}
		</h2>
		<ul class="space-y-2">
			{#each lessons as p (p.id)}{@render card(p)}{/each}
		</ul>
	{/if}
</section>
