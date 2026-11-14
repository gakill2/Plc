<script lang="ts">
	import { setLadderView } from '#lib/ladder/context.js';
	import type { LadderDocument } from '#lib/ladder/document.svelte.js';
	import type { Monitor } from '#lib/ladder/monitor.js';
	import type { Warning } from '#lib/analysis/analysis.js';
	import RungView from './RungView.svelte';

	type Props = {
		doc: LadderDocument;
		monitor: Monitor | null;
		locked: boolean;
		warnings?: readonly Warning[];
	};
	let { doc, monitor, locked, warnings = [] }: Props = $props();

	const uid = $props.id();
	const listId = `operands-${uid}`;
	const byId = $derived.by(() => {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- local, rebuilt on every change
		const map = new Map<string, string[]>();
		for (const w of warnings) if (w.id) map.set(w.id, [...(map.get(w.id) ?? []), w.message]);
		return map;
	});

	setLadderView({
		get doc() {
			return doc;
		},
		get monitor() {
			return monitor;
		},
		get locked() {
			return locked;
		},
		listId,
		warningsFor: (id) => byId.get(id) ?? []
	});
</script>

<datalist id={listId}>
	{#each doc.symbolList as [address, name] (address)}
		<option value={name}>{address}</option>
	{/each}
</datalist>

<div class="space-y-3">
	{#each doc.program.rungs as rung, i (rung.id)}
		<RungView {rung} index={i} />
	{:else}
		<p
			class="rounded-lg border border-dashed border-slate-700 p-6 text-center text-sm text-slate-500"
		>
			No networks yet — add one with “+ Network”.
		</p>
	{/each}
</div>
