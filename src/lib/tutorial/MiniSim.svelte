<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import LadderEditor from '#lib/editor/LadderEditor.svelte';
	import { parseAddress, Plc, type Address } from '#lib/engine/index.js';
	import { LadderDocument } from '#lib/ladder/document.svelte.js';
	import { createMonitor } from '#lib/ladder/monitor.js';
	import TrendChart from '#lib/monitor/TrendChart.svelte';
	import type { TrendLane } from '#lib/monitor/watch.js';
	import type { RuntimeSnapshot } from '#lib/runtime/protocol.js';
	import { readBit } from '#lib/runtime/read.js';
	import { TraceBuffer } from '#lib/runtime/trace.js';
	import { resolveSymbol } from '#lib/symbols/symbols.js';
	import { compileSim, inputSignal, simSymbols, truthTable } from './sim.js';
	import type { SimBlock } from './types.js';

	let { block }: { block: SimBlock } = $props();

	// a simulator is set up once from its (static) description
	const spec = untrack(() => block);
	const symbols = simSymbols(spec);
	const compiled = compileSim(spec);
	const doc = spec.ladder ? new LadderDocument(spec.ladder(), () => symbols) : null;
	const resolve = (t: string) => resolveSymbol(symbols.map, t);

	const plc = new Plc();
	plc.load(compiled.program);
	plc.run();

	let pressed = $state<Record<string, boolean>>({});
	let broken = $state<Record<string, boolean>>({});
	let running = $state(true);
	let slow = $state(false);
	let snapshot = $state.raw<RuntimeSnapshot | null>(null);

	/* ---------- timing diagram ---------- */
	const trace = new TraceBuffer(20_000);
	const traced: { addr: Address; bit: boolean }[] = (spec.trace ?? []).map((t) => ({
		addr: parseAddress(resolve(t.address)),
		bit: (t.format ?? 'BOOL') === 'BOOL'
	}));
	const lanes: TrendLane[] = (spec.trace ?? []).map((t) => ({
		label: t.address,
		format: t.format ?? 'BOOL'
	}));
	/** Header + lanes (bit 36 px, number 72 px) + time axis. */
	const trendHeight = 44 + lanes.reduce((h, l) => h + (l.format === 'BOOL' ? 36 : 72), 0) + 30;
	let epoch = 0;
	let last: number[] | null = null;

	function sample() {
		if (traced.length === 0) return;
		const v = traced.map((t) =>
			t.bit ? (plc.memory.readBit(t.addr) ? 1 : 0) : plc.memory.readNumber(t.addr)
		);
		if (last && v.every((x, i) => x === last![i])) return;
		last = v;
		trace.push({ epoch, samples: [{ t: plc.timeMs, v }] });
	}

	function scanOnce() {
		for (const inp of spec.inputs) {
			plc.setInput(
				inp.address,
				inputSignal(inp, pressed[inp.address] ?? false, broken[inp.address] ?? false)
			);
		}
		plc.scan(10);
		sample();
	}

	function publish() {
		snapshot = {
			...plc.snapshot(),
			status: running ? 'RUN' : 'PAUSED',
			speed: slow ? 0.1 : 1,
			scanMs: 10,
			trace: { epoch, samples: [] },
			process: null
		};
	}

	function reset() {
		plc.reset();
		plc.run();
		pressed = {};
		epoch++;
		last = null;
		trace.push({ epoch, samples: [] });
		sample();
		publish();
	}

	function step() {
		running = false;
		scanOnce();
		publish();
	}

	onMount(() => {
		trace.push({ epoch, samples: [] });
		sample();
		let prev = performance.now();
		let debt = 0;
		let frame = 0;
		const loop = (now: number) => {
			const dt = Math.min(now - prev, 100);
			prev = now;
			if (running) {
				debt += dt * (slow ? 0.1 : 1);
				while (debt >= 10) {
					scanOnce();
					debt -= 10;
				}
			}
			publish();
			frame = requestAnimationFrame(loop);
		};
		frame = requestAnimationFrame(loop);
		return () => cancelAnimationFrame(frame);
	});

	const monitor = $derived(
		snapshot && doc ? createMonitor(snapshot, compiled.taps, resolve) : null
	);
	const terminal = (address: string, image: 'inputs' | 'outputs') => {
		if (!snapshot) return false;
		const a = parseAddress(address);
		return a.area !== 'T' && a.area !== 'C' && a.size === 'X'
			? ((snapshot[image][a.byte] >> a.bit) & 1) === 1
			: false;
	};
	const imageBit = (address: string) =>
		snapshot ? readBit(snapshot, parseAddress(address)) === true : false;

	const table = spec.truthTable ? truthTable(spec, compiled.program) : null;
	const currentRow = $derived(
		table?.findIndex((row) =>
			row.inputs.every((v, i) => v === terminal(spec.inputs[i].address, 'inputs'))
		) ?? -1
	);

	const LAMP = {
		green: 'bg-emerald-400 shadow-emerald-400/70',
		red: 'bg-red-500 shadow-red-500/70',
		amber: 'bg-amber-300 shadow-amber-300/70',
		blue: 'bg-sky-400 shadow-sky-400/70'
	};
	const source = {
		get snapshot() {
			return snapshot;
		},
		trace
	};
</script>

<figure class="overflow-hidden rounded-lg border border-slate-700 bg-slate-950">
	<div class="flex flex-wrap items-center gap-2 border-b border-slate-800 bg-slate-900 px-3 py-2">
		<span class="text-xs font-semibold tracking-wider text-sky-300 uppercase">Symulator</span>
		{#if spec.title}<span class="text-sm text-slate-200">{spec.title}</span>{/if}
		<div class="ml-auto flex items-center gap-1 text-xs">
			<span class="mr-2 font-mono text-slate-500"
				>{((snapshot?.timeMs ?? 0) / 1000).toFixed(2)} s · cykl #{snapshot?.scanCount ?? 0}</span
			>
			<button
				class="rounded px-2 py-1 hover:bg-slate-800"
				onclick={() => (running = !running)}
				aria-label={running ? 'Pauza' : 'Wznów'}>{running ? '❚❚ Pauza' : '▶ Start'}</button
			>
			<button
				class="rounded px-2 py-1 hover:bg-slate-800"
				onclick={step}
				title="Jeden cykl programu (10 ms)">⏭ Krok</button
			>
			<button
				class="rounded px-2 py-1 {slow ? 'bg-amber-500 text-slate-950' : 'hover:bg-slate-800'}"
				aria-pressed={slow}
				onclick={() => (slow = !slow)}
				title="Czas płynie 10× wolniej">🐢 ×0,1</button
			>
			<button
				class="rounded px-2 py-1 hover:bg-slate-800"
				onclick={reset}
				title="Zimny restart sterownika">↺ Reset</button
			>
		</div>
	</div>

	<div class="grid gap-0 md:grid-cols-[minmax(0,1fr)_14rem]">
		<div class="min-w-0 overflow-x-auto p-3">
			{#if doc}
				<LadderEditor {doc} {monitor} locked={true} />
			{:else}
				<pre
					class="overflow-x-auto rounded bg-slate-900 p-3 font-mono text-[13px] leading-relaxed text-slate-200">{spec.st?.trim()}</pre>
			{/if}
		</div>

		<div class="space-y-4 border-t border-slate-800 p-3 md:border-t-0 md:border-l">
			<div>
				<p class="mb-1.5 text-[11px] tracking-wider text-slate-500 uppercase">Wejścia</p>
				<div class="space-y-2">
					{#each spec.inputs as inp (inp.address)}
						{@const isPressed = pressed[inp.address] ?? false}
						{@const signal = terminal(inp.address, 'inputs')}
						<div class="space-y-1">
							<div class="flex items-center gap-2">
								{#if inp.kind === 'toggle'}
									<button
										class="flex w-28 items-center gap-2 rounded border px-2 py-1 text-xs {isPressed
											? 'border-emerald-500/60 bg-emerald-500/15 text-emerald-100'
											: 'border-slate-700 bg-slate-900 text-slate-300'}"
										aria-pressed={isPressed}
										aria-label="Przełącz {inp.label}"
										onclick={() => (pressed[inp.address] = !isPressed)}
									>
										<span
											class="h-3 w-5 rounded-full p-px {isPressed
												? 'bg-emerald-400'
												: 'bg-slate-700'}"
										>
											<span
												class="block size-2.5 rounded-full bg-white transition-transform {isPressed
													? 'translate-x-2'
													: ''}"
											></span>
										</span>
										{inp.label}
									</button>
								{:else}
									<button
										class="w-28 rounded-full border-2 px-2 py-1 text-xs font-medium select-none {isPressed
											? 'scale-95 border-emerald-400 bg-emerald-500/30 text-white'
											: 'border-slate-600 bg-slate-800 text-slate-200 hover:border-slate-400'}"
										aria-label="Wciśnij {inp.label}"
										onpointerdown={(e) => {
											e.currentTarget.setPointerCapture(e.pointerId);
											pressed[inp.address] = true;
										}}
										onpointerup={() => (pressed[inp.address] = false)}
										onpointercancel={() => (pressed[inp.address] = false)}
									>
										{inp.label}
									</button>
								{/if}
								<span
									class="flex items-center gap-1 font-mono text-[10px] {signal
										? 'text-emerald-300'
										: 'text-slate-500'}"
									title="Sygnał na zacisku {inp.address}"
								>
									<span class="size-2 rounded-full {signal ? 'bg-emerald-400' : 'bg-slate-700'}"
									></span>
									{inp.address}={signal ? 1 : 0}
								</span>
							</div>
							{#if inp.nc || inp.breakable}
								<div class="flex items-center gap-2 pl-1 text-[10px] text-slate-500">
									{#if inp.nc}<span class="rounded bg-slate-800 px-1">przycisk NC</span>{/if}
									{#if inp.breakable}
										<label class="flex items-center gap-1">
											<input
												type="checkbox"
												class="accent-red-500"
												bind:checked={broken[inp.address]}
											/>
											przerwany przewód
										</label>
									{/if}
								</div>
							{/if}
						</div>
					{/each}
				</div>
			</div>

			<div>
				<p class="mb-1.5 text-[11px] tracking-wider text-slate-500 uppercase">Wyjścia</p>
				<div class="space-y-1.5">
					{#each spec.outputs as out (out.address)}
						{@const lit = terminal(out.address, 'outputs')}
						<div
							class="flex items-center gap-2 text-xs"
							aria-label="{out.label} {lit ? 'świeci' : 'zgaszona'}"
						>
							<span
								class="size-4 rounded-full border-2 border-slate-600 transition-all {lit
									? `${LAMP[out.color ?? 'amber']} shadow-[0_0_12px]`
									: 'bg-slate-800'}"
							></span>
							<span class={lit ? 'text-slate-100' : 'text-slate-400'}>{out.label}</span>
							<span class="ml-auto font-mono text-[10px] text-slate-500">{out.address}</span>
						</div>
					{/each}
				</div>
			</div>

			{#if spec.symbols?.length}
				<div>
					<p class="mb-1.5 text-[11px] tracking-wider text-slate-500 uppercase">Pamięć</p>
					{#each spec.symbols as s (s.address)}
						{@const on = s.address.match(/^[IQM]\d+\.\d$/) ? imageBit(s.address) : null}
						<div class="flex items-center gap-2 font-mono text-[11px] text-slate-400">
							{#if on !== null}<span
									class="size-2 rounded-full {on ? 'bg-emerald-400' : 'bg-slate-700'}"
								></span>{/if}
							{s.label}
							<span class="ml-auto text-slate-500">{s.address}</span>
						</div>
					{/each}
				</div>
			{/if}
		</div>
	</div>

	{#if lanes.length}
		<div class="border-t border-slate-800" style:height="{trendHeight}px">
			<TrendChart runtime={source} {lanes} onRestart={reset} />
		</div>
	{/if}

	{#if table}
		<div class="border-t border-slate-800 p-3">
			<p class="mb-2 text-[11px] tracking-wider text-slate-500 uppercase">
				Tabela prawdy — aktualny wiersz jest podświetlony
			</p>
			<table class="w-full max-w-md text-center font-mono text-xs">
				<thead class="text-slate-400">
					<tr>
						{#each spec.inputs as i (i.address)}<th class="px-2 py-1 font-medium">{i.label}</th
							>{/each}
						{#each spec.outputs as o (o.address)}<th
								class="border-l border-slate-800 px-2 py-1 font-medium">{o.label}</th
							>{/each}
					</tr>
				</thead>
				<tbody>
					{#each table as row, r (r)}
						<tr class={r === currentRow ? 'bg-sky-500/20 text-white' : 'text-slate-400'}>
							{#each row.inputs as v, k (k)}<td class="px-2 py-0.5">{v ? 1 : 0}</td>{/each}
							{#each row.outputs as v, k (k)}<td
									class="border-l border-slate-800 px-2 py-0.5 {v ? 'text-emerald-300' : ''}"
									>{v ? 1 : 0}</td
								>{/each}
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}

	{#if spec.caption}
		<figcaption class="border-t border-slate-800 bg-slate-900/60 px-3 py-2 text-xs text-slate-400">
			{spec.caption}
		</figcaption>
	{/if}
</figure>
