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
		<defs>
			<linearGradient id="tank-water" x1="0" x2="0" y1="0" y2="1">
				<stop offset="0" stop-color="#38bdf8" />
				<stop offset="1" stop-color="#0369a1" />
			</linearGradient>
			<linearGradient id="tank-wall" x1="0" x2="1" y1="0" y2="0">
				<stop offset="0" stop-color="#1e293b" />
				<stop offset="0.5" stop-color="#0f172a" />
				<stop offset="1" stop-color="#1e293b" />
			</linearGradient>
		</defs>
		<!-- inlet pipe and pump -->
		<path d="M10 20 H150 V40" fill="none" stroke="#334155" stroke-width="10" />
		{#if state.pump}
			<path
				d="M10 20 H150 V{levelY}"
				fill="none"
				stroke="#7dd3fc"
				stroke-width="4"
				stroke-dasharray="6 8"
				class="flow"
			/>
		{/if}
		<circle
			cx="60"
			cy="20"
			r="16"
			fill="#1e293b"
			stroke={state.pump ? '#34d399' : '#64748b'}
			stroke-width="3"
		/>
		<g transform="translate(60 20)">
			<g class={state.pump ? 'spin' : ''}>
				<path d="M0 -10 L4 0 L0 10 L-4 0 Z" fill="#e2e8f0" />
				<path d="M-10 0 L0 4 L10 0 L0 -4 Z" fill="#94a3b8" />
			</g>
		</g>
		<text x="60" y="52" text-anchor="middle" font-size="10" fill="#94a3b8">Pump Q0.0</text>

		<!-- tank -->
		<rect
			x="100"
			y={TOP}
			width="160"
			height={H}
			rx="4"
			fill="url(#tank-wall)"
			stroke="#64748b"
			stroke-width="3"
		/>
		<clipPath id="tank-inside">
			<rect x="101.5" y={TOP} width="157" height={H - 1.5} rx="3" />
		</clipPath>
		<g clip-path="url(#tank-inside)">
			<rect
				x="100"
				y={levelY}
				width="160"
				height={TOP + H - levelY}
				fill="url(#tank-water)"
				opacity="0.85"
			/>
			<!-- the surface moves a little -->
			<path
				d="M60 {levelY} q 20 -5 40 0 t 40 0 t 40 0 t 40 0 t 40 0 t 40 0 V {levelY + 6} H60 Z"
				fill="#7dd3fc"
				opacity="0.6"
				class="wave"
			/>
		</g>
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
		<path d="M180 {TOP + H} V310 H350" fill="none" stroke="#334155" stroke-width="10" />
		{#if state.drain && state.level > 0.5}
			<path
				d="M180 {TOP + H} V310 H350"
				fill="none"
				stroke="#7dd3fc"
				stroke-width="4"
				stroke-dasharray="6 8"
				class="flow"
			/>
		{/if}
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

<style>
	.flow {
		animation: flow 0.5s linear infinite;
	}
	@keyframes flow {
		to {
			stroke-dashoffset: -14;
		}
	}
	.spin {
		animation: spin 0.6s linear infinite;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
	.wave {
		animation: wave 2.4s ease-in-out infinite alternate;
	}
	@keyframes wave {
		to {
			transform: translateX(-40px);
		}
	}
</style>
