<script lang="ts">
	import { t } from '#lib/i18n/i18n.svelte.js';
	import type { TraceBuffer } from '#lib/runtime/trace.js';
	import type { TraceSample } from '#lib/runtime/protocol.js';
	import { formatValue, type TrendLane } from './watch.js';

	/** Anything with a current time and a trace — the PLC runtime or a tutorial mini-simulator. */
	type TrendSource = { readonly snapshot: { timeMs: number } | null; readonly trace: TraceBuffer };
	type Props = {
		runtime: TrendSource;
		lanes: TrendLane[];
		onRestart: () => void;
		/** Fills the chart with signals when it is empty (offered as a button). */
		onAddSignals?: () => void;
	};
	let { runtime, lanes, onRestart, onAddSignals }: Props = $props();

	const WINDOWS = [1000, 2000, 5000, 10_000, 30_000, 60_000];
	const COLORS = [
		'#34d399',
		'#fcd34d',
		'#38bdf8',
		'#f472b6',
		'#a78bfa',
		'#fb923c',
		'#4ade80',
		'#f87171'
	];
	const LABEL_W = 132;
	const BIT_H = 28;
	const NUM_H = 64;
	const GAP = 8;
	const AXIS_H = 18;

	let windowMs = $state(5000);
	let hold = $state<number | null>(null);
	let width = $state(800);
	let cursorX = $state<number | null>(null);

	const plotW = $derived(Math.max(100, width - LABEL_W - 12));
	const now = $derived(hold ?? runtime.snapshot?.timeMs ?? 0);
	const from = $derived(now - windowMs);
	const x = (t: number) => LABEL_W + ((Math.max(t, from) - from) / windowMs) * plotW;

	const layout = $derived.by(() => {
		let top = 4;
		return lanes.map((lane, i) => {
			const h = lane.format === 'BOOL' ? BIT_H : NUM_H;
			const l = { ...lane, top, h, color: COLORS[i % COLORS.length], index: i };
			top += h + GAP;
			return l;
		});
	});
	const height = $derived((layout.at(-1)?.top ?? 0) + (layout.at(-1)?.h ?? 0) + GAP + AXIS_H);

	/** Step-function path of one lane over the visible window. */
	function lanePath(samples: TraceSample[], lane: (typeof layout)[number]) {
		const values = samples.map((s) => s.v[lane.index]).filter((v) => Number.isFinite(v));
		if (values.length === 0) return { d: '', min: 0, max: 0 };
		let min = Math.min(...values);
		let max = Math.max(...values);
		if (lane.format === 'BOOL') [min, max] = [0, 1];
		else if (min === max) [min, max] = [min - 1, max + 1];
		const y = (v: number) => lane.top + lane.h - 3 - ((v - min) / (max - min)) * (lane.h - 6);

		let d = '';
		for (const s of samples) {
			const v = s.v[lane.index];
			if (!Number.isFinite(v)) continue;
			d += d
				? ` H${x(s.t).toFixed(1)} V${y(v).toFixed(1)}`
				: `M${x(s.t).toFixed(1)} ${y(v).toFixed(1)}`;
		}
		if (d) d += ` H${(LABEL_W + plotW).toFixed(1)}`;
		return { d, min, max };
	}

	const paths = $derived.by(() => {
		void runtime.snapshot; // redraw whenever new samples arrive
		const samples = runtime.trace.window(from, now);
		return layout.map((lane) => lanePath(samples, lane));
	});

	const ticks = $derived.by(() => {
		const steps = [10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10_000, 20_000];
		const step = steps.find((s) => windowMs / s <= 10) ?? 20_000;
		const out: number[] = [];
		for (let t = Math.ceil(from / step) * step; t <= now; t += step) if (t >= 0) out.push(t);
		return out;
	});

	const cursorT = $derived(
		cursorX === null ? null : from + ((cursorX - LABEL_W) / plotW) * windowMs
	);
	const shown = $derived.by(() => {
		void runtime.snapshot;
		return runtime.trace.valuesAt(cursorT ?? now);
	});

	function onMove(e: PointerEvent) {
		const rect = (e.currentTarget as SVGElement).getBoundingClientRect();
		const px = e.clientX - rect.left;
		cursorX = px >= LABEL_W && px <= LABEL_W + plotW ? px : null;
	}
</script>

<div class="flex h-full flex-col">
	<div class="flex items-center gap-3 border-b border-slate-800 px-3 py-1.5 text-xs">
		<span class="font-semibold tracking-wider text-slate-400 uppercase">Trend</span>
		<label class="flex items-center gap-1 text-slate-400">
			{t('trend.window')}
			<select class="rounded bg-slate-800 px-1 py-0.5 text-slate-200" bind:value={windowMs}>
				{#each WINDOWS as w (w)}<option value={w}>{w / 1000} s</option>{/each}
			</select>
		</label>
		<button
			class="rounded px-2 py-0.5 {hold !== null
				? 'bg-amber-500 text-slate-950'
				: 'bg-slate-800 hover:bg-slate-700'}"
			onclick={() => (hold = hold === null ? (runtime.snapshot?.timeMs ?? 0) : null)}
			title={t('trend.holdTitle')}
		>
			{hold !== null ? t('trend.holding') : t('trend.hold')}
		</button>
		<button class="rounded bg-slate-800 px-2 py-0.5 hover:bg-slate-700" onclick={onRestart}
			>{t('trend.clear')}</button
		>
		<span class="ml-auto font-mono text-slate-500">
			{cursorT !== null ? `t = ${(cursorT / 1000).toFixed(3)} s` : `${(now / 1000).toFixed(2)} s`}
		</span>
	</div>

	<div class="min-h-0 flex-1 overflow-auto" bind:clientWidth={width}>
		{#if lanes.length === 0}
			<div class="flex flex-wrap items-center gap-3 p-4 text-xs text-slate-500">
				<span>{t('trend.empty')}</span>
				{#if onAddSignals}
					<button
						class="rounded border border-sky-500/50 px-2.5 py-1 text-sky-300 hover:bg-sky-500/10"
						onclick={onAddSignals}>{t('trend.plotMain')}</button
					>
				{/if}
			</div>
		{:else}
			<svg
				{width}
				{height}
				class="block select-none"
				role="img"
				aria-label={t('trend.timing')}
				onpointermove={onMove}
				onpointerleave={() => (cursorX = null)}
			>
				{#each ticks as t (t)}
					<line x1={x(t)} x2={x(t)} y1="0" y2={height - AXIS_H} stroke="#1e293b" />
					<text
						x={x(t)}
						y={height - 5}
						fill="#64748b"
						font-size="10"
						text-anchor="middle"
						font-family="monospace">{(t / 1000).toFixed(windowMs <= 2000 ? 2 : 1)}s</text
					>
				{/each}

				{#each layout as lane, i (i)}
					{@const p = paths[i]}
					{@const v = shown?.[lane.index]}
					<rect x={LABEL_W} y={lane.top} width={plotW} height={lane.h} fill="#0f172a" rx="2" />
					<text x="8" y={lane.top + 12} fill={lane.color} font-size="11" font-family="monospace"
						>{lane.label}</text
					>
					<text x="8" y={lane.top + 25} fill="#cbd5e1" font-size="10" font-family="monospace"
						>{formatValue(v ?? null, lane.format, 32)}</text
					>
					{#if lane.format !== 'BOOL' && p.d}
						<text x={LABEL_W - 4} y={lane.top + 10} fill="#475569" font-size="9" text-anchor="end"
							>{p.max}</text
						>
						<text
							x={LABEL_W - 4}
							y={lane.top + lane.h - 2}
							fill="#475569"
							font-size="9"
							text-anchor="end">{p.min}</text
						>
					{/if}
					<path
						d={p.d}
						fill="none"
						stroke={lane.color}
						stroke-width="1.75"
						stroke-linejoin="round"
					/>
				{/each}

				{#if cursorX !== null}
					<line
						x1={cursorX}
						x2={cursorX}
						y1="0"
						y2={height - AXIS_H}
						stroke="#e2e8f0"
						stroke-dasharray="3 3"
					/>
				{/if}
			</svg>
		{/if}
	</div>
</div>
