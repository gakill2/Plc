<script lang="ts">
	import { onDestroy, untrack } from 'svelte';
	import type { CompiledLadder } from '#lib/ladder/compiler.js';
	import { demoProgram } from '#lib/ladder/defaults.js';
	import { LadderDocument } from '#lib/ladder/document.svelte.js';
	import type { LadderProgram } from '#lib/ladder/model.js';
	import { createMonitor } from '#lib/ladder/monitor.js';
	import { PlcRuntime } from '#lib/runtime/runtime.svelte.js';
	import CodeView from './CodeView.svelte';
	import IoPanel from './IoPanel.svelte';
	import LadderEditor from './LadderEditor.svelte';
	import Palette from './Palette.svelte';
	import RuntimeToolbar from './RuntimeToolbar.svelte';

	type Props = { storageKey: string };
	let { storageKey }: Props = $props();

	function restore(key: string): LadderProgram {
		try {
			const saved = JSON.parse(localStorage.getItem(key) ?? 'null');
			if (saved?.version === 1 && Array.isArray(saved.rungs)) return saved;
		} catch {
			// corrupted save — fall back to the demo
		}
		return demoProgram();
	}

	// The workspace is re-created ({#key}) when the project changes, so reading the key once is fine.
	const key = untrack(() => storageKey);
	const doc = new LadderDocument(restore(key));
	const runtime = new PlcRuntime();
	onDestroy(() => runtime.dispose());

	$effect(() => {
		localStorage.setItem(key, JSON.stringify(doc.program));
	});

	/** The compiled program currently downloaded to the PLC — its probes drive the live view. */
	let loaded = $state.raw<CompiledLadder | null>(null);
	let showProblems = $state(false);
	let problemsTimer: ReturnType<typeof setTimeout> | undefined;

	const problems = $derived(doc.compiled.diagnostics);
	const monitor = $derived(
		runtime.online && runtime.snapshot && loaded
			? createMonitor(runtime.snapshot, loaded.taps)
			: null
	);

	function download(): boolean {
		if (problems.length > 0) {
			showProblems = true;
			clearTimeout(problemsTimer);
			problemsTimer = setTimeout(() => (showProblems = false), 1500);
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

	function onKeydown(e: KeyboardEvent) {
		const target = e.target as HTMLElement;
		if (target.closest('input, select, textarea')) return;
		if (e.key === 'Escape') doc.select(null);
		if ((e.key === 'Delete' || e.key === 'Backspace') && !runtime.online) {
			e.preventDefault();
			doc.removeSelected();
		}
	}

	function resetToDemo() {
		if (confirm('Replace the current program with the demo?')) {
			doc.program = demoProgram();
			doc.select(null);
		}
	}
</script>

<svelte:window onkeydown={onKeydown} />

<div class="flex h-[calc(100dvh-3.5rem)] flex-col">
	<div
		class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-4 py-2"
	>
		<Palette {doc} disabled={runtime.online} />
		<RuntimeToolbar {runtime} onRun={run} onStep={step} />
	</div>

	<div class="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_20rem]">
		<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
		<div class="overflow-auto p-4" onclick={() => doc.select(null)}>
			{#if runtime.online}
				<p
					class="mb-3 rounded border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-200"
				>
					Online — live values from the PLC. Stop it to edit the program.
				</p>
			{/if}
			<LadderEditor {doc} {monitor} locked={runtime.online} />
		</div>

		<aside class="space-y-6 overflow-auto border-l border-slate-800 p-4">
			<IoPanel {runtime} />

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
					<ul class="space-y-1 text-xs {showProblems ? 'animate-pulse' : ''}">
						{#each problems as p, i (i)}
							<li>
								<button
									class="w-full rounded bg-red-500/10 px-2 py-1 text-left text-red-200 hover:bg-red-500/20"
									onclick={() => doc.select(p.id)}
								>
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
				Load demo program
			</button>
		</aside>
	</div>
</div>
