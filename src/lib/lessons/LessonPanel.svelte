<script lang="ts">
	import { reviewSt } from './review.js';
	import { localized } from '#lib/learn/path.js';
	import type { Hardware } from '#lib/hw/hw.js';
	import type { StVariable } from '#lib/st/compiler.js';
	import type { ProjectVersion } from '#lib/project/versions.js';
	import { i18n, t } from '#lib/i18n/i18n.svelte.js';
	import { resolve } from '$app/paths';
	import type { CompiledLadder } from '#lib/ladder/compiler.js';
	import type { LadderProgram } from '#lib/ladder/model.js';
	import type { Circuit } from '#lib/circuit/model.js';
	import type { Hmi } from '#lib/hmi/model.js';
	import type { Sfc } from '#lib/sfc/sfc.js';
	import type { Fbd } from '#lib/fbd/fbd.js';
	import type { SymbolMap } from '#lib/symbols/symbols.js';
	import { addressResolver, GUIDES } from './guide.js';
	import { onMount } from 'svelte';
	import { completedLessons, markCompleted } from './progress.js';
	import RichText from './RichText.svelte';
	import { runLessonTests } from './runner.js';
	import type { Lesson, TestResult } from './types.js';
	import TicketCard from '#lib/story/TicketCard.svelte';
	import { getTicket, type Ticket } from '#lib/story/tickets.js';
	import { loadStory, solveTicket, updateTicket, type TicketRecord } from '#lib/story/progress.js';

	type Props = {
		lesson: Lesson;
		compiled: CompiledLadder;
		blocked: boolean;
		onShowSolution: () => void;
		onRestart: () => void;
		ladder: LadderProgram;
		symbols: SymbolMap;
		online: boolean;
		language: 'ladder' | 'st' | 'sfc' | 'fbd' | 'stl';
		circuit: Circuit;
		hmi: Hmi;
		st: string;
		sfc: Sfc;
		fbd: Fbd;
		stl: string;
		hw: Hardware | null;
		safety: string;
		/** variables of the compiled ST program (tests read DB fields and strings) */
		variables: StVariable[];
		/** saved versions of the project (change-management lessons) */
		history: ProjectVersion[];
	};
	let {
		lesson,
		compiled,
		blocked,
		onShowSolution,
		onRestart,
		ladder,
		symbols,
		online,
		language,
		circuit,
		hmi,
		st,
		sfc,
		fbd,
		stl,
		hw,
		safety,
		variables,
		history
	}: Props = $props();

	let results = $state.raw<TestResult[] | null>(null);
	let hintsShown = $state(0);
	let checking = $state(false);

	const LEVELS = {
		basics: 'lesson.level.basics',
		logic: 'lesson.level.logic',
		timers: 'lesson.level.timers',
		process: 'lesson.level.process'
	} as const;
	const passed = $derived(results !== null && results.every((r) => r.passed));
	let completedBefore = $state(false);
	onMount(() => (completedBefore = completedLessons().has(lesson.slug)));

	/* story mode: the lesson opened from a foreman's ticket (?ticket=z03) */
	let ticket = $state<Ticket | null>(null);
	let record = $state<TicketRecord | null>(null);
	let justSolved = $state(false);
	onMount(() => {
		const t = getTicket(new URLSearchParams(location.search).get('ticket') ?? '');
		if (!t || t.lesson !== lesson.slug) return;
		ticket = t;
		record = loadStory()[t.id] ?? updateTicket(t.id, () => {});
	});
	/** Count attempts only while the ticket is still open. */
	function track(change: (r: TicketRecord) => void) {
		if (ticket && record?.solvedAt === undefined) record = updateTicket(ticket.id, change);
	}
	function showSolution() {
		track((r) => (r.usedSolution = true));
		onShowSolution();
	}

	/* live step-by-step guide */
	const guide = $derived(GUIDES[lesson.slug] ?? []);
	const ticks = $derived.by(() => {
		const ctx = {
			ladder,
			circuit,
			hmi,
			st,
			sfc,
			fbd,
			stl,
			hw: hw ?? undefined,
			safety,
			history,
			addr: addressResolver(symbols),
			online,
			passed: passed || completedBefore
		};
		return guide.map((step) => step.done(ctx));
	});
	const nextStep = $derived(ticks.indexOf(false));
	/** what the tests cannot see: habits of the code, advisory */
	const review = $derived(reviewSt(st, hmi));

	function check() {
		if (blocked) {
			results = [{ name: 'Program', passed: false, message: t('lesson.fixFirst') }];
			return;
		}
		checking = true;
		// let the button show its busy state, then run the (synchronous) simulation
		setTimeout(() => {
			results = runLessonTests(
				lesson,
				compiled.program,
				$state.snapshot(circuit) as Circuit,
				[],
				$state.snapshot(compiled.load),
				hw ? ($state.snapshot(hw) as Hardware) : undefined,
				{ hmi: $state.snapshot(hmi) as Hmi, symbols, variables }
			);
			checking = false;
			if (results.every((r) => r.passed)) {
				markCompleted(lesson.slug);
				if (ticket) {
					justSolved = record?.solvedAt === undefined;
					record = solveTicket(ticket.id);
				}
			} else track((r) => r.failedChecks++);
		}, 20);
	}
</script>

<section
	lang="pl"
	aria-labelledby="lesson-title"
	class="space-y-3 rounded-lg border border-sky-500/30 bg-sky-500/5 p-3"
>
	{#if ticket}<TicketCard {ticket} {record} {justSolved} part="brief" />{/if}

	<div>
		<p class="text-[10px] font-semibold tracking-wider text-sky-300 uppercase">
			{lesson.kind === 'debug'
				? t('lesson.debug')
				: lesson.kind === 'capstone'
					? t('lesson.capstone')
					: lesson.kind === 'brownfield'
						? t('lesson.brownfield')
						: lesson.kind === 'commissioning'
							? t('lesson.commissioning')
							: t('lesson.exercise')} · {t(LEVELS[lesson.level])}
		</p>
		<h2 id="lesson-title" class="text-sm font-semibold text-white">
			{localized({ ...lesson, kind: 'lesson' }, i18n.locale).title}
		</h2>
	</div>

	{#if i18n.locale === 'en'}
		<p
			class="rounded border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-100"
		>
			{t('lesson.polishContent')}
		</p>
	{/if}
	<div class="space-y-2 text-xs leading-relaxed text-slate-300" lang="pl">
		{#each lesson.instructions as p, i (i)}<p><RichText text={p} /></p>{/each}
	</div>

	{#if guide.length && (language === 'ladder' || lesson.kind === 'commissioning' || lesson.solutionSt || lesson.solutionSfc || lesson.solutionFbd || lesson.solutionStl || lesson.solutionHw || lesson.solutionSafety)}
		<div lang="pl">
			<p class="mb-1 text-[10px] font-semibold tracking-wider text-sky-300 uppercase">
				{t('lesson.steps')} · {ticks.filter(Boolean).length}/{guide.length}
			</p>
			<ol class="space-y-1 text-xs" aria-label={t('lesson.steps')}>
				{#each guide as step, i (i)}
					<li
						class="flex gap-2 rounded px-1.5 py-1 {i === nextStep
							? 'bg-sky-500/15 text-white ring-1 ring-sky-500/40'
							: ticks[i]
								? 'text-slate-400'
								: 'text-slate-500'}"
						aria-current={i === nextStep ? 'step' : undefined}
					>
						<span
							class="mt-px grid size-4 shrink-0 place-items-center rounded-full text-[10px] {ticks[
								i
							]
								? 'bg-emerald-500 text-slate-950'
								: 'border border-slate-600'}"
							aria-label={ticks[i] ? t('lesson.done') : t('lesson.todo')}
							>{ticks[i] ? '✓' : i + 1}</span
						>
						<span class="leading-relaxed"><RichText text={step.text} /></span>
					</li>
				{/each}
			</ol>
		</div>
	{/if}

	<div class="flex flex-wrap gap-2">
		<button
			class="rounded-md bg-sky-500 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-sky-400 disabled:opacity-60"
			disabled={checking}
			onclick={check}
		>
			{checking ? t('lesson.checking') : t('lesson.check')}
		</button>
		{#if hintsShown < lesson.hints.length}
			<button
				class="rounded-md border border-slate-700 px-2.5 py-1.5 text-xs hover:border-slate-500"
				onclick={() => {
					hintsShown++;
					track((r) => r.hints++);
				}}
			>
				{t('lesson.hint', { n: hintsShown + 1, total: lesson.hints.length })}
			</button>
		{/if}
	</div>

	{#if hintsShown > 0}
		<ul class="space-y-1.5 text-xs text-amber-200/90">
			{#each lesson.hints.slice(0, hintsShown) as h, i (i)}<li>💡 <RichText text={h} /></li>{/each}
		</ul>
	{/if}

	{#if results && lesson.kind === 'capstone'}
		<p class="text-[10px] font-semibold tracking-wider text-slate-400 uppercase">
			{t('lesson.fat')} · {results.filter((r) => r.passed).length}/{results.length}
		</p>
	{/if}
	{#if results}
		<ul class="space-y-1 text-xs" aria-live="polite">
			{#each results as r (r.name)}
				<li
					class="rounded px-2 py-1 {r.passed
						? 'bg-emerald-500/10 text-emerald-200'
						: 'bg-red-500/10 text-red-200'}"
				>
					{r.passed ? '✓' : '✗'}
					{r.name}
					{#if r.message}
						<div class="mt-0.5 text-[11px] text-red-300/90">
							{r.message}{#if r.atMs !== undefined}
								<span class="text-slate-500">
									{t('lesson.at', { s: (r.atMs / 1000).toFixed(2) })}</span
								>{/if}
						</div>
					{/if}
				</li>
			{/each}
		</ul>
		{#if passed && ticket}
			<TicketCard {ticket} {record} {justSolved} part="debrief" />
		{:else if passed}
			<p class="rounded bg-emerald-500/15 px-2 py-1.5 text-xs font-semibold text-emerald-200">
				{t('lesson.passed')} <a href={resolve('/learn')} class="underline">{t('lesson.next')}</a>
			</p>
		{/if}
	{/if}

	{#if language === 'st' && (lesson.kind === 'capstone' || passed)}
		<details
			class="rounded border border-slate-800 bg-slate-900/50 p-2 text-xs"
			open={lesson.kind === 'capstone' && passed}
		>
			<summary class="cursor-pointer font-semibold text-slate-300">{t('lesson.review')}</summary>
			<p class="mt-1 text-[11px] text-slate-500">{t('lesson.reviewIntro')}</p>
			<ul class="mt-1.5 space-y-1" aria-label={t('lesson.review')}>
				{#each review as item, i (i)}
					<li class={item.ok ? 'text-emerald-300' : 'text-amber-200'}>
						{item.ok ? '✓' : '•'}
						<RichText text={item.text} />
					</li>
				{/each}
			</ul>
		</details>
	{/if}

	<div class="flex gap-3 border-t border-slate-800 pt-2 text-[11px]">
		<button class="text-slate-400 underline hover:text-slate-200" onclick={showSolution}
			>{t('lesson.showSolution')}</button
		>
		<button class="text-slate-400 underline hover:text-slate-200" onclick={onRestart}
			>{t('lesson.restart')}</button
		>
	</div>
</section>
