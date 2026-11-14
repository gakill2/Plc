<script lang="ts">
	import SfcEditor from '#lib/sfc/SfcEditor.svelte';
	import { resolve } from '$app/paths';
	import { untrack } from 'svelte';
	import { toPng } from 'html-to-image';
	import { DEVICES, portOf } from '#lib/circuit/model.js';
	import { compareAddresses } from '#lib/analysis/analysis.js';
	import { disassemble } from '#lib/engine/index.js';
	import LadderEditor from '#lib/editor/LadderEditor.svelte';
	import { loadProject } from '#lib/project/project.js';
	import { ProjectState } from '#lib/project/state.svelte.js';
	import { plantInfo } from '#lib/processes/plants.js';

	/*
	 * A printable summary of a project for lab reports: the program (ladder diagram or ST code),
	 * the symbol table and the I/O list. "Print" → the browser's "Save as PDF"; each section can
	 * also be downloaded as a PNG to paste into a document.
	 */

	let { projectId }: { projectId: string } = $props();

	const project = new ProjectState(
		loadProject(
			localStorage,
			untrack(() => projectId)
		)
	);
	const AUTHOR_KEY = 'plcsim:report-author';

	let title = $state(project.name || 'PLC program');
	let author = $state(readAuthor());
	let date = $state(new Date().toLocaleDateString());
	let light = $state(true);
	let show = $state({ program: true, symbols: true, io: true, il: false });

	function readAuthor(): string {
		try {
			return localStorage.getItem(AUTHOR_KEY) ?? '';
		} catch {
			return '';
		}
	}
	$effect(() => {
		try {
			localStorage.setItem(AUTHOR_KEY, author);
		} catch {
			// storage unavailable — the field still works for this page
		}
	});

	// white page margins when printing a light report
	$effect(() => {
		document.documentElement.classList.toggle('print-light', light);
		return () => document.documentElement.classList.remove('print-light');
	});

	const symbols = $derived(
		[
			...project.deviceSymbols.map((s) => ({ ...s, source: 'device' })),
			...project.userSymbols.map((s) => ({ ...s, source: 'table' }))
		]
			.filter((s) => s.name.trim() && s.address.trim())
			.sort((a, b) => compareAddresses(a.address.toUpperCase(), b.address.toUpperCase()))
	);

	const io = $derived(
		project.circuit.wires
			.flatMap((w) => {
				const d = project.circuit.devices.find((x) => x.id === w.device);
				const port = d && portOf(d.type, w.port);
				if (!d || !port) return [];
				return [
					{
						terminal: w.terminal.toUpperCase(),
						device: d.label + port.suffix,
						type: DEVICES[d.type].name + (port.id === 'main' ? '' : ` (${port.label})`),
						contact: port.io === 'input' ? (d.nc ? 'NC' : 'NO') : ''
					}
				];
			})
			.sort((a, b) => compareAddresses(a.terminal, b.terminal))
	);
	const plant = $derived(plantInfo(project.scenario));
	const il = $derived(disassemble(project.compiled.program).filter((l) => !/^(TAP|LDT)\b/.test(l)));
	const stLines = $derived(project.st.split('\n'));

	const sections: Record<string, HTMLElement | undefined> = $state({});
	let busy = $state<string | null>(null);

	async function png(key: string) {
		const node = sections[key];
		if (!node) return;
		busy = key;
		try {
			const url = await toPng(node, {
				pixelRatio: 2,
				backgroundColor: light ? '#ffffff' : '#020617',
				filter: (n) => !(n instanceof HTMLElement && n.dataset.noExport !== undefined)
			});
			const a = document.createElement('a');
			a.href = url;
			a.download = `${(title || 'plc').replace(/[^\w-]+/g, '_')}-${key}.png`;
			a.click();
		} finally {
			busy = null;
		}
	}

	const button =
		'rounded border border-slate-600 px-2.5 py-1 text-xs hover:bg-slate-700 disabled:opacity-50';
	const th = 'border-b px-2 py-1 text-left font-semibold';
	const td = 'border-b px-2 py-1 align-top';
</script>

<div class="report {light ? 'light' : ''} min-h-full">
	<div
		class="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-slate-800 bg-slate-900 px-4 py-2 text-slate-200 print:hidden"
	>
		<a href={resolve('/editor/[id]', { id: projectId })} class="{button} mr-2">← Editor</a>
		<button class="{button} border-emerald-500 bg-emerald-600 text-white" onclick={() => print()}
			>Print / Save as PDF</button
		>
		<label class="flex items-center gap-1 text-xs">
			<input type="checkbox" bind:checked={light} /> Light (for printing)
		</label>
		<span class="mx-2 h-5 w-px bg-slate-700"></span>
		<span class="text-xs text-slate-400">Show:</span>
		{#each [['program', 'Program'], ['symbols', 'Symbols'], ['io', 'I/O list'], ['il', 'IL code']] as const as [key, label] (key)}
			<label class="flex items-center gap-1 text-xs">
				<input type="checkbox" bind:checked={show[key]} />
				{label}
			</label>
		{/each}
	</div>

	<article class="sheet mx-auto max-w-5xl space-y-8 px-6 py-8">
		<header class="border-b pb-3">
			<input
				class="w-full bg-transparent text-2xl font-bold outline-none"
				bind:value={title}
				aria-label="Report title"
			/>
			<div class="mt-1 flex flex-wrap gap-x-6 gap-y-1 text-sm">
				<input
					class="min-w-64 flex-1 bg-transparent outline-none placeholder:opacity-60"
					bind:value={author}
					placeholder="Author, student number, group…"
					aria-label="Author"
				/>
				<input
					class="w-32 bg-transparent text-right outline-none"
					bind:value={date}
					aria-label="Date"
				/>
			</div>
			<p class="mt-2 text-xs opacity-70">
				{project.language === 'st'
					? 'Structured Text (IEC 61131-3)'
					: project.language === 'sfc'
						? 'Sequential Function Chart (SFC)'
						: 'Ladder diagram (LAD)'}
				{#if plant}· plant: {plant.name}{/if} · {project.compiled.program.length} IL instructions · made
				with PLC Sim
			</p>
		</header>

		{#if show.program}
			<section aria-labelledby="r-program">
				<div class="mb-2 flex items-center justify-between">
					<h2 id="r-program" class="text-lg font-semibold">Program</h2>
					<button
						class="{button} print:hidden"
						disabled={busy !== null}
						onclick={() => png('program')}>{busy === 'program' ? 'Rendering…' : 'PNG'}</button
					>
				</div>
				<div bind:this={sections.program} class="export p-3">
					{#if project.language === 'sfc'}
						<div class="sfc">
							<SfcEditor sfc={project.sfc} readOnly={true} active={() => null} flagged={[]} />
						</div>
					{:else if project.language === 'st'}
						<pre class="code text-xs leading-5">{#each stLines as line, i (i)}<span class="ln"
									>{String(i + 1).padStart(3)}</span
								>  {line}
							{/each}</pre>
					{:else}
						<div class="ladder">
							<LadderEditor doc={project.ladder} monitor={null} locked={true} />
						</div>
					{/if}
				</div>
			</section>
		{/if}

		{#if show.symbols}
			<section aria-labelledby="r-symbols" class="break-inside-avoid">
				<div class="mb-2 flex items-center justify-between">
					<h2 id="r-symbols" class="text-lg font-semibold">Symbol table</h2>
					<button
						class="{button} print:hidden"
						disabled={busy !== null}
						onclick={() => png('symbols')}>{busy === 'symbols' ? 'Rendering…' : 'PNG'}</button
					>
				</div>
				<div bind:this={sections.symbols} class="export p-3">
					<table class="w-full border-collapse text-sm">
						<thead>
							<tr
								><th class={th}>Symbol</th><th class={th}>Address</th><th class={th}>Comment</th
								></tr
							>
						</thead>
						<tbody>
							{#each symbols as s (s.id)}
								<tr>
									<td class="{td} font-mono">{s.name}</td>
									<td class="{td} font-mono">{s.address.toUpperCase()}</td>
									<td class={td}>{s.comment}</td>
								</tr>
							{:else}
								<tr><td class={td} colspan="3">No symbols.</td></tr>
							{/each}
						</tbody>
					</table>
				</div>
			</section>
		{/if}

		{#if show.io}
			<section aria-labelledby="r-io" class="break-inside-avoid">
				<div class="mb-2 flex items-center justify-between">
					<h2 id="r-io" class="text-lg font-semibold">I/O list</h2>
					<button class="{button} print:hidden" disabled={busy !== null} onclick={() => png('io')}
						>{busy === 'io' ? 'Rendering…' : 'PNG'}</button
					>
				</div>
				<div bind:this={sections.io} class="export p-3">
					<table class="w-full border-collapse text-sm">
						<thead>
							<tr>
								<th class={th}>Terminal</th><th class={th}>Device</th><th class={th}>Type</th><th
									class={th}>Contact</th
								>
							</tr>
						</thead>
						<tbody>
							{#each io as row (row.terminal + row.device)}
								<tr>
									<td class="{td} font-mono">{row.terminal}</td>
									<td class="{td} font-mono">{row.device}</td>
									<td class={td}>{row.type}</td>
									<td class={td}>{row.contact}</td>
								</tr>
							{/each}
							{#each plant?.io ?? [] as p (p.address)}
								<tr>
									<td class="{td} font-mono">{p.address}</td>
									<td class="{td} font-mono">{p.name}</td>
									<td class={td}>{plant!.name}: {p.comment}</td>
									<td class={td}></td>
								</tr>
							{/each}
							{#if io.length === 0 && !plant}
								<tr><td class={td} colspan="4">Nothing is wired.</td></tr>
							{/if}
						</tbody>
					</table>
				</div>
			</section>
		{/if}

		{#if show.il}
			<section aria-labelledby="r-il">
				<div class="mb-2 flex items-center justify-between">
					<h2 id="r-il" class="text-lg font-semibold">Compiled code (IL)</h2>
					<button class="{button} print:hidden" disabled={busy !== null} onclick={() => png('il')}
						>{busy === 'il' ? 'Rendering…' : 'PNG'}</button
					>
				</div>
				<div bind:this={sections.il} class="export p-3">
					<pre class="code columns-2 text-xs leading-5">{#each il as line, i (i)}<span class="ln"
								>{String(i).padStart(3)}</span
							>  {line}
						{/each}</pre>
				</div>
			</section>
		{/if}
	</article>
</div>

<style>
	.report {
		color: #e2e8f0;
		background: #020617;
	}
	.report.light {
		color: #0f172a;
		background: #ffffff;
	}
	.report.light .sheet :global(th),
	.report.light .sheet :global(td),
	.report.light header {
		border-color: #cbd5e1;
	}
	.report :global(th),
	.report :global(td) {
		border-color: #334155;
	}
	.export {
		background: inherit;
	}
	/* The ladder editor is drawn for a dark UI: in light mode it is inverted (hues kept). */
	.report.light .ladder {
		filter: invert(1) hue-rotate(180deg);
		background: #020617;
	}
	.ln {
		opacity: 0.45;
		user-select: none;
	}
	.code {
		white-space: pre;
		font-family: var(--font-mono);
	}
	@media print {
		:global(html.print-light),
		:global(html.print-light body) {
			background: #ffffff;
		}
		.report {
			-webkit-print-color-adjust: exact;
			print-color-adjust: exact;
		}
		.sheet {
			max-width: none;
			padding: 0;
		}
	}
</style>
