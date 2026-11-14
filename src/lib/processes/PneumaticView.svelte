<script lang="ts">
	import type { PneumaticState } from './types.js';

	type Props = {
		state: PneumaticState;
		command: (name: string, value?: unknown) => void;
		online: boolean;
	};
	let { state, command, online }: Props = $props();

	const AIR = '#38bdf8';
	const OFF = '#334155';
	const on = (v: boolean) => (v ? '#34d399' : '#334155');
	/** clamp A moves horizontally: the piston inside the barrel, the jaw reaches the part */
	const piston = $derived(28 + state.a * 62);
	const jaw = $derived(116 + state.a * 172);
	/** press B moves down: from y=40 by up to 120 px */
	const by = $derived(40 + state.b * 118);
	const partColor = $derived(
		!state.part ? null : state.part.damaged ? '#f87171' : state.part.pressed ? '#a3e635' : '#fbbf24'
	);
</script>

<div class="flex h-full flex-wrap items-center justify-center gap-10 p-8" lang="pl">
	<svg viewBox="0 0 480 330" class="h-80 max-w-full" role="img" aria-label="Prasa pneumatyczna">
		<defs>
			<linearGradient id="pn-steel" x1="0" x2="0" y1="0" y2="1">
				<stop offset="0" stop-color="#94a3b8" />
				<stop offset="1" stop-color="#475569" />
			</linearGradient>
		</defs>

		<!-- frame and table -->
		<rect x="40" y="200" width="380" height="16" rx="2" fill="#1e293b" stroke="#475569" />
		<rect x="250" y="20" width="16" height="180" fill="#1e293b" stroke="#475569" />
		<rect x="250" y="20" width="150" height="14" fill="#1e293b" stroke="#475569" />

		<!-- part in the fixture -->
		{#if partColor}
			<rect
				x="296"
				y={state.part?.pressed ? 186 : 172}
				width="60"
				height={state.part?.pressed ? 14 : 28}
				rx="3"
				fill={partColor}
				style="transition: all 120ms"
			/>
		{/if}
		<rect x="360" y="170" width="10" height="30" fill="#475569" />

		<!-- cylinder A (clamp, horizontal) -->
		<rect
			x="20"
			y="168"
			width="80"
			height="26"
			rx="4"
			fill="#0f172a"
			stroke="#64748b"
			stroke-width="2"
		/>
		<rect x={piston} y="172" width="8" height="18" fill="url(#pn-steel)" />
		<rect x={piston + 8} y="178" width={jaw - piston - 8} height="6" fill="url(#pn-steel)" />
		<rect x={jaw} y="168" width="8" height="28" rx="1" fill="#94a3b8" />
		<text x="60" y="160" text-anchor="middle" font-size="11" fill="#cbd5e1">A — docisk</text>
		<!-- reed switches of A -->
		{#each [{ x: 32, s: state.sensors.aIn, n: '1B1' }, { x: 88, s: state.sensors.aOut, n: '1B2' }] as r (r.n)}
			<rect x={r.x - 6} y="196" width="12" height="7" rx="2" fill={on(r.s)} />
			<text x={r.x} y="226" text-anchor="middle" font-size="9" fill="#94a3b8">{r.n}</text>
		{/each}

		<!-- cylinder B (press, vertical) -->
		<rect
			x="306"
			y="34"
			width="40"
			height="80"
			rx="4"
			fill="#0f172a"
			stroke="#64748b"
			stroke-width="2"
		/>
		<rect x="314" y={34 + state.b * 64} width="24" height="8" fill="url(#pn-steel)" />
		<rect
			x="322"
			y={42 + state.b * 64}
			width="8"
			height={by - 42 - state.b * 64 + 10}
			fill="url(#pn-steel)"
		/>
		<rect x="306" y={by + 6} width="40" height="10" rx="2" fill="#94a3b8" />
		<text x="400" y="62" font-size="11" fill="#cbd5e1">B — prasa</text>
		{#each [{ y: 44, s: state.sensors.bIn, n: '2B1' }, { y: 100, s: state.sensors.bOut, n: '2B2' }] as r (r.n)}
			<rect x="348" y={r.y - 6} width="7" height="12" rx="2" fill={on(r.s)} />
			<text x="360" y={r.y + 4} font-size="9" fill="#94a3b8">{r.n}</text>
		{/each}

		<!-- valves and air -->
		{#each [{ x: 60, y: 260, cmd: state.aCmd, n: '1Y1 Q0.0', to: 'M60 248 V194' }, { x: 326, y: 260, cmd: state.bCmd, n: '2Y1 Q0.1', to: 'M326 248 V230 H285 V40 H306' }] as v (v.n)}
			<path d={v.to} fill="none" stroke={state.sensors.air && v.cmd ? AIR : OFF} stroke-width="3" />
			<rect
				x={v.x - 26}
				y={v.y - 12}
				width="52"
				height="24"
				rx="3"
				fill="#0f172a"
				stroke={v.cmd ? '#34d399' : '#64748b'}
				stroke-width="2"
			/>
			<text x={v.x} y={v.y + 4} text-anchor="middle" font-size="9" fill="#e2e8f0">5/2</text>
			<text x={v.x} y={v.y + 26} text-anchor="middle" font-size="9" fill="#94a3b8">{v.n}</text>
		{/each}
		<path
			d="M86 260 H300"
			fill="none"
			stroke={state.sensors.air ? AIR : '#7f1d1d'}
			stroke-width="3"
			stroke-dasharray={state.sensors.air ? '' : '6 4'}
		/>
		<circle
			cx="190"
			cy="260"
			r="11"
			fill="#0f172a"
			stroke={state.sensors.air ? '#34d399' : '#f87171'}
			stroke-width="2"
		/>
		<text x="190" y="264" text-anchor="middle" font-size="8" fill="#e2e8f0">P</text>
		<text x="190" y="290" text-anchor="middle" font-size="9" fill="#94a3b8"
			>{state.sensors.air ? 'powietrze 6 bar' : 'BRAK POWIETRZA'}</text
		>

		{#if state.lastFault}
			<text x="240" y="318" text-anchor="middle" font-size="11" fill="#f87171"
				>{state.lastFault}</text
			>
		{/if}
	</svg>

	<div class="w-56 space-y-3 text-xs text-slate-300">
		<dl class="grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-[11px] text-slate-400">
			<dt>dobre detale</dt>
			<dd class="text-emerald-300">{state.good}</dd>
			<dt>złom</dt>
			<dd class={state.scrap ? 'text-red-300' : ''}>{state.scrap}</dd>
			<dt>skoki prasy</dt>
			<dd>{state.strokes}</dd>
			<dt>puste skoki</dt>
			<dd>{state.emptyStrokes}</dd>
		</dl>
		<label class="flex items-center gap-2">
			<input
				type="checkbox"
				class="accent-sky-500"
				checked={state.autoFeed}
				onchange={(e) => command('autoFeed', e.currentTarget.checked)}
			/>
			Detale podawane same
		</label>
		<button
			class="rounded bg-slate-800 px-2 py-0.5 hover:bg-slate-700"
			onclick={() => command('part')}>Połóż detal</button
		>
		<button
			class="rounded bg-slate-800 px-2 py-0.5 hover:bg-slate-700"
			onclick={() => command('clear')}>Zeruj liczniki</button
		>
		{#if !online}<p class="text-slate-500">Obiekt działa, gdy PLC jest w RUN.</p>{/if}
	</div>
</div>
