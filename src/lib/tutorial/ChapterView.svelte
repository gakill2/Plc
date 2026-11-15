<script lang="ts">
	import { localized } from '#lib/learn/path.js';
	import { i18n, t } from '#lib/i18n/i18n.svelte.js';
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';
	import { getLesson, lessonProjectId } from '#lib/lessons/lessons.js';
	import AddressExplorer from './AddressExplorer.svelte';
	import AnalogDemo from './AnalogDemo.svelte';
	import ControlDemo from './ControlDemo.svelte';
	import ModbusDemo from './ModbusDemo.svelte';
	import SafetyDemo from './SafetyDemo.svelte';
	import PwmDemo from './PwmDemo.svelte';
	import DriveLab from './DriveLab.svelte';
	import SubnetCalc from './SubnetCalc.svelte';
	import NetDoctor from './NetDoctor.svelte';
	import MqttDemo from './MqttDemo.svelte';
	import FirewallLab from './FirewallLab.svelte';
	import StepLab from './StepLab.svelte';
	import CabinetCalc from './CabinetCalc.svelte';
	import WiringDemo from './WiringDemo.svelte';
	import MiniSim from './MiniSim.svelte';
	import PlcOverview from './PlcOverview.svelte';
	import { markQuizSolved, solvedQuizzes } from './progress.js';
	import Prose from './Prose.svelte';
	import Quiz from './Quiz.svelte';
	import ScanCycleDemo from './ScanCycleDemo.svelte';
	import type { Chapter } from './types.js';

	let { chapter }: { chapter: Chapter } = $props();

	let solved = $state<ReadonlySet<string>>(new Set());
	onMount(() => (solved = solvedQuizzes()));

	/** Quiz number within the chapter for each block index. */
	const quizIndex = $derived.by(() => {
		let n = 0;
		return chapter.blocks.map((b) => (b.kind === 'quiz' ? n++ : -1));
	});

	function onSolved(i: number) {
		const id = `${chapter.slug}:${i}`;
		markQuizSolved(id);
		solved = new Set([...solved, id]);
	}

	const TONE = {
		info: 'border-sky-500/40 bg-sky-500/5 [&_p.title]:text-sky-300',
		warn: 'border-amber-500/40 bg-amber-500/5 [&_p.title]:text-amber-300',
		tip: 'border-emerald-500/40 bg-emerald-500/5 [&_p.title]:text-emerald-300'
	};
	const ICON = { info: 'ℹ', warn: '⚠', tip: '💡' };
</script>

<div class="space-y-6">
	{#each chapter.blocks as block, i (i)}
		{#if block.kind === 'text'}
			<Prose text={block.text} />
		{:else if block.kind === 'callout'}
			<aside class="rounded-lg border-l-4 px-4 py-3 {TONE[block.tone]}">
				{#if block.title}<p class="title mb-1 text-sm font-semibold">
						{ICON[block.tone]}
						{block.title}
					</p>{/if}
				<Prose text={block.text} />
			</aside>
		{:else if block.kind === 'sim'}
			<MiniSim {block} />
		{:else if block.kind === 'code'}
			<pre
				class="overflow-x-auto rounded-lg bg-slate-900 p-4 font-mono text-sm text-slate-200">{block.code}</pre>
		{:else if block.kind === 'table'}
			<div class="overflow-x-auto">
				<table class="w-full text-left text-sm">
					<thead class="border-b border-slate-700 text-xs tracking-wider text-slate-400 uppercase">
						<tr
							>{#each block.head as h, k (k)}<th class="px-3 py-2 font-medium">{h}</th>{/each}</tr
						>
					</thead>
					<tbody>
						{#each block.rows as row, r (r)}
							<tr class="border-b border-slate-800">
								{#each row as cell, k (k)}
									<td class="px-3 py-2 {k === 0 ? 'font-mono text-slate-100' : 'text-slate-300'}"
										>{cell}</td
									>
								{/each}
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{:else if block.kind === 'quiz'}
			<Quiz
				question={block.question}
				options={block.options}
				correct={block.correct}
				explanation={block.explanation}
				solved={solved.has(`${chapter.slug}:${quizIndex[i]}`)}
				onSolved={() => onSolved(quizIndex[i])}
			/>
		{:else if block.kind === 'scan-cycle'}
			<ScanCycleDemo />
		{:else if block.kind === 'address-explorer'}
			<AddressExplorer />
		{:else if block.kind === 'plc-overview'}
			<PlcOverview />
		{:else if block.kind === 'wiring'}
			<WiringDemo />
		{:else if block.kind === 'analog'}
			<AnalogDemo />
		{:else if block.kind === 'control'}
			<ControlDemo initial={block.initial} />
		{:else if block.kind === 'modbus'}
			<ModbusDemo />
		{:else if block.kind === 'safety'}
			<SafetyDemo />
		{:else if block.kind === 'pwm'}
			<PwmDemo />
		{:else if block.kind === 'drive-lab'}
			<DriveLab />
		{:else if block.kind === 'subnet'}
			<SubnetCalc />
		{:else if block.kind === 'net-doctor'}
			<NetDoctor />
		{:else if block.kind === 'mqtt'}
			<MqttDemo />
		{:else if block.kind === 'firewall'}
			<FirewallLab />
		{:else if block.kind === 'step-lab'}
			<StepLab />
		{:else if block.kind === 'cabinet'}
			<CabinetCalc />
		{:else if block.kind === 'lesson'}
			{@const lesson = getLesson(block.slug)}
			{#if lesson}
				<a
					href={resolve('/editor/[id]', { id: lessonProjectId(lesson.slug) })}
					class="flex items-center gap-4 rounded-lg border border-sky-500/40 bg-sky-500/10 p-4 hover:border-sky-400"
				>
					<span
						class="grid size-10 shrink-0 place-items-center rounded-full bg-sky-500 text-lg text-slate-950"
						>▶</span
					>
					<span>
						<span class="block text-xs font-semibold tracking-wider text-sky-300 uppercase"
							>{lesson.kind === 'debug' ? t('learn.findBug') : t('learn.exerciseEditor')}</span
						>
						<span class="block font-semibold text-white"
							>{localized({ ...lesson, kind: 'lesson' }, i18n.locale).title}</span
						>
						<span class="block text-sm text-slate-400">{block.text}</span>
					</span>
				</a>
			{/if}
		{/if}
	{/each}
</div>
