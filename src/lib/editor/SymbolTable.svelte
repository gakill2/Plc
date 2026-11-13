<script lang="ts">
	import { newId } from '#lib/ladder/model.js';
	import type { ProjectState } from '#lib/project/state.svelte.js';
	import type { SymbolEntry } from '#lib/symbols/symbols.js';

	type Props = { project: ProjectState; locked: boolean };
	let { project, locked }: Props = $props();

	const issues = $derived.by(() => {
		const map: Record<string, string[]> = {};
		for (const i of project.symbols.issues) (map[i.id] ??= []).push(i.message);
		return map;
	});

	function add() {
		project.userSymbols.push({ id: newId('y'), name: '', address: 'M0.0', comment: '' });
	}

	function remove(entry: SymbolEntry) {
		project.userSymbols.splice(project.userSymbols.indexOf(entry), 1);
	}

	const cell =
		'w-full rounded border border-transparent bg-transparent px-2 py-1 font-mono text-xs outline-none hover:border-slate-700 focus:border-emerald-500 focus:bg-slate-900';
</script>

<div class="mx-auto max-w-4xl space-y-4 p-6">
	<div>
		<h1 class="text-lg font-semibold text-white">Symbol table</h1>
		<p class="mt-1 text-sm text-slate-400">
			Give addresses meaningful names and use them in the program — <code class="text-emerald-300"
				>Start</code
			>
			instead of <code class="text-emerald-300">I0.0</code>. Wired devices from the circuit are
			added automatically.
		</p>
	</div>

	<table class="w-full border-separate border-spacing-y-1 text-left">
		<thead class="text-[11px] tracking-wider text-slate-500 uppercase">
			<tr>
				<th class="px-2 font-medium">Name</th>
				<th class="w-28 px-2 font-medium">Address</th>
				<th class="px-2 font-medium">Comment</th>
				<th class="w-24 px-2 font-medium">Source</th>
				<th class="w-8"></th>
			</tr>
		</thead>
		<tbody>
			{#each project.deviceSymbols as s (s.id)}
				<tr class="bg-slate-900/60 text-xs" title={issues[s.id]?.join('\n')}>
					<td
						class="rounded-l px-3 py-1.5 font-mono {issues[s.id]
							? 'text-red-300'
							: 'text-slate-200'}">{s.name}</td
					>
					<td class="px-3 font-mono text-slate-300">{s.address}</td>
					<td class="px-3 text-slate-400">{s.comment}</td>
					<td class="px-3 text-sky-300">circuit</td>
					<td class="rounded-r"></td>
				</tr>
			{/each}
			{#each project.userSymbols as s (s.id)}
				<tr
					class="bg-slate-900/60 {issues[s.id] ? 'outline outline-red-500/60' : ''}"
					title={issues[s.id]?.join('\n')}
				>
					<td class="rounded-l">
						<input
							class={cell}
							bind:value={s.name}
							placeholder="Name"
							disabled={locked}
							aria-label="Symbol name"
						/>
					</td>
					<td
						><input
							class={cell}
							bind:value={s.address}
							disabled={locked}
							aria-label="Address"
						/></td
					>
					<td>
						<input
							class="{cell} font-sans"
							bind:value={s.comment}
							placeholder="Comment"
							disabled={locked}
							aria-label="Comment"
						/>
					</td>
					<td class="px-3 text-xs text-slate-500">user</td>
					<td class="rounded-r">
						<button
							class="rounded px-2 text-slate-500 hover:bg-red-500/20 hover:text-red-300 disabled:opacity-40"
							disabled={locked}
							aria-label="Delete symbol {s.name}"
							onclick={() => remove(s)}>×</button
						>
					</td>
				</tr>
			{/each}
		</tbody>
	</table>

	<button
		class="rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-200 hover:border-slate-500 disabled:opacity-40"
		disabled={locked}
		onclick={add}
	>
		+ Add symbol
	</button>

	{#if project.symbols.issues.length}
		<ul class="space-y-1 text-xs text-red-300">
			{#each project.symbols.issues as issue, i (i)}<li>{issue.message}</li>{/each}
		</ul>
	{/if}
</div>
