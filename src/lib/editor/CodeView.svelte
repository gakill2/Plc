<script lang="ts">
	import { disassemble } from '#lib/engine/index.js';
	import type { CompiledLadder } from '#lib/ladder/compiler.js';

	type Props = { compiled: CompiledLadder; selectedId: string | null };
	let { compiled, selectedId }: Props = $props();

	let showProbes = $state(false);

	const lines = $derived(
		disassemble(compiled.program)
			.map((text, pc) => ({ pc, text, owner: compiled.sourceMap[pc] }))
			.filter((l) => showProbes || !l.text.startsWith('TAP'))
	);
</script>

<details class="group">
	<summary class="cursor-pointer text-xs font-semibold tracking-wider text-slate-400 uppercase">
		Compiled code (IL) · {compiled.program.length} instr.
	</summary>
	<label class="mt-2 flex items-center gap-1.5 text-[11px] text-slate-500">
		<input type="checkbox" bind:checked={showProbes} class="accent-emerald-500" />
		show power-flow probes (TAP)
	</label>
	<ol
		class="mt-2 max-h-80 overflow-auto rounded border border-slate-800 bg-slate-950 py-1 font-mono text-[11px]"
	>
		{#each lines as line (line.pc)}
			<li
				class="flex gap-3 px-2 {line.owner !== null && line.owner === selectedId
					? 'bg-emerald-500/15 text-emerald-200'
					: 'text-slate-300'}"
			>
				<span class="w-6 shrink-0 text-right text-slate-600">{line.pc}</span>
				<span
					class={line.text.startsWith('TAP') || line.text.startsWith('LDT') ? 'text-slate-500' : ''}
					>{line.text}</span
				>
			</li>
		{/each}
	</ol>
</details>
