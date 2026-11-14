<script lang="ts">
	import type { LineState } from './types.js';

	type Props = {
		state: LineState;
		command: (name: string, value?: unknown) => void;
		online: boolean;
	};
	let { state, command, online }: Props = $props();

	// 3 m of belt → 600 px
	const X0 = 50;
	const SCALE = 200;
	const BELT_Y = 210;
	const px = (m: number) => X0 + m * SCALE;
	const PART_W = 34; // px, the part's front edge is at x
	const DRILL_X = px(1.2) - PART_W / 2;
	const CHECK_X = px(2.02) - PART_W / 2;

	const on = (v: boolean) => (v ? '#34d399' : '#334155');
	const sensors = $derived([
		{ x: px(0.12) - PART_W / 2, on: state.sensors.atEntry, name: 'Entry I0.3' },
		{ x: DRILL_X - 46, on: state.sensors.atDrill, name: 'At drill I0.0' },
		{ x: CHECK_X, on: state.sensors.atCheck, name: 'Check I0.4' }
	]);
	const mistakes = $derived(
		state.crashes + state.toolBreaks + state.wrongRejected + state.badDelivered
	);
	const drillTip = $derived(70 + state.drill * 98);
</script>

<div class="flex h-full flex-col items-center justify-center gap-5 p-6">
	<svg viewBox="0 0 720 330" class="w-full max-w-4xl" role="img" aria-label="Production line">
		<!-- drill unit -->
		<rect x={DRILL_X - 40} y="18" width="80" height="26" rx="3" fill="#1e293b" stroke="#475569" />
		<text x={DRILL_X} y="35" text-anchor="middle" font-size="10" fill="#94a3b8">drill</text>
		<rect
			x={DRILL_X - 14}
			y={drillTip - 46}
			width="28"
			height="34"
			rx="3"
			fill={state.spindle ? '#f59e0b' : '#64748b'}
		/>
		<line x1={DRILL_X} x2={DRILL_X} y1="44" y2={drillTip - 46} stroke="#64748b" stroke-width="6" />
		<polygon
			points="{DRILL_X - 4},{drillTip - 12} {DRILL_X + 4},{drillTip - 12} {DRILL_X},{drillTip}"
			fill="#cbd5e1"
			class={state.spindle ? 'spin' : ''}
		/>
		<!-- end-position switches -->
		<circle cx={DRILL_X + 54} cy="54" r="5" fill={on(state.sensors.drillTop)} stroke="#64748b" />
		<text x={DRILL_X + 64} y="58" font-size="10" fill="#94a3b8">Top I0.1</text>
		<circle
			cx={DRILL_X + 54}
			cy="160"
			r="5"
			fill={on(state.sensors.drillBottom)}
			stroke="#64748b"
		/>
		<text x={DRILL_X + 64} y="164" font-size="10" fill="#94a3b8">Bottom I0.2</text>
		<text x={DRILL_X - 46} y="100" text-anchor="end" font-size="10" fill="#94a3b8"
			>Lower Q0.2 {state.drill > 0 && state.drill < 1 ? '↕' : ''}</text
		>
		<text x={DRILL_X - 46} y="114" text-anchor="end" font-size="10" fill="#94a3b8"
			>Spindle Q0.3 {state.spindle ? '⟳' : ''}</text
		>
		{#if state.progress > 0 && state.progress < 1}
			<rect x={DRILL_X - 20} y="6" width={40 * state.progress} height="5" fill="#f59e0b" />
		{/if}

		<!-- stopper -->
		<rect
			x={px(1.2) + 2}
			y={BELT_Y - 30 * state.stopper}
			width="7"
			height={30 * state.stopper + 4}
			fill={state.stopper > 0.5 ? '#f472b6' : '#475569'}
		/>
		<text x={px(1.2) + 6} y={BELT_Y + 44} text-anchor="middle" font-size="10" fill="#94a3b8"
			>Stopper Q0.1</text
		>

		<!-- inspection + ejector -->
		<rect x={CHECK_X - 22} y="120" width="44" height="22" rx="3" fill="#1e293b" stroke="#475569" />
		<text x={CHECK_X} y="135" text-anchor="middle" font-size="9" fill="#94a3b8">camera</text>
		<circle cx={CHECK_X + 34} cy="131" r="5" fill={on(state.sensors.qualityOk)} stroke="#64748b" />
		<text x={CHECK_X + 44} y="135" font-size="10" fill="#94a3b8">OK I0.5</text>
		<rect
			x={CHECK_X - 18}
			y={BELT_Y + 30 - state.ejector * 70}
			width="36"
			height="12"
			fill={state.ejector > 0 ? '#f472b6' : '#475569'}
		/>
		<text x={CHECK_X} y={BELT_Y + 60} text-anchor="middle" font-size="10" fill="#94a3b8"
			>Ejector Q0.4</text
		>
		<rect x={CHECK_X - 30} y="62" width="60" height="30" fill="#1e293b" stroke="#475569" />
		<text x={CHECK_X} y="81" text-anchor="middle" font-size="10" fill="#fca5a5"
			>scrap {state.rejected}</text
		>

		<!-- belt -->
		<rect x={px(0) - 10} y={BELT_Y} width={px(3) - px(0) + 20} height="16" rx="8" fill="#334155" />
		<line
			x1={px(0)}
			x2={px(3)}
			y1={BELT_Y + 8}
			y2={BELT_Y + 8}
			stroke={state.belt ? '#34d399' : '#64748b'}
			stroke-dasharray="10 8"
			stroke-width="2"
			class={state.belt ? 'belt-moving' : ''}
		/>
		<text x={px(0)} y={BELT_Y + 44} font-size="10" fill="#94a3b8"
			>Belt Q0.0 {state.belt ? '▶' : '■'}</text
		>

		<!-- finished parts -->
		<rect x={px(3) + 14} y={BELT_Y - 30} width="52" height="56" fill="#1e293b" stroke="#475569" />
		<text x={px(3) + 40} y={BELT_Y - 4} text-anchor="middle" font-size="13" fill="#e2e8f0"
			>{state.good}</text
		>
		<text x={px(3) + 40} y={BELT_Y + 12} text-anchor="middle" font-size="9" fill="#94a3b8"
			>good</text
		>

		<!-- presence sensors (light barriers) -->
		{#each sensors as s (s.name)}
			<circle cx={s.x} cy={BELT_Y - 52} r="5" fill={on(s.on)} stroke="#64748b" />
			<line
				x1={s.x}
				x2={s.x}
				y1={BELT_Y - 46}
				y2={BELT_Y}
				stroke={on(s.on)}
				stroke-dasharray="2 3"
			/>
			<text x={s.x} y={BELT_Y - 62} text-anchor="middle" font-size="9" fill="#94a3b8">{s.name}</text
			>
		{/each}

		<!-- workpieces -->
		{#each state.parts as p (p.id)}
			{@const x = px(p.x) - PART_W}
			<g>
				<rect
					{x}
					y={BELT_Y - 26}
					width={PART_W}
					height="26"
					rx="2"
					fill={p.damaged ? '#7f1d1d' : '#94a3b8'}
					stroke="#0f172a"
				/>
				{#if p.drilled}
					<rect x={x + PART_W / 2 - 3} y={BELT_Y - 26} width="6" height="14" fill="#0f172a" />
				{/if}
				{#if p.cracked}
					<polyline
						points="{x + 4},{BELT_Y - 22} {x + 10},{BELT_Y - 14} {x + 7},{BELT_Y - 8} {x +
							13},{BELT_Y - 2}"
						fill="none"
						stroke="#b91c1c"
						stroke-width="1.5"
					/>
				{/if}
			</g>
		{/each}
	</svg>

	<div class="flex flex-wrap items-center justify-center gap-2 text-xs">
		<button
			class="rounded bg-slate-800 px-3 py-1 hover:bg-slate-700"
			onclick={() => command('spawn', { cracked: false })}>+ Part</button
		>
		<button
			class="rounded bg-slate-800 px-3 py-1 hover:bg-slate-700"
			onclick={() => command('spawn', { cracked: true })}>+ Cracked part</button
		>
		<label class="flex items-center gap-1.5 rounded bg-slate-800 px-3 py-1">
			<input
				type="checkbox"
				class="accent-emerald-500"
				checked={state.autoFeed}
				onchange={(e) => command('autoFeed', e.currentTarget.checked)}
			/>
			Auto feed
		</label>
		<button
			class="rounded bg-slate-800 px-3 py-1 hover:bg-slate-700"
			onclick={() => command('clear')}>Clear</button
		>
		<span class="ml-2 font-mono text-slate-400">
			good {state.good} · scrap {state.rejected}
			{#if mistakes}<span class="text-red-400">· mistakes {mistakes}</span>{/if}
		</span>
	</div>
	{#if state.lastFault}
		<p class="rounded bg-red-500/10 px-3 py-1 text-xs text-red-300" role="alert">
			⚠ {state.lastFault}
			{#if state.crashes}· crashes {state.crashes}{/if}
			{#if state.toolBreaks}· broken tools {state.toolBreaks}{/if}
			{#if state.wrongRejected}· good parts scrapped {state.wrongRejected}{/if}
			{#if state.badDelivered}· bad parts delivered {state.badDelivered}{/if}
		</p>
	{/if}
	{#if !online}<p class="text-xs text-slate-500">The plant runs while the PLC is in RUN.</p>{/if}
</div>

<style>
	.belt-moving {
		animation: belt 0.6s linear infinite;
	}
	@keyframes belt {
		to {
			stroke-dashoffset: -18;
		}
	}
	.spin {
		animation: flicker 0.15s steps(2) infinite;
	}
	@keyframes flicker {
		50% {
			opacity: 0.5;
		}
	}
</style>
