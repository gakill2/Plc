<script lang="ts">
	import type { TankState } from './types.js';

	type Props = {
		state: TankState;
		command: (name: string, value?: unknown) => void;
		online: boolean;
	};
	let { state, command, online }: Props = $props();

	// tank geometry in the SVG
	const TOP = 40;
	const H = 240;
	const levelY = $derived(TOP + H * (1 - state.level / 100));
	const sensorY = (pct: number) => TOP + H * (1 - pct / 100);
</script>

<div class="flex h-full flex-wrap items-center justify-center gap-10 p-8">
	<svg
		viewBox="0 0 360 330"
		class="h-80 max-w-full"
		role="img"
		aria-label="Tank at {state.level.toFixed(0)} %"
	>
		<!-- inlet pipe and pump -->
		<path
			d="M10 20 H150 V40"
			fill="none"
			stroke={state.pump ? '#38bdf8' : '#475569'}
			stroke-width="8"
		/>
		<circle
			cx="60"
			cy="20"
			r="16"
			fill="#1e293b"
			stroke={state.pump ? '#34d399' : '#64748b'}
			stroke-width="3"
		/>
		<text x="60" y="25" text-anchor="middle" font-size="12" font-weight="bold" fill="#e2e8f0"
			>P</text
		>
		<text x="60" y="52" text-anchor="middle" font-size="10" fill="#94a3b8">Pump Q0.0</text>

		<!-- tank -->
		<rect x="100" y={TOP} width="160" height={H} fill="#0f172a" stroke="#64748b" stroke-width="3" />
		<rect
			x="101.5"
			y={levelY}
			width="157"
			height={TOP + H - levelY}
			fill="#0ea5e9"
			opacity="0.75"
		/>
		<text
			x="180"
			y={TOP + H / 2}
			text-anchor="middle"
			font-size="22"
			font-weight="bold"
			fill="#f8fafc"
		>
			{state.level.toFixed(0)} %
		</text>

		<!-- sensors -->
		{#each [{ pct: 80, on: state.high, name: 'High I0.1' }, { pct: 20, on: state.low, name: 'Low I0.0' }] as s (s.name)}
			<line
				x1="260"
				x2="285"
				y1={sensorY(s.pct)}
				y2={sensorY(s.pct)}
				stroke="#64748b"
				stroke-width="3"
			/>
			<circle cx="292" cy={sensorY(s.pct)} r="7" fill={s.on ? '#34d399' : '#334155'} />
			<text x="304" y={sensorY(s.pct) + 4} font-size="11" fill="#cbd5e1">{s.name}</text>
		{/each}

		<!-- outlet -->
		<path
			d="M180 {TOP + H} V310 H350"
			fill="none"
			stroke={state.drain ? '#38bdf8' : '#475569'}
			stroke-width="8"
		/>
		<text x="300" y="300" text-anchor="middle" font-size="10" fill="#94a3b8">consumer</text>

		{#if state.overflowed}
			<text
				x="180"
				y={TOP - 12}
				text-anchor="middle"
				font-size="13"
				font-weight="bold"
				fill="#f87171">OVERFLOW!</text
			>
		{/if}
	</svg>

	<div class="w-56 space-y-3 text-xs text-slate-300">
		<label class="flex items-center gap-2">
			<input
				type="checkbox"
				class="accent-sky-500"
				checked={state.drain}
				onchange={(e) => command('drain', e.currentTarget.checked)}
			/>
			Consumer draws water (−4 %/s)
		</label>
		<div class="flex items-center gap-2">
			<span>Set level</span>
			{#each [10, 50, 90] as pct (pct)}
				<button
					class="rounded bg-slate-800 px-2 py-0.5 hover:bg-slate-700"
					onclick={() => command('level', pct)}>{pct} %</button
				>
			{/each}
		</div>
		<dl class="grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-[11px] text-slate-400">
			<dt>pump starts</dt>
			<dd>{state.pumpStarts}</dd>
			<dt>min / max</dt>
			<dd>{state.minLevel.toFixed(0)} / {state.maxLevel.toFixed(0)} %</dd>
		</dl>
		{#if !online}<p class="text-slate-500">The plant runs while the PLC is in RUN.</p>{/if}
	</div>
</div>
