<script lang="ts">
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';
	import ContinueCard from '#lib/learn/ContinueCard.svelte';
	import StepLink from '#lib/learn/StepLink.svelte';
	import { isDone, learningPath, nextStep, type Progress } from '#lib/learn/path.js';
	import { completedLessons } from '#lib/lessons/progress.js';
	import { solvedQuizzes } from '#lib/tutorial/progress.js';
	import { i18n, t } from '#lib/i18n/i18n.svelte.js';
	import { ROLES, roleOf, rolePath, savedRole, saveRole, type RoleId } from '#lib/learn/roles.js';

	let roleId = $state<RoleId | null>(null);
	const role = $derived(roleOf(roleId));
	const stages = $derived(rolePath(learningPath(i18n.locale), role));
	function pick(id: RoleId | null) {
		roleId = id;
		saveRole(id);
	}
	const total = $derived(stages.reduce((n, s) => n + s.steps.length, 0));

	let progress = $state<Progress>({ solvedQuizzes: new Set(), lessonsDone: new Set() });
	onMount(() => {
		progress = { solvedQuizzes: solvedQuizzes(), lessonsDone: completedLessons() };
		roleId = savedRole();
	});

	const next = $derived(nextStep(stages, progress));
	const doneCount = $derived(
		stages.flatMap((s) => s.steps).filter((s) => isDone(s, progress)).length
	);
</script>

<svelte:head>
	<title>Learn · PLC Sim</title>
</svelte:head>

<section class="mx-auto max-w-4xl px-4 py-12" lang={i18n.locale}>
	<h1 class="text-3xl font-bold text-white">{t('learn.title')}</h1>
	<p class="mt-2 max-w-2xl text-slate-400">{t('learn.intro')}</p>

	<div class="mt-6" role="group" aria-label={t('learn.roles')}>
		<p class="text-xs font-semibold tracking-wider text-slate-400 uppercase">{t('learn.roles')}</p>
		<div class="mt-2 flex flex-wrap gap-2">
			<button
				class="rounded-full border px-3 py-1 text-sm {role
					? 'border-slate-700 text-slate-300 hover:border-slate-500'
					: 'border-sky-500 bg-sky-500/15 text-white'}"
				aria-pressed={!role}
				onclick={() => pick(null)}>{t('learn.roleAll')}</button
			>
			{#each ROLES as r (r.id)}
				<button
					class="rounded-full border px-3 py-1 text-sm {role?.id === r.id
						? 'border-sky-500 bg-sky-500/15 text-white'
						: 'border-slate-700 text-slate-300 hover:border-slate-500'}"
					aria-pressed={role?.id === r.id}
					onclick={() => pick(r.id)}
					><span aria-hidden="true">{r.icon}</span> {r.title[i18n.locale]}</button
				>
			{/each}
		</div>
		{#if role}<p class="mt-2 max-w-2xl text-sm text-slate-400">{role.who[i18n.locale]}</p>{/if}
	</div>

	<div class="mt-4 flex flex-wrap items-center gap-4 text-sm text-slate-400">
		<span>{t('learn.done')}: <b class="text-white">{doneCount} / {total}</b></span>
		<a href={resolve('/learn/glossary')} class="text-sky-300 underline hover:text-sky-200"
			>{t('learn.glossary')}</a
		>
		<a href={resolve('/learn/basics')} class="text-sky-300 underline hover:text-sky-200"
			>{t('learn.contents')}</a
		>
	</div>
	<div class="mt-3 h-1.5 max-w-md overflow-hidden rounded bg-slate-800">
		<div
			class="h-full bg-emerald-400 transition-all"
			style:width="{(doneCount / total) * 100}%"
		></div>
	</div>

	<div class="mt-6 grid gap-3 sm:grid-cols-2">
		<div class="sm:col-span-2"><ContinueCard /></div>
		<a
			href={resolve('/learn/portfolio')}
			class="flex items-center gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 transition-colors hover:border-amber-400"
		>
			<span class="text-2xl" aria-hidden="true">📁</span>
			<span>
				<span class="block font-semibold text-white">{t('learn.portfolio')}</span>
				<span class="block text-sm text-slate-400">{t('learn.portfolioHint')}</span>
			</span>
		</a>
		<a
			href={resolve('/learn/review')}
			class="flex items-center gap-3 rounded-xl border border-violet-500/40 bg-violet-500/10 p-4 transition-colors hover:border-violet-400"
		>
			<span class="text-2xl" aria-hidden="true">🔁</span>
			<span>
				<span class="block font-semibold text-white">{t('learn.review')}</span>
				<span class="block text-sm text-slate-400">{t('learn.reviewHint')}</span>
			</span>
		</a>
	</div>

	<div class="mt-6 rounded-lg border border-slate-800 bg-slate-900/40 p-4 text-sm text-slate-400">
		{t('learn.stuck')}
	</div>

	{#each stages as stage, s (stage.title)}
		<h2 class="mt-10 text-sm font-semibold tracking-wider text-slate-400 uppercase">
			{stage.title}
		</h2>
		<ol class="relative mt-3 space-y-2 border-l border-slate-800 pl-6">
			{#each stage.steps as step (step.kind + step.slug)}
				{@const done = isDone(step, progress)}
				{@const current = next === step}
				<li class="relative">
					<span
						class="absolute top-4 -left-[33px] grid size-4 place-items-center rounded-full text-[10px] {done
							? 'bg-emerald-500 text-slate-950'
							: current
								? 'bg-sky-400 ring-4 ring-sky-400/20'
								: 'border border-slate-600 bg-slate-950'}"
						aria-hidden="true">{done ? '✓' : ''}</span
					>
					<StepLink
						{step}
						class="flex items-center gap-4 rounded-lg border p-3 transition-colors {current
							? 'border-sky-500/50 bg-sky-500/5'
							: 'border-slate-800 bg-slate-900/50 hover:border-slate-600'}"
					>
						<span class="text-xl" aria-hidden="true"
							>{step.kind === 'chapter' ? '📘' : step.debug ? '🐞' : '🛠'}</span
						>
						<span class="min-w-0 flex-1">
							<span class="flex flex-wrap items-center gap-2">
								<span class="font-semibold text-white">{step.title}</span>
								<span class="text-[10px] text-slate-500 uppercase"
									>{step.kind === 'chapter'
										? `${t('learn.chapter')} · ${step.minutes} min`
										: step.debug
											? t('learn.findBug')
											: t('learn.exercise')}</span
								>
								{#if done}<span class="sr-only">({t('learn.done')})</span>{/if}
								{#if current}<span class="rounded bg-sky-500/20 px-1.5 text-[10px] text-sky-200"
										>{t('learn.now')}</span
									>{/if}
							</span>
							<span class="block text-sm text-slate-400">{step.summary}</span>
						</span>
						<span class="text-slate-500" aria-hidden="true">→</span>
					</StepLink>
				</li>
			{/each}
		</ol>
		{#if s === stages.length - 1}
			<p class="mt-6 text-sm text-slate-500">{t('learn.after')}</p>
		{/if}
	{/each}
</section>
