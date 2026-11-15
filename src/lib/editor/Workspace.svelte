<script lang="ts">
	import HardwareView from '#lib/hw/HardwareView.svelte';
	import StlView from '#lib/stl/StlView.svelte';
	import { DEMO_STL } from '#lib/stl/examples.js';
	import { onDestroy, onMount, untrack } from 'svelte';
	import CircuitEditor from '#lib/circuit/CircuitEditor.svelte';
	import { portOf } from '#lib/circuit/model.js';
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
	import SfcView from '#lib/sfc/SfcView.svelte';
	import { demoSfc } from '#lib/sfc/sfc.js';
	import FbdView from '#lib/fbd/FbdView.svelte';
	import { demoFbd } from '#lib/fbd/fbd.js';
	import OnCallPanel from '#lib/oncall/OnCallPanel.svelte';
	import { isFieldFault, machineFromProjectId, machineProject } from '#lib/oncall/machines.js';
	import { incidentOf, loadLog } from '#lib/oncall/shift.js';
	import { getLesson, LESSON_PREFIX } from '#lib/lessons/lessons.js';
	import ProcessView from '#lib/processes/ProcessView.svelte';
	import { createProcess } from '#lib/processes/models.js';
	import type { ProgramLanguage } from '#lib/project/project.js';
	import type { StVariable } from '#lib/st/compiler.js';
	import { DEMO_ST, EMPTY_ST } from '#lib/st/examples.js';
	import StEditor from '#lib/st/StEditor.svelte';
	import LibraryView from './LibraryView.svelte';
	import { download as downloadFiles, exportFiles } from '#lib/project/export-file.svelte.js';
	import { liveValue as readLive } from '#lib/runtime/live.js';
	import WorkspaceHeader from './WorkspaceHeader.svelte';
	import { AlarmLog, connectCircuit } from './bridge.svelte.js';
	import ProgramLanguageSwitch from './ProgramLanguageSwitch.svelte';
	import ProblemsPanel from './ProblemsPanel.svelte';
	import ShareDialog from './ShareDialog.svelte';
	import type { View } from './views.js';
	import { t } from '#lib/i18n/i18n.svelte.js';
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
	import DiagView from './DiagView.svelte';
	import { watchEntry } from '#lib/monitor/watch.js';
	import IoCheck from './IoCheck.svelte';
	import HmiView from '#lib/hmi/HmiView.svelte';
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

	/** small screens (tablets) start with a shorter trend and the side panel closed */
	const wide = typeof window === 'undefined' || window.innerWidth >= 1280;
	let showTrend = $state(typeof window === 'undefined' || window.innerHeight >= 700);
	// lessons and on-call shifts need their instructions: the panel starts open there
	let sidePanel = $state(
		wide ||
			untrack(() => projectId).startsWith(LESSON_PREFIX) ||
			untrack(() => !!machineFromProjectId(projectId))
	);

	// The workspace is re-created ({#key}) when the project changes, so reading the id once is fine.
	const id = untrack(() => projectId);
	/** Lesson projects start from the lesson's starter when nothing is saved yet. */
	const startLesson = untrack(() =>
		projectId.startsWith(LESSON_PREFIX) ? getLesson(projectId.slice(LESSON_PREFIX.length)) : null
	);
	/** On-call projects: a healthy machine that breaks down (faults injected into the circuit). */
	const machine = untrack(() => machineFromProjectId(projectId));
	let project = $state(
		new ProjectState(
			loadProject(
				localStorage,
				untrack(() => projectId),
				startLesson ? startLesson.starter : machine ? () => machineProject(machine) : demoProject
			)
		)
	);
	const lesson = $derived(project.lesson ? getLesson(project.lesson) : null);

	const VIEWS: View[] = $derived([
		'program',
		'library',
		...(project.scenario ? (['process'] as const) : []),
		...(project.hw ? (['hardware'] as const) : []),
		'circuit',
		...(lesson?.kind === 'commissioning' || machine ? (['iocheck'] as const) : []),
		'hmi',
		'symbols',
		'watch',
		'debug',
		'diag'
	]);

	// The simulated plant runs in the worker next to the PLC.
	$effect(() => runtime.setProcess(project.scenario ?? null));
	// the configured rack sits between the plant / buttons and the PLC
	$effect(() => runtime.setHardware(project.hw ? $state.snapshot(project.hw) : null));
	// lessons about noisy signals switch the realistic sensors on
	$effect(() => {
		if (lesson?.realism) runtime.processCommand('field:realism', true);
	});
	/** Input terminals driven by the plant (shown read-only in the I/O panel). */
	const processSensors = $derived(project.scenario ? createProcess(project.scenario).sensors : []);
	const doc = $derived(project.ladder);
	const sim = new CircuitSim();
	const runtime = new PlcRuntime();
	onMount(() => {
		const shift = loadLog().current;
		const incident =
			shift && !shift.solvedAt && shift.machine === machine?.id ? incidentOf(shift) : null;
		if (!incident) return;
		const f = incident.fault;
		if (!isFieldFault(f)) sim.faults = [f];
		else if (f.kind === 'sensor')
			runtime.processCommand('field:fault', { address: f.device, fault: f.fault });
		else runtime.processCommand('field:plant', { id: f.device, on: true });
	});
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

	connectCircuit(() => project, runtime, sim);
	const alarms = new AlarmLog(() => project, runtime);
	const hmiWrite = (tag: string, value: number) => alarms.write(tag, value);
	const ackAlarm = (seqs?: number[]) => alarms.ack(seqs);
	const pendingAlarms = $derived(alarms.pending);

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
		else if (download()) runtime.start(loaded!.program, loaded!.load);
	}

	function step() {
		if (runtime.status === 'PAUSED') runtime.step(loaded!.program, loaded!.load);
		else if (download()) runtime.step(loaded!.program, loaded!.load);
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

	/** Online value of an operand: a symbol, an address, a variable or an instance output (Timer1.Q). */
	const liveValue = (text: string) =>
		runtime.online ? readLive(runtime.snapshot, loadedVariables, project.symbols.map, text) : null;

	function setLanguage(language: ProgramLanguage) {
		if (language === 'st' && !project.st.trim()) project.st = lesson ? EMPTY_ST : DEMO_ST;
		if (language === 'sfc' && !project.sfc.transitions.length && !lesson) project.sfc = demoSfc();
		const blank = project.fbd.networks.every(
			(n) => n.value.kind === 'operand' && !n.value.text.trim()
		);
		if (language === 'fbd' && blank && !lesson) project.fbd = demoFbd();
		if (language === 'stl' && !project.stl.trim() && !lesson) project.stl = DEMO_STL;
		project.language = language;
	}

	function showSolution() {
		if (lesson && confirm(t('lesson.confirmSolution'))) {
			project.ladder.program = lesson.solution();
			if (lesson.solutionCircuit) project.circuit = lesson.solutionCircuit();
			if (lesson.solutionHmi) project.hmi = lesson.solutionHmi();
			if (lesson.solutionSt) project.st = lesson.solutionSt;
			if (lesson.solutionSfc) project.sfc = lesson.solutionSfc();
			if (lesson.solutionFbd) project.fbd = lesson.solutionFbd();
			if (lesson.solutionStl) project.stl = lesson.solutionStl;
			if (lesson.solutionHw) project.hw = lesson.solutionHw();
			project.ladder.select(null);
			view = 'program';
		}
	}

	function restartLesson() {
		if (lesson && confirm(t('lesson.confirmRestart'))) {
			runtime.stop();
			project = new ProjectState(lesson.starter());
			sim.reset();
		}
	}

	function resetToDemo() {
		if (confirm(t('ws.confirmDemo'))) {
			project = new ProjectState(demoProject());
			sim.reset();
		}
	}
</script>

<svelte:window onkeydown={onKeydown} />

{#snippet languageSwitch()}
	<ProgramLanguageSwitch
		value={project.language}
		disabled={runtime.online}
		onChange={setLanguage}
	/>
{/snippet}

<div class="p-8 text-center text-sm text-slate-400 md:hidden">
	{t('ws.narrow')}
</div>

<div class="hidden h-[calc(100dvh-3.5rem)] flex-col md:flex">
	<div
		class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-4 py-2"
	>
		<WorkspaceHeader
			{id}
			name={project.name}
			fixedName={lesson ? lesson.title : null}
			online={runtime.online}
			{canUndo}
			{canRedo}
			views={VIEWS}
			bind:view
			bind:showTrend
			problemViews={problems.map((p) => p.source)}
			{pendingAlarms}
			forces={runtime.forces.size}
			onName={(n) => (project.name = n)}
			onUndo={() => travel('undo')}
			onRedo={() => travel('redo')}
			onShare={share}
			onExport={(f) => downloadFiles(exportFiles(project, f))}
		/>
		<div class="flex items-center gap-2">
			<RuntimeToolbar {runtime} onRun={run} onStep={step} />
			<button
				class="rounded-md border border-slate-700 px-2.5 py-1.5 text-xs text-slate-300 hover:border-slate-500 xl:hidden {sidePanel
					? 'bg-slate-800'
					: ''}"
				aria-pressed={sidePanel}
				aria-controls="side-panel"
				onclick={() => (sidePanel = !sidePanel)}>{t('ws.panel')}</button
			>
		</div>
	</div>

	<div class="relative grid min-h-0 flex-1 {sidePanel ? 'xl:grid-cols-[minmax(0,1fr)_20rem]' : ''}">
		<div class="flex min-h-0 flex-col">
			<div class="min-h-0 flex-1">
				{#if view === 'program' && project.language === 'fbd'}
					<FbdView
						fbd={project.fbd}
						types={project.boxTypes}
						readOnly={runtime.online}
						online={runtime.online}
						problemIds={project.compiled.diagnostics.map((d) => d.id)}
						generated={project.fbdSt?.source ?? ''}
						names={[...project.deviceSymbols, ...project.userSymbols].map((x) => x.name)}
						valueOf={liveValue}
						signal={(id) => {
							const s = project.fbdSt?.signals[id];
							return s ? liveValue(s) : null;
						}}
					>
						{#snippet header()}{@render languageSwitch()}{/snippet}
					</FbdView>
				{:else if view === 'program' && project.language === 'sfc'}
					<SfcView
						sfc={project.sfc}
						readOnly={runtime.online}
						online={runtime.online}
						snapshot={runtime.snapshot}
						variables={(loaded && runtime.online ? loadedVariables : project.stResult?.variables) ??
							[]}
						problemIds={project.compiled.diagnostics.map((d) => d.id)}
						generated={project.sfcSt?.source ?? ''}
					>
						{#snippet header()}{@render languageSwitch()}{/snippet}
					</SfcView>
				{:else if view === 'program' && project.language === 'stl'}
					<StlView
						value={project.stl}
						onChange={(text) => (project.stl = text)}
						gen={project.stlSt}
						problems={project.compiled.diagnostics}
						online={runtime.online}
						valueOf={liveValue}
					>
						{#snippet header()}{@render languageSwitch()}{/snippet}
					</StlView>
				{:else if view === 'program' && project.language === 'st'}
					<div class="flex h-full flex-col">
						<div class="flex items-center gap-3 border-b border-slate-800 px-4 py-2">
							{@render languageSwitch()}
							<span class="text-[11px] text-slate-500">
								{t('ws.stHint')}
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
									{t('ws.online')}
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
				{:else if view === 'library'}
					<LibraryView
						library={project.library}
						onChange={(text) => (project.library = text)}
						readOnly={runtime.online}
						symbols={project.symbols.map}
						symbolList={[...project.deviceSymbols, ...project.userSymbols]}
					/>
				{:else if view === 'symbols'}
					<div class="h-full overflow-auto">
						<SymbolTable {project} locked={runtime.online} />
					</div>
				{:else if view === 'hardware' && project.hw}
					<HardwareView hw={project.hw} locked={runtime.online} problems={project.problems} />
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
						log={alarms.log}
						onWrite={hmiWrite}
						onAck={ackAlarm}
					/>
				{:else if view === 'diag'}
					<DiagView snapshot={runtime.snapshot} />
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
				<div class="h-48 shrink-0 border-t border-slate-800 bg-slate-950 xl:h-64">
					<TrendChart
						{runtime}
						lanes={trend.lanes}
						onRestart={() => runtime.setTrace(trend.signals)}
						onAddSignals={plotMainSignals}
					/>
				</div>
			{/if}
		</div>

		<!-- the side panel: a column on wide screens, a drawer over the program on tablets -->
		<aside
			id="side-panel"
			class="absolute inset-y-0 right-0 z-30 w-80 max-w-[90vw] space-y-6 overflow-auto border-l border-slate-800 bg-slate-950 p-4 shadow-2xl xl:static xl:w-auto xl:max-w-none xl:shadow-none {sidePanel
				? ''
				: 'hidden'}"
		>
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
					st={project.st}
					sfc={project.sfc}
					fbd={project.fbd}
					stl={project.stl}
					hw={project.hw}
				/>
			{:else if machine}
				<OnCallPanel
					{machine}
					circuit={project.circuit}
					scenario={project.scenario}
					onRepaired={() => {
						sim.faults = [];
						// a repaired sensor or plant: clear every fault between the plant and the PLC
						const field = runtime.snapshot?.field;
						for (const address of Object.keys(field?.faults ?? {}))
							runtime.processCommand('field:fault', { address, fault: null });
						for (const id of field?.plantFaults ?? [])
							runtime.processCommand('field:plant', { id, on: false });
					}}
				/>
			{/if}
			<IoPanel {runtime} labels={terminalLabels} />

			<ProblemsPanel
				{problems}
				warnings={project.warnings}
				flash={flashProblems}
				loadError={runtime.loadError?.message ?? null}
				place={project.language === 'ladder' ? place : null}
				onProblem={showProblem}
				onWarning={jumpTo}
			/>

			<ExplainPanel
				{doc}
				{monitor}
				language={project.language}
				fbd={{
					fbd: project.fbd,
					types: project.boxTypes,
					live: runtime.online
						? (v) =>
								v.kind === 'operand'
									? liveValue(v.text)
									: liveValue(project.fbdSt?.signals[v.box.id] ?? '')
						: null
				}}
			/>

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
				{t('ws.loadDemo')}
			</button>
		</aside>
	</div>
</div>

{#if shareUrl}
	<ShareDialog url={shareUrl} {copied} onClose={() => (shareUrl = null)} />
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
	quiet={lesson?.kind === 'debug' || lesson?.kind === 'commissioning' || !!machine}
/>
