<script lang="ts">
	import { describeFrame, traceScan, type ScanTrace } from '#lib/engine/index.js';
	import type { CompiledLadder } from '#lib/ladder/compiler.js';
	import type { RuntimeSnapshot } from '#lib/runtime/protocol.js';

	/*
	 * Scan-cycle debugger: takes a picture of the PLC memory and runs one scan on a copy,
	 * instruction by instruction, showing the logic stack (RLO) and every read and write.
	 */
	type Props = {
		compiled: CompiledLadder;
		snapshot: RuntimeSnapshot | null;
		/** address → symbol name */
		names: ReadonlyMap<string, string>;
		language: 'ladder' | 'st' | 'sfc' | 'fbd';
		/** Network label for a source id (ladder node id / "L<line>"). */
		place: (owner: string) => string;
		onSelect: (owner: string) => void;
	};
	let { compiled, snapshot, names, language, place, onSelect }: Props = $props();

	let trace = $state.raw<ScanTrace | null>(null);
	let takenAt = $state<{ scan: number; time: number; inputs: string[] } | null>(null);
	let index = $state(0);
	let showProbes = $state(false);

	const name = (a: string) => (names.has(a) ? `${names.get(a)} (${a})` : a);

	function capture() {
		trace = traceScan(compiled.program, snapshot, snapshot?.scanMs ?? 10);
		const inputs: string[] = [];
		const data = snapshot?.inputs;
		if (data)
			for (let byte = 0; byte < data.length; byte++)
				for (let bit = 0; bit < 8; bit++)
					if ((data[byte] >> bit) & 1) inputs.push(name(`I${byte}.${bit}`));
		takenAt = { scan: snapshot?.scanCount ?? 0, time: snapshot?.timeMs ?? 0, inputs };
		index = 0;
		follow();
	}

	const visible = $derived(
		trace
			? trace.frames
					.map((f, i) => ({ f, i }))
					.filter(({ f }) => showProbes || !/^TAP\b/.test(f.text))
			: []
	);
	const pos = $derived(
		Math.max(
			0,
			visible.findIndex((v) => v.i >= index)
		)
	);
	const current = $derived(visible[pos]?.f ?? null);
	const owner = $derived(current ? (compiled.sourceMap[current.pc] ?? null) : null);

	function go(to: number) {
		const v = visible[Math.max(0, Math.min(visible.length - 1, to))];
		if (!v) return;
		index = v.i;
		follow();
	}
	function follow() {
		const f = trace?.frames[index];
		const o = f ? compiled.sourceMap[f.pc] : null;
		if (o && language === 'ladder') onSelect(o);
	}

	function onKeydown(e: KeyboardEvent) {
		if (!trace || (e.target as HTMLElement).closest('input, select, textarea')) return;
		if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
			e.preventDefault();
			go(pos + 1);
		} else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
			e.preventDefault();
			go(pos - 1);
		}
	}

	let listEl = $state<HTMLElement>();
	$effect(() => {
		void index;
		listEl?.querySelector('[aria-current="step"]')?.scrollIntoView({ block: 'nearest' });
	});

	const button =
		'rounded border border-slate-700 px-2.5 py-1 text-xs text-slate-200 hover:bg-slate-800 disabled:opacity-40';
</script>

<svelte:window onkeydown={onKeydown} />

<div class="flex h-full flex-col gap-3 overflow-hidden p-4">
	<div class="flex flex-wrap items-center gap-3">
		<h2 class="text-sm font-semibold text-slate-100">Debuger cyklu skanu</h2>
		<button
			class="{button} border-sky-500 bg-sky-600 text-white hover:bg-sky-500"
			onclick={capture}
		>
			{trace ? '↻ Nowe zdjęcie' : '📷 Zrób zdjęcie i wykonaj 1 cykl'}
		</button>
		{#if trace}
			<div class="flex items-center gap-1" role="group" aria-label="Kroki">
				<button class={button} title="Pierwszy" disabled={pos === 0} onclick={() => go(0)}>⏮</button
				>
				<button class={button} title="Wstecz (←)" disabled={pos === 0} onclick={() => go(pos - 1)}
					>◀</button
				>
				<span class="min-w-24 text-center font-mono text-xs text-slate-300" aria-live="polite">
					krok {pos + 1} / {visible.length}
				</span>
				<button
					class={button}
					title="Dalej (→)"
					disabled={pos >= visible.length - 1}
					onclick={() => go(pos + 1)}>▶</button
				>
				<button
					class={button}
					title="Ostatni"
					disabled={pos >= visible.length - 1}
					onclick={() => go(visible.length - 1)}>⏭</button
				>
			</div>
			<label class="flex items-center gap-1 text-xs text-slate-400">
				<input type="checkbox" class="accent-sky-500" bind:checked={showProbes} />
				pokaż sondy TAP
			</label>
		{/if}
	</div>

	{#if !trace}
		<div class="max-w-2xl space-y-2 text-sm leading-relaxed text-slate-300">
			<p>
				PLC w każdym cyklu wykonuje program <b>instrukcja po instrukcji</b>. Tutaj zobaczysz to od
				środka: debuger kopiuje aktualny stan pamięci (wejścia, wyjścia, markery, timery) i wykonuje
				na tej kopii <b>jeden cykl</b>, zapisując każdy krok. Prawdziwy sterownik działa dalej bez
				zmian.
			</p>
			<p class="text-slate-400">
				Najpierw ustaw wejścia (panel I/O, obwód albo proces — także w trybie RUN), potem zrób
				zdjęcie. Strzałkami ← → chodzisz po krokach. Ladder i ST kompilują się do tego samego kodu
				IL, więc debuger działa dla obu.
			</p>
		</div>
	{:else}
		<p class="text-xs text-slate-400">
			Zdjęcie z cyklu #{takenAt?.scan} ({((takenAt?.time ?? 0) / 1000).toFixed(2)} s). Wejścia = 1:
			{takenAt?.inputs.length ? takenAt.inputs.join(', ') : 'żadne'}.
			{#if trace.fault}<span class="text-red-400">Cykl przerwany: {trace.fault}.</span>{/if}
			{#if trace.truncated}<span class="text-amber-300"> Pokazano pierwsze 5000 kroków.</span>{/if}
		</p>

		<div class="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
			<ol
				bind:this={listEl}
				class="min-h-0 overflow-auto rounded border border-slate-800 bg-slate-950 font-mono text-xs"
				aria-label="Instrukcje cyklu"
			>
				{#each visible as v, k (v.i)}
					{@const o = compiled.sourceMap[v.f.pc]}
					<li>
						<button
							class="flex w-full items-center gap-2 px-2 py-0.5 text-left {k === pos
								? 'bg-sky-500/20 text-white'
								: 'text-slate-300 hover:bg-slate-800/60'}"
							aria-current={k === pos ? 'step' : undefined}
							onclick={() => go(k)}
						>
							<span class="w-8 shrink-0 text-right text-slate-500">{v.f.pc}</span>
							<span class="flex-1">{v.f.text}</span>
							<span class="text-[10px] text-slate-500">{o ? place(o) : ''}</span>
							<span class="w-14 shrink-0 text-right tracking-widest"
								>{v.f.after.map((x) => (x ? '1' : '0')).join('')}</span
							>
						</button>
					</li>
				{/each}
			</ol>

			{#if current}
				<div class="min-h-0 space-y-4 overflow-auto">
					<div class="rounded border border-slate-800 bg-slate-900 p-3">
						<div class="mb-1 flex items-baseline justify-between gap-2">
							<span class="font-mono text-base text-white">{current.pc}: {current.text}</span>
							{#if owner}
								<span class="text-xs text-slate-400">{place(owner)}</span>
							{/if}
						</div>
						<p class="text-sm leading-relaxed text-slate-200" role="status">
							{describeFrame(current, compiled.program[current.pc], name)}
						</p>
					</div>

					<div>
						<h3 class="mb-1 text-xs font-semibold tracking-wider text-slate-400 uppercase">
							Stos logiczny (RLO na szczycie, z prawej)
						</h3>
						<div class="flex flex-wrap items-center gap-3 font-mono text-sm">
							{#each [{ label: 'przed', s: current.before }, { label: 'po', s: current.after }] as row, r (row.label)}
								{#if r === 1}<span class="text-slate-500">→</span>{/if}
								<div class="flex items-center gap-1">
									<span class="mr-1 text-[10px] text-slate-500">{row.label}</span>
									{#each row.s as bit, i (i)}
										<span
											class="grid size-7 place-items-center rounded border {bit
												? 'border-emerald-400 bg-emerald-500/20 text-emerald-200'
												: 'border-slate-600 bg-slate-800 text-slate-400'} {i === row.s.length - 1
												? 'ring-1 ring-sky-400'
												: ''}">{bit ? 1 : 0}</span
										>
									{:else}
										<span class="text-xs text-slate-500">pusty</span>
									{/each}
								</div>
							{/each}
						</div>
					</div>

					{#if current.reads.length || current.changes.length}
						<div class="grid grid-cols-2 gap-3 text-xs">
							<div>
								<h3 class="mb-1 font-semibold tracking-wider text-slate-400 uppercase">Odczyt</h3>
								{#each current.reads as [a, v] (a)}
									<div class="font-mono text-slate-300">{name(a)} = {v}</div>
								{:else}
									<div class="text-slate-500">—</div>
								{/each}
							</div>
							<div>
								<h3 class="mb-1 font-semibold tracking-wider text-slate-400 uppercase">Zapis</h3>
								{#each current.changes as c (c.address)}
									<div class="font-mono text-amber-200">
										{name(c.address)}: {c.before} → {c.after}
									</div>
								{:else}
									<div class="text-slate-500">bez zmian</div>
								{/each}
							</div>
						</div>
					{/if}

					<div class="rounded border border-slate-800 p-3 text-xs text-slate-400">
						<h3 class="mb-1 font-semibold tracking-wider uppercase">Po całym cyklu</h3>
						{#if trace.outputs.length}
							Wyjścia, które się zmienią:
							{#each trace.outputs as o, i (o.address)}{i ? ', ' : ''}<span
									class="font-mono text-amber-200">{name(o.address)} {o.before}→{o.after}</span
								>{/each}.
						{:else}
							Żadne wyjście nie zmienia się w tym cyklu.
						{/if}
						Na końcu cyklu PLC przepisuje obraz wyjść na zaciski, a na początku następnego wczytuje wejścia.
					</div>
				</div>
			{/if}
		</div>
	{/if}
</div>
