<script lang="ts">
	import { onDestroy, untrack } from 'svelte';
	import CircuitEditor from '#lib/circuit/CircuitEditor.svelte';
	import { inputDrive, portOf } from '#lib/circuit/model.js';
	import { terminalBit } from '#lib/circuit/context.js';
	import { readNumber } from '#lib/runtime/read.js';
	import { parseAddress } from '#lib/engine/index.js';
	import { CircuitSim } from '#lib/circuit/sim.svelte.js';
	import type { CompiledLadder } from '#lib/ladder/compiler.js';
	import { createMonitor } from '#lib/ladder/monitor.js';
	import { demoProject, loadProject, parseProject } from '#lib/project/project.js';
	import { History } from '#lib/project/history.js';
	import { encodeProject } from '#lib/project/share.js';
	import { saveProject } from '#lib/project/storage.js';
	import { resolve } from '$app/paths';
	import LessonPanel from '#lib/lessons/LessonPanel.svelte';
	import TipToast from '#lib/tips/TipToast.svelte';
	import { getLesson, LESSON_PREFIX } from '#lib/lessons/lessons.js';
	import ProcessView from '#lib/processes/ProcessView.svelte';
	import { createProcess } from '#lib/processes/models.js';
	import type { ProgramLanguage } from '#lib/project/project.js';
	import type { StVariable } from '#lib/st/compiler.js';
	import { DEMO_ST, EMPTY_ST } from '#lib/st/examples.js';
	import StEditor from '#lib/st/StEditor.svelte';
	import StVariables from '#lib/st/StVariables.svelte';
	import { ProjectState, type Problem } from '#lib/project/state.svelte.js';
	import { PlcRuntime } from '#lib/runtime/runtime.svelte.js';
	import { resolveSymbol } from '#lib/symbols/symbols.js';
	import CodeView from './CodeView.svelte';
	import IoPanel from './IoPanel.svelte';
	import LadderEditor from './LadderEditor.svelte';
	import XrefPanel from './XrefPanel.svelte';
	import ExplainPanel from './ExplainPanel.svelte';
	import DebugView from './DebugView.svelte';
	import { watchEntry } from '#lib/monitor/watch.js';
	import IoCheck from './IoCheck.svelte';
	import HmiView from '#lib/hmi/HmiView.svelte';
	import { ackAlarms, newAlarmLog, unacked, updateAlarms } from '#lib/hmi/alarms.js';
	import { readBit } from '#lib/runtime/read.js';
	import { findRung } from '#lib/ladder/ops.js';
	import Palette from './Palette.svelte';
	import RuntimeToolbar from './RuntimeToolbar.svelte';
	import SymbolTable from './SymbolTable.svelte';
	import TrendChart from '#lib/monitor/TrendChart.svelte';
	import WatchTable from '#lib/monitor/WatchTable.svelte';
	import { traceSignal, tryParse, type TrendLane } from '#lib/monitor/watch.js';
	import type { TraceSignal } from '#lib/runtime/protocol.js';

	type Props = { projectId: string };
	let { projectId }: Props = $props();

	type View = 'program' | 'process' | 'circuit' | 'symbols' | 'watch' | 'debug' | 'hmi' | 'iocheck';

	let showTrend = $state(true);

	// The workspace is re-created ({#key}) when the project changes, so reading the id once is fine.
	const id = untrack(() => projectId);
	/** Lesson projects start from the lesson's starter when nothing is saved yet. */
	const startLesson = untrack(() =>
		projectId.startsWith(LESSON_PREFIX) ? getLesson(projectId.slice(LESSON_PREFIX.length)) : null
	);
	let project = $state(
		new ProjectState(
			loadProject(
				localStorage,
				untrack(() => projectId),
				startLesson ? startLesson.starter : demoProject
			)
		)
	);
	const lesson = $derived(project.lesson ? getLesson(project.lesson) : null);

	const VIEWS: { id: View; label: string }[] = $derived([
		{ id: 'program', label: 'Program' },
		...(project.scenario ? [{ id: 'process' as const, label: 'Process' }] : []),
		{ id: 'circuit', label: 'Circuit' },
		...(lesson?.kind === 'commissioning' ? [{ id: 'iocheck' as const, label: 'Test I/O' }] : []),
		{ id: 'hmi', label: 'HMI' },
		{ id: 'symbols', label: 'Symbols' },
		{ id: 'watch', label: 'Watch' },
		{ id: 'debug', label: 'Debug' }
	]);

	// The simulated plant runs in the worker next to the PLC.
	$effect(() => runtime.setProcess(project.scenario ?? null));
	/** Input terminals driven by the plant (shown read-only in the I/O panel). */
	const processSensors = $derived(project.scenario ? createProcess(project.scenario).sensors : []);
	const doc = $derived(project.ladder);
	const sim = new CircuitSim();
	const runtime = new PlcRuntime();
	onDestroy(() => runtime.dispose());

	let view = $state<View>('program');
	// the Process tab disappears when the plant is disconnected (or undone)
	$effect(() => {
		if (!project.scenario && untrack(() => view) === 'process') view = 'program';
	});

	/* ---------- saving and undo / redo ---------- */

	const history = new History<string>();
	let canUndo = $state(false);
	let canRedo = $state(false);
	const syncHistory = () => ([canUndo, canRedo] = [history.canUndo, history.canRedo]);

	$effect(() => {
		const snapshot = project.toJSON();
		const json = JSON.stringify(snapshot);
		untrack(() => {
			saveProject(localStorage, id, snapshot);
			if (history.record(json)) syncHistory();
		});
	});

	function travel(direction: 'undo' | 'redo') {
		if (runtime.online) return;
		const json = direction === 'undo' ? history.undo() : history.redo();
		const snapshot = json ? parseProject(JSON.parse(json)) : null;
		if (snapshot) {
			project.restore(snapshot);
			project.ladder.select(null);
		}
		syncHistory();
	}

	/* ---------- sharing ---------- */

	let shareUrl = $state<string | null>(null);
	let copied = $state(false);

	async function share() {
		const hash = await encodeProject(project.toJSON());
		shareUrl = `${location.origin}${resolve('/share')}#${hash}`;
		copied = false;
		try {
			await navigator.clipboard.writeText(shareUrl);
			copied = true;
		} catch {
			// clipboard not available — the link is shown for manual copying
		}
	}

	function exportFile() {
		const blob = new Blob([JSON.stringify(project.toJSON(), null, 2)], {
			type: 'application/json'
		});
		const a = document.createElement('a');
		a.href = URL.createObjectURL(blob);
		a.download = `${(project.name || 'project').replace(/[^\w-]+/g, '_')}.plcsim.json`;
		a.click();
		URL.revokeObjectURL(a.href);
	}

	// Devices drive the input terminals they are wired to.
	let sent = new Map<string, boolean>();
	$effect(() => {
		const outputs = runtime.snapshot?.outputs;
		const drive = inputDrive(project.circuit, sim.actuated, {
			positions: sim.positions,
			output: (t) => terminalBit(outputs, t),
			vfd: (id) => sim.vfd[id]
		});
		untrack(() => {
			for (const [terminal, value] of drive)
				if (sent.get(terminal) !== value) runtime.setInput(terminal, value);
			for (const terminal of sent.keys())
				if (!drive.has(terminal)) runtime.setInput(terminal, false);
			sent = drive;
		});
	});

	// Frequency inverters run on the PLC's simulated time and drive analog input words.
	let deviceTime = 0;
	let sentWords = new Map<string, number>();
	$effect(() => {
		const snap = runtime.snapshot;
		if (!snap) return;
		untrack(() => {
			const dt = snap.timeMs - deviceTime;
			deviceTime = snap.timeMs;
			if (!project.circuit.devices.some((d) => d.type === 'vfd')) return;
			const words = sim.stepDevices(project.circuit, Math.min(500, Math.max(0, dt)), {
				bit: (t) => terminalBit(snap.outputs, t),
				word: (a) => readNumber(snap, parseAddress(a)) ?? 0
			});
			for (const [address, value] of words)
				if (sentWords.get(address) !== value) runtime.setInputNumber(address, value);
			sentWords = words;
		});
	});

	/* ---------- operator panel: alarms ---------- */

	let alarmLog = $state.raw(newAlarmLog());
	let ackPending = false;
	$effect(() => {
		const snap = runtime.snapshot;
		if (!snap) return;
		untrack(() => {
			if (ackPending && project.hmi.ackTag.trim()) {
				ackPending = false;
				hmiWrite(project.hmi.ackTag, 0);
			}
			alarmLog = updateAlarms(
				alarmLog,
				project.hmi.alarms,
				(tag) => {
					try {
						return readBit(snap, parseAddress(resolveSymbol(project.symbols.map, tag.trim())));
					} catch {
						return null;
					}
				},
				snap.timeMs
			);
		});
	});
	function hmiWrite(tag: string, value: number) {
		try {
			runtime.modify(resolveSymbol(project.symbols.map, tag.trim()), value);
		} catch {
			// an invalid tag is reported in the panel editor
		}
	}
	function ackAlarm(seqs?: number[]) {
		alarmLog = ackAlarms(alarmLog, runtime.snapshot?.timeMs ?? 0, seqs);
		if (project.hmi.ackTag.trim()) {
			hmiWrite(project.hmi.ackTag, 1);
			ackPending = true;
		}
	}
	const pendingAlarms = $derived(unacked(alarmLog));

	/** Device labels per terminal, for the I/O panel. */
	const terminalLabels = $derived.by(() => {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- local, rebuilt on every change
		const map = new Map<string, string>();
		for (const w of project.circuit.wires) {
			const d = project.circuit.devices.find((x) => x.id === w.device);
			if (!d) continue;
			const label = d.label + (portOf(d.type, w.port)?.suffix ?? '');
			map.set(w.terminal, map.has(w.terminal) ? `${map.get(w.terminal)}, ${label}` : label);
		}
		for (const t of processSensors) map.set(t, map.has(t) ? `${map.get(t)} · plant` : 'plant');
		return map;
	});

	/** The compiled program currently downloaded to the PLC — its probes drive the live view. */
	let loaded = $state.raw<CompiledLadder | null>(null);
	let flashProblems = $state(false);
	let flashTimer: ReturnType<typeof setTimeout> | undefined;

	const problems = $derived(project.problems);

	/** Watch rows ticked for the trend → signals recorded by the worker on every scan. */
	const trend = $derived.by(() => {
		const signals: TraceSignal[] = [];
		const lanes: TrendLane[] = [];
		for (const entry of project.watch) {
			if (!entry.trend) continue;
			const addr = tryParse(resolveSymbol(project.symbols.map, entry.operand));
			if (!addr) continue;
			signals.push(traceSignal(entry, resolveSymbol(project.symbols.map, entry.operand)));
			lanes.push({ label: entry.operand, format: entry.format });
		}
		return { signals, lanes, key: JSON.stringify(signals) };
	});
	/** Empty trend: plot the watch rows, or — with no watch rows — the I/O symbols. */
	function plotMainSignals() {
		if (project.watch.length === 0) {
			const io = [...project.userSymbols, ...project.deviceSymbols].filter((s) =>
				/^[IQM]\d+\.\d$/i.test(s.address.trim())
			);
			project.watch = io.slice(0, 8).map((s) => watchEntry(s.name, 'BOOL', true));
			return;
		}
		project.watch.slice(0, 8).forEach((e) => (e.trend = true));
	}
	let tracedKey = '';
	$effect(() => {
		const { signals, key } = trend;
		if (key !== tracedKey) {
			tracedKey = key;
			runtime.setTrace(signals);
		}
	});
	const monitor = $derived(
		runtime.online && runtime.snapshot && loaded
			? createMonitor(runtime.snapshot, loaded.taps, (t) => resolveSymbol(project.symbols.map, t))
			: null
	);

	function download(): boolean {
		const blocking = problems.filter((p) => p.source !== 'circuit');
		if (blocking.length > 0) {
			flashProblems = true;
			clearTimeout(flashTimer);
			flashTimer = setTimeout(() => (flashProblems = false), 1500);
			return false;
		}
		loaded = project.compiled;
		loadedVariables = project.stResult?.variables ?? [];
		return true;
	}

	function run() {
		if (runtime.status === 'PAUSED') runtime.resume();
		else if (download()) runtime.start(loaded!.program);
	}

	function step() {
		if (runtime.status === 'PAUSED') runtime.step(loaded!.program);
		else if (download()) runtime.step(loaded!.program);
	}

	function showProblem(p: Problem) {
		view = p.source === 'program' ? 'program' : p.source;
		if (p.source === 'program') doc.select(p.id);
	}

	/** Jumps to a cross-reference / warning owner: a ladder node id or an ST "L<line>". */
	function jumpTo(owner: string | null) {
		view = 'program';
		if (owner && project.language === 'ladder') doc.select(owner);
	}

	function place(owner: string): string {
		const line = /^L(\d+)$/.exec(owner);
		if (line) return `line ${line[1]}`;
		const rung = findRung(doc.program, owner);
		return rung ? `N${doc.program.rungs.indexOf(rung) + 1}` : '?';
	}

	function onKeydown(e: KeyboardEvent) {
		const target = e.target as HTMLElement;
		if (target.closest('input, select, textarea, .cm-editor')) return;
		const mod = e.ctrlKey || e.metaKey;
		if (mod && e.key.toLowerCase() === 'z') {
			e.preventDefault();
			travel(e.shiftKey ? 'redo' : 'undo');
			return;
		}
		if (mod && e.key.toLowerCase() === 'y') {
			e.preventDefault();
			travel('redo');
			return;
		}
		if (view !== 'program' || project.language !== 'ladder') return;
		if (e.key === 'Escape') doc.select(null);
		if (mod && !runtime.online && !window.getSelection()?.toString()) {
			const key = e.key.toLowerCase();
			const action =
				key === 'c' ? doc.copy : key === 'v' ? doc.paste : key === 'd' ? doc.duplicate : null;
			if (action && action.call(doc)) e.preventDefault();
			else if (key === 'd') e.preventDefault(); // never open the bookmark dialog here
			if (action) return;
		}
		if ((e.key === 'Delete' || e.key === 'Backspace') && !runtime.online) {
			e.preventDefault();
			doc.removeSelected();
		}
	}

	/** Variables of the ST program that is running (the source may have been edited since). */
	let loadedVariables = $state.raw<StVariable[]>([]);

	function setLanguage(language: ProgramLanguage) {
		if (language === 'st' && !project.st.trim()) project.st = lesson ? EMPTY_ST : DEMO_ST;
		project.language = language;
	}

	function showSolution() {
		if (lesson && confirm('Zastąpić Twój program rozwiązaniem wzorcowym?')) {
			project.ladder.program = lesson.solution();
			if (lesson.solutionCircuit) project.circuit = lesson.solutionCircuit();
			if (lesson.solutionHmi) project.hmi = lesson.solutionHmi();
			project.ladder.select(null);
			view = 'program';
		}
	}

	function restartLesson() {
		if (
			lesson &&
			confirm('Zacząć ćwiczenie od nowa? Program, obwód i symbole wrócą do stanu początkowego.')
		) {
			runtime.stop();
			project = new ProjectState(lesson.starter());
			sim.reset();
		}
	}

	function resetToDemo() {
		if (confirm('Replace the whole project (program, circuit, symbols) with the demo?')) {
			project = new ProjectState(demoProject());
			sim.reset();
		}
	}
</script>

<svelte:window onkeydown={onKeydown} />

{#snippet languageSwitch()}
	<div
		class="flex shrink-0 gap-0.5 rounded-md border border-slate-800 bg-slate-900 p-0.5"
		role="group"
		aria-label="Language"
	>
		{#each [{ id: 'ladder', label: 'Ladder (LAD)' }, { id: 'st', label: 'Structured Text' }] as const as l (l.id)}
			<button
				class="rounded px-2.5 py-1 text-xs font-medium disabled:cursor-not-allowed {project.language ===
				l.id
					? 'bg-sky-600 text-white'
					: 'text-slate-400 hover:text-white'}"
				aria-pressed={project.language === l.id}
				disabled={runtime.online}
				onclick={() => setLanguage(l.id)}
			>
				{l.label}
			</button>
		{/each}
	</div>
{/snippet}

<div class="p-8 text-center text-sm text-slate-400 lg:hidden">
	The editor needs a wider screen (at least 1024 px). Try a laptop or desktop — or rotate your
	tablet.
</div>

<div class="hidden h-[calc(100dvh-3.5rem)] flex-col lg:flex">
	<div
		class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-4 py-2"
	>
		<div class="flex items-center gap-2">
			<input
				class="w-56 rounded border border-transparent bg-transparent px-2 py-1 text-sm font-semibold text-white outline-none hover:border-slate-700 focus:border-emerald-500 disabled:opacity-70"
				placeholder={lesson ? lesson.title : 'Untitled project'}
				bind:value={project.name}
				disabled={!!lesson}
				aria-label="Project name"
			/>
			<div class="flex gap-0.5">
				<button
					class="rounded px-2 py-1 text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-30"
					title="Undo (Ctrl+Z)"
					aria-label="Undo"
					disabled={!canUndo || runtime.online}
					onclick={() => travel('undo')}>↶</button
				>
				<button
					class="rounded px-2 py-1 text-sm text-slate-300 hover:bg-slate-800 disabled:opacity-30"
					title="Redo (Ctrl+Shift+Z)"
					aria-label="Redo"
					disabled={!canRedo || runtime.online}
					onclick={() => travel('redo')}>↷</button
				>
				<button class="rounded px-2 py-1 text-xs text-slate-300 hover:bg-slate-800" onclick={share}
					>Share</button
				>
				<button
					class="rounded px-2 py-1 text-xs text-slate-300 hover:bg-slate-800"
					onclick={exportFile}>Export</button
				>
				<a
					class="rounded px-2 py-1 text-xs text-slate-300 hover:bg-slate-800"
					href={resolve('/editor/[id]/report', { id })}
					title="Printable report: ladder diagram, symbol table and I/O list (PDF / PNG)">Report</a
				>
			</div>
		</div>
		<nav
			class="flex gap-0.5 rounded-md border border-slate-800 bg-slate-900 p-0.5"
			aria-label="Views"
		>
			{#each VIEWS as v (v.id)}
				<button
					class="rounded px-3 py-1 text-xs font-medium {view === v.id
						? 'bg-slate-700 text-white'
						: 'text-slate-400 hover:text-white'}"
					aria-current={view === v.id ? 'page' : undefined}
					onclick={() => (view = v.id)}
				>
					{v.label}
					{#if problems.some((p) => p.source === v.id)}<span class="ml-1 text-red-400">●</span>{/if}
					{#if v.id === 'hmi' && pendingAlarms}<span
							class="ml-1 rounded-full bg-red-500 px-1.5 text-[10px] text-white"
							aria-label="{pendingAlarms} unacknowledged alarms">{pendingAlarms}</span
						>{/if}
				</button>
			{/each}
			<span class="mx-1 w-px bg-slate-700"></span>
			<button
				class="rounded px-3 py-1 text-xs font-medium {showTrend
					? 'bg-slate-700 text-white'
					: 'text-slate-400 hover:text-white'}"
				aria-pressed={showTrend}
				onclick={() => (showTrend = !showTrend)}
			>
				Trend
			</button>
			{#if runtime.forces.size}
				<button
					class="ml-1 rounded bg-red-600 px-2 py-1 text-[11px] font-bold text-white"
					title="Forces active — open the watch table"
					onclick={() => (view = 'watch')}
				>
					F × {runtime.forces.size}
				</button>
			{/if}
		</nav>
		<RuntimeToolbar {runtime} onRun={run} onStep={step} />
	</div>

	<div class="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_20rem]">
		<div class="flex min-h-0 flex-col">
			<div class="min-h-0 flex-1">
				{#if view === 'program' && project.language === 'st'}
					<div class="flex h-full flex-col">
						<div class="flex items-center gap-3 border-b border-slate-800 px-4 py-2">
							{@render languageSwitch()}
							<span class="text-[11px] text-slate-500">
								Ctrl+Space for completions · symbols and VAR names can be used directly
							</span>
						</div>
						<div class="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_16rem]">
							<StEditor
								value={project.st}
								onChange={(text) => (project.st = text)}
								diagnostics={project.stResult?.diagnostics ?? []}
								readOnly={runtime.online}
								names={() => ({
									symbols: [...project.deviceSymbols, ...project.userSymbols],
									variables: project.stResult?.variables ?? []
								})}
							/>
							<div class="overflow-auto border-l border-slate-800 p-3">
								<StVariables
									variables={(loaded && runtime.online
										? loadedVariables
										: project.stResult?.variables) ?? []}
									snapshot={runtime.snapshot}
									online={runtime.online}
								/>
							</div>
						</div>
					</div>
				{:else if view === 'program'}
					<div class="flex h-full flex-col">
						<div class="flex flex-wrap items-center gap-3 border-b border-slate-800 px-4 py-2">
							{@render languageSwitch()}
							<Palette {doc} disabled={runtime.online} />
						</div>
						<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
						<div class="min-h-0 flex-1 overflow-auto p-4" onclick={() => doc.select(null)}>
							{#if runtime.online}
								<p
									class="mb-3 rounded border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-200"
								>
									Online — live values from the PLC. Stop it to edit the program.
								</p>
							{/if}
							<LadderEditor {doc} {monitor} locked={runtime.online} warnings={project.warnings} />
						</div>
					</div>
				{:else if view === 'process'}
					<div class="h-full overflow-auto">
						<ProcessView {runtime} />
					</div>
				{:else if view === 'circuit'}
					<CircuitEditor {project} {sim} snapshot={runtime.snapshot} locked={runtime.online} />
				{:else if view === 'symbols'}
					<div class="h-full overflow-auto">
						<SymbolTable {project} locked={runtime.online} />
					</div>
				{:else if view === 'iocheck'}
					<IoCheck
						symbols={project.userSymbols}
						circuit={project.circuit}
						snapshot={runtime.snapshot}
					/>
				{:else if view === 'hmi'}
					<HmiView
						hmi={project.hmi}
						symbols={project.symbols.map}
						names={[...project.deviceSymbols, ...project.userSymbols]
							.map((s) => s.name)
							.filter(Boolean)}
						snapshot={runtime.snapshot}
						online={runtime.online}
						log={alarmLog}
						onWrite={hmiWrite}
						onAck={ackAlarm}
					/>
				{:else if view === 'debug'}
					<DebugView
						compiled={loaded && runtime.online ? loaded : project.compiled}
						snapshot={runtime.snapshot}
						names={project.symbols.reverse}
						language={project.language}
						{place}
						onSelect={(id) => doc.select(id)}
					/>
				{:else}
					<div class="h-full overflow-auto">
						<WatchTable {project} {runtime} />
					</div>
				{/if}
			</div>
			{#if showTrend}
				<div class="h-64 shrink-0 border-t border-slate-800 bg-slate-950">
					<TrendChart
						{runtime}
						lanes={trend.lanes}
						onRestart={() => runtime.setTrace(trend.signals)}
						onAddSignals={plotMainSignals}
					/>
				</div>
			{/if}
		</div>

		<aside class="space-y-6 overflow-auto border-l border-slate-800 p-4">
			{#if lesson}
				<LessonPanel
					{lesson}
					compiled={project.compiled}
					blocked={problems.some((p) => p.source !== 'circuit')}
					onShowSolution={showSolution}
					onRestart={restartLesson}
					ladder={doc.program}
					symbols={project.symbols.map}
					online={runtime.online}
					language={project.language}
					circuit={project.circuit}
					hmi={project.hmi}
				/>
			{/if}
			<IoPanel {runtime} labels={terminalLabels} />

			<section aria-labelledby="problems-title">
				<h2
					id="problems-title"
					class="mb-2 text-xs font-semibold tracking-wider uppercase {problems.length
						? 'text-red-400'
						: 'text-slate-400'}"
				>
					Problems ({problems.length})
				</h2>
				{#if problems.length === 0}
					<p class="text-xs text-slate-500">Program compiles — ready to run.</p>
				{:else}
					<ul class="space-y-1 text-xs {flashProblems ? 'animate-pulse' : ''}">
						{#each problems as p, i (i)}
							<li>
								<button
									class="w-full rounded bg-red-500/10 px-2 py-1 text-left text-red-200 hover:bg-red-500/20"
									onclick={() => showProblem(p)}
								>
									<span class="text-[10px] text-red-400 uppercase">{p.source}</span>
									{p.message}
								</button>
							</li>
						{/each}
					</ul>
				{/if}
				{#if project.warnings.length}
					<h3 class="mt-3 mb-1 text-xs font-semibold tracking-wider text-amber-400 uppercase">
						Warnings ({project.warnings.length})
					</h3>
					<ul class="space-y-1 text-xs" aria-label="Warnings">
						{#each project.warnings as w, i (i)}
							<li>
								<button
									class="w-full rounded bg-amber-400/10 px-2 py-1 text-left text-amber-100 hover:bg-amber-400/20"
									onclick={() => jumpTo(w.id)}
								>
									{#if w.id && project.language === 'ladder'}
										<span class="text-[10px] text-amber-400">{place(w.id)}</span>
									{/if}
									{w.message}
								</button>
							</li>
						{/each}
					</ul>
				{/if}
				{#if runtime.loadError}
					<p class="mt-2 rounded bg-red-500/10 px-2 py-1 text-xs text-red-200">
						{runtime.loadError.message}
					</p>
				{/if}
			</section>

			<ExplainPanel {doc} {monitor} language={project.language} />

			<CodeView
				compiled={loaded && runtime.online ? loaded : project.compiled}
				selectedId={doc.selectedId}
			/>

			<XrefPanel
				entries={project.xref}
				names={project.symbols.reverse}
				{place}
				selectedId={project.language === 'ladder' ? doc.selectedId : null}
				onJump={jumpTo}
			/>

			<button
				class="text-xs text-slate-500 underline hover:text-slate-300"
				disabled={runtime.online}
				onclick={resetToDemo}
			>
				Load demo project
			</button>
		</aside>
	</div>
</div>

{#if shareUrl}
	<div class="fixed inset-0 z-50 grid place-items-center bg-slate-950/70 p-4" role="presentation">
		<div
			class="w-full max-w-lg space-y-3 rounded-lg border border-slate-700 bg-slate-900 p-5 shadow-2xl"
			role="dialog"
			aria-label="Share project"
		>
			<h2 class="font-semibold text-white">Share this project</h2>
			<p class="text-sm text-slate-400">
				{copied ? 'Link copied to the clipboard.' : 'Copy the link below.'} The whole project is inside
				the link — nothing is uploaded. Whoever opens it gets their own copy.
			</p>
			<input
				class="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5 font-mono text-xs text-slate-200"
				readonly
				value={shareUrl}
				aria-label="Share link"
				onfocus={(e) => e.currentTarget.select()}
			/>
			<div class="text-right">
				<button
					class="rounded-md bg-slate-700 px-3 py-1.5 text-sm hover:bg-slate-600"
					onclick={() => (shareUrl = null)}
				>
					Close
				</button>
			</div>
		</div>
	</div>
{/if}

<TipToast
	input={{
		ladder: project.ladder.program,
		circuit: project.circuit,
		symbols: project.symbols.map,
		hmi: project.hmi,
		language: project.language ?? 'ladder',
		online: runtime.online,
		forces: runtime.forces.size
	}}
	quiet={lesson?.kind === 'debug' || lesson?.kind === 'commissioning'}
/>
