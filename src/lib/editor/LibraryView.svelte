<script lang="ts">
	import StEditor from '#lib/st/StEditor.svelte';
	import { compileSt } from '#lib/st/compiler.js';
	import { blockCatalog, STDLIB } from '#lib/st/stdlib.js';
	import type { SymbolEntry } from '#lib/symbols/symbols.js';
	import type { SymbolMap } from '#lib/symbols/symbols.js';

	type Props = {
		library: string;
		onChange: (text: string) => void;
		readOnly: boolean;
		symbols: SymbolMap;
		symbolList: SymbolEntry[];
	};
	let { library, onChange, readOnly, symbols, symbolList }: Props = $props();

	const result = $derived(compileSt(library, { symbols, prelude: STDLIB }));
	const catalog = $derived(blockCatalog(library));

	const TEMPLATE = `FUNCTION_BLOCK Valve
(* Zawór z kontrolą krańcówek *)
VAR_INPUT
  Open      : BOOL;    // rozkaz otwarcia
  IsOpen    : BOOL;    // krańcówka „otwarty”
  IsClosed  : BOOL;    // krańcówka „zamknięty”
END_VAR
VAR_OUTPUT
  Coil  : BOOL;        // cewka zaworu
  Fault : BOOL;        // nie doszedł w 3 s
END_VAR
VAR
  watch : TON;
END_VAR
Coil := Open;
watch(IN := (Open AND NOT IsOpen) OR (NOT Open AND NOT IsClosed), PT := T#3s);
Fault := watch.Q;
END_FUNCTION_BLOCK
`;
</script>

<div class="flex h-full flex-col" lang="pl">
	<div
		class="flex items-center gap-3 border-b border-slate-800 px-4 py-2 text-[11px] text-slate-400"
	>
		<span class="font-semibold text-slate-200">Biblioteka bloków</span>
		<span
			>Własne FUNCTION_BLOCK / FUNCTION / TYPE w ST — do użycia w LAD (paleta „FB…”), ST i SFC.</span
		>
		{#if !library.trim() && !readOnly}
			<button
				class="ml-auto rounded border border-slate-700 px-2 py-0.5 text-slate-300 hover:bg-slate-800"
				onclick={() => onChange(TEMPLATE)}>Wstaw przykładowy blok</button
			>
		{/if}
	</div>
	<div class="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_18rem]">
		<StEditor
			value={library}
			{onChange}
			diagnostics={result.diagnostics}
			{readOnly}
			names={() => ({ symbols: symbolList, variables: [] })}
		/>
		<div class="space-y-3 overflow-auto border-l border-slate-800 p-3 text-xs">
			<p class="font-semibold tracking-wider text-slate-400 uppercase">Dostępne bloki</p>
			{#each catalog as b (b.name)}
				<div class="rounded border border-slate-800 bg-slate-900/60 p-2">
					<p class="font-mono font-semibold text-violet-300">
						{b.name}{#if b.standard}<span class="ml-1 text-[10px] font-normal text-slate-500"
								>standardowy</span
							>{/if}
					</p>
					{#if b.comment}<p class="text-[11px] text-slate-400">{b.comment}</p>{/if}
					<p class="mt-1 font-mono text-[10px] text-sky-300">
						→ {b.inputs.map((p) => p.name).join(', ') || '—'}
					</p>
					<p class="font-mono text-[10px] text-amber-300">
						⇒ {b.outputs.map((p) => p.name).join(', ') || '—'}
					</p>
				</div>
			{/each}
			{#if result.diagnostics.length}
				<p class="text-red-300">
					Błędy: {result.diagnostics.length} — popraw je, zanim użyjesz bloków.
				</p>
			{/if}
			<details class="text-slate-400">
				<summary class="cursor-pointer">Kod bloków standardowych</summary>
				<pre
					class="mt-1 overflow-auto font-mono text-[10px] whitespace-pre text-slate-300">{STDLIB}</pre>
			</details>
		</div>
	</div>
</div>
