<script lang="ts">
	import type { Snippet } from 'svelte';
	import { parseAddress } from '#lib/engine/index.js';
	import type { RuntimeSnapshot } from '#lib/runtime/protocol.js';
	import { readBit } from '#lib/runtime/read.js';
	import type { StVariable } from '#lib/st/compiler.js';
	import SfcEditor from './SfcEditor.svelte';
	import { stepVar, type Sfc } from './sfc.js';

	type Props = {
		sfc: Sfc;
		readOnly: boolean;
		online: boolean;
		snapshot: RuntimeSnapshot | null;
		variables: StVariable[];
		/** Diagnostic ids of the compiled program (`sfc:<id>` marks a chart element). */
		problemIds: string[];
		generated: string;
		header: Snippet;
	};
	let { sfc, readOnly, online, snapshot, variables, problemIds, generated, header }: Props =
		$props();

	let showSt = $state(false);
	const flagged = $derived(problemIds.filter((p) => p.startsWith('sfc:')).map((p) => p.slice(4)));

	function active(name: string): boolean | null {
		if (!online || !snapshot) return null;
		const v = variables.find((x) => x.name.toUpperCase() === stepVar(name).toUpperCase());
		const read = v?.reads[0];
		return read ? !!readBit(snapshot, parseAddress(read.address)) : null;
	}
</script>

<div class="flex h-full flex-col">
	<div class="flex flex-wrap items-center gap-3 border-b border-slate-800 px-4 py-2">
		{@render header()}
		<span class="text-[11px] text-slate-500" lang="pl">
			Warunki to wyrażenia ST · <code>Krok.T</code> = czas aktywności kroku, <code>Krok.X</code> = krok
			aktywny
		</span>
		<button class="ml-auto text-[11px] text-slate-400 underline" onclick={() => (showSt = !showSt)}
			>{showSt ? 'Ukryj' : 'Pokaż'} wygenerowany ST</button
		>
	</div>
	<div class="grid min-h-0 flex-1 {showSt ? 'grid-cols-[minmax(0,1fr)_minmax(0,1fr)]' : ''}">
		<div class="min-h-0 overflow-auto">
			{#if online}
				<p
					class="mx-4 mt-3 rounded border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-200"
					lang="pl"
				>
					Online — aktywne kroki są zielone. Zatrzymaj PLC, żeby edytować diagram.
				</p>
			{/if}
			<SfcEditor {sfc} {readOnly} {active} {flagged} />
			<section class="mx-4 mb-4 space-y-1" lang="pl">
				<h3 class="text-xs font-semibold tracking-wider text-slate-400 uppercase">
					Logika stała (ST, co cykl obok diagramu)
				</h3>
				<textarea
					class="h-40 w-full rounded border border-slate-700 bg-slate-900 p-2 font-mono text-xs text-slate-100 disabled:opacity-70"
					bind:value={sfc.logic}
					disabled={readOnly}
					spellcheck="false"
					aria-label="Logika stała"
					placeholder="Run := (Start OR Run) AND Stop;"></textarea>
			</section>
		</div>
		{#if showSt}
			<pre
				class="min-h-0 overflow-auto border-l border-slate-800 bg-slate-950 p-3 font-mono text-[11px] text-slate-300"
				aria-label="Wygenerowany ST">{generated}</pre>
		{/if}
	</div>
</div>
