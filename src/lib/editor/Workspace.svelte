<script lang="ts">
	import { onDestroy, untrack } from 'svelte';
	import CircuitEditor from '#lib/circuit/CircuitEditor.svelte';
	import { inputDrive } from '#lib/circuit/model.js';
	import { CircuitSim } from '#lib/circuit/sim.svelte.js';
	import type { CompiledLadder } from '#lib/ladder/compiler.js';
	import { createMonitor } from '#lib/ladder/monitor.js';
	import { demoProject, loadProject, projectKey } from '#lib/project/project.js';
	import { ProjectState, type Problem } from '#lib/project/state.svelte.js';
	import { PlcRuntime } from '#lib/runtime/runtime.svelte.js';
	import { resolveSymbol } from '#lib/symbols/symbols.js';
	import CodeView from './CodeView.svelte';
	import IoPanel from './IoPanel.svelte';
	import LadderEditor from './LadderEditor.svelte';
	import Palette from './Palette.svelte';
	import RuntimeToolbar from './RuntimeToolbar.svelte';
	import SymbolTable from './SymbolTable.svelte';

	type Props = { projectId: string };
	let { projectId }: Props = $props();

	type View = 'program' | 'circuit' | 'symbols';
	const VIEWS: { id: View; label: string }[] = [
		{ id: 'program', label: 'Program' },
		{ id: 'circuit', label: 'Circuit' },
		{ id: 'symbols', label: 'Symbols' }
	];

	// The workspace is re-created ({#key}) when the project changes, so reading the id once is fine.
	const key = projectKey(untrack(() => projectId));
	let project = $state(
		new ProjectState(
			loadProject(
				localStorage,
				untrack(() => projectId)
			)
		)
	);
	const doc = $derived(project.ladder);
	const sim = new CircuitSim();
	const runtime = new PlcRuntime();
	onDestroy(() => runtime.dispose());

	let view = $state<View>('program');

	$effect(() => {
		localStorage.setItem(key, JSON.stringify(project.toJSON()));
	});

	// Devices drive the input terminals they are wired to.
	let sent = new Map<string, boolean>();
	$effect(() => {
		const drive = inputDrive(project.circuit, sim.actuated);
		untrack(() => {
			for (const [terminal, value] of drive)
				if (sent.get(terminal) !== value) runtime.setInput(terminal, value);
			for (const terminal of sent.keys())
				if (!drive.has(terminal)) runtime.setInput(terminal, false);
			sent = drive;
		});
	});

	/** Device labels per terminal, for the I/O panel. */
	const terminalLabels = $derived.by(() => {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- local, rebuilt on every change
		const map = new Map<string, string>();
		for (const w of project.circuit.wires) {
			const d = project.circuit.devices.find((x) => x.id === w.device);
			if (d)
				map.set(w.terminal, map.has(w.terminal) ? `${map.get(w.terminal)}, ${d.label}` : d.label);
		}
		return map;
	});

	/** The compiled program currently downloaded to the PLC — its probes drive the live view. */
	let loaded = $state.raw<CompiledLadder | null>(null);
	let flashProblems = $state(false);
	let flashTimer: ReturnType<typeof setTimeout> | undefined;

	const problems = $derived(project.problems);
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
		loaded = doc.compiled;
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

	function onKeydown(e: KeyboardEvent) {
		if (view !== 'program') return;
		const target = e.target as HTMLElement;
		if (target.closest('input, select, textarea')) return;
		if (e.key === 'Escape') doc.select(null);
		if ((e.key === 'Delete' || e.key === 'Backspace') && !runtime.online) {
			e.preventDefault();
			doc.removeSelected();
		}
	}

	function resetToDemo() {
		if (confirm('Replace the whole project (program, circuit, symbols) with the demo?')) {
			project = new ProjectState(demoProject());
			sim.actuated = {};
		}
	}
</script>

<svelte:window onkeydown={onKeydown} />

<div class="flex h-[calc(100dvh-3.5rem)] flex-col">
	<div
		class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-4 py-2"
	>
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
				</button>
			{/each}
		</nav>
		<RuntimeToolbar {runtime} onRun={run} onStep={step} />
	</div>

	<div class="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_20rem]">
		<div class="min-h-0">
			{#if view === 'program'}
				<div class="flex h-full flex-col">
					<div class="border-b border-slate-800 px-4 py-2">
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
						<LadderEditor {doc} {monitor} locked={runtime.online} />
					</div>
				</div>
			{:else if view === 'circuit'}
				<CircuitEditor {project} {sim} snapshot={runtime.snapshot} locked={runtime.online} />
			{:else}
				<div class="h-full overflow-auto">
					<SymbolTable {project} locked={runtime.online} />
				</div>
			{/if}
		</div>

		<aside class="space-y-6 overflow-auto border-l border-slate-800 p-4">
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
				{#if runtime.loadError}
					<p class="mt-2 rounded bg-red-500/10 px-2 py-1 text-xs text-red-200">
						{runtime.loadError.message}
					</p>
				{/if}
			</section>

			<CodeView
				compiled={loaded && runtime.online ? loaded : doc.compiled}
				selectedId={doc.selectedId}
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
