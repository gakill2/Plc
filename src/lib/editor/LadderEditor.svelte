<script lang="ts">
	import { setLadderView } from '#lib/ladder/context.js';
	import type { LadderDocument } from '#lib/ladder/document.svelte.js';
	import type { Monitor } from '#lib/ladder/monitor.js';
	import RungView from './RungView.svelte';

	type Props = { doc: LadderDocument; monitor: Monitor | null; locked: boolean };
	let { doc, monitor, locked }: Props = $props();

	setLadderView({
		get doc() {
			return doc;
		},
		get monitor() {
			return monitor;
		},
		get locked() {
			return locked;
		}
	});
</script>

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
