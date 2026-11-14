<script lang="ts">
	import type { MixerState } from './types.js';

	type Props = {
		state: MixerState;
		command: (name: string, value?: unknown) => void;
		online: boolean;
	};
	let { state, command, online }: Props = $props();

	const TOP = 70;
	const H = 200;
	/** 0 % is the bottom of the dished end, 100 % the top of the shell */
	const levelY = $derived(TOP + (H + 30) * (1 - Math.min(100, state.level) / 100));
	/** liquid colour: A is blue, B yellow — the mix turns green */
	const liquid = $derived(
		`hsl(${Math.round(55 + state.ratioA * 150)} 80% ${45 + Math.min(15, (state.temp - 20) / 3)}%)`
	);
	const flow = (on: boolean) => (on ? '#38bdf8' : '#334155');
</script>

<div class="flex h-full flex-wrap items-center justify-center gap-10 p-8" lang="pl">
	<svg
		viewBox="0 0 420 340"
		class="h-80 max-w-full"
		role="img"
		aria-label="Mieszalnik {state.level.toFixed(0)} %"
	>
		<!-- inlets -->
		{#each [{ x: 130, on: state.valveA, n: 'A · Q0.0', c: '#60a5fa', dx: -62 }, { x: 250, on: state.valveB, n: 'B · Q0.1', c: '#facc15', dx: 14 }] as v (v.n)}
			<path d="M{v.x} 10 V{TOP}" stroke={v.on ? v.c : '#334155'} stroke-width="8" />
			<polygon
				points="{v.x - 10},34 {v.x + 10},34 {v.x - 10},50 {v.x + 10},50"
				fill={v.on ? '#34d399' : '#475569'}
			/>
			<text x={v.x + v.dx} y="46" font-size="10" fill="#cbd5e1">{v.n}</text>
			{#if v.on}
				<line
					x1={v.x}
					x2={v.x}
					y1={TOP}
					y2={levelY}
					stroke={v.c}
					stroke-width="3"
					stroke-dasharray="4 6"
					opacity="0.8"
				>
					<animate
						attributeName="stroke-dashoffset"
						from="20"
						to="0"
						dur="0.4s"
						repeatCount="indefinite"
					/>
				</line>
			{/if}
		{/each}

		<!-- vessel -->
		<path
			d="M100 {TOP} V{TOP + H} Q100 {TOP + H + 30} 190 {TOP + H + 30} Q280 {TOP + H + 30} 280 {TOP +
				H} V{TOP}"
			fill="#0f172a"
			stroke="#64748b"
			stroke-width="3"
		/>
		<clipPath id="mx-vessel">
			<path
				d="M101.5 {TOP} V{TOP + H} Q101.5 {TOP + H + 28.5} 190 {TOP + H + 28.5} Q278.5 {TOP +
					H +
					28.5} 278.5 {TOP + H} V{TOP}"
			/>
		</clipPath>
		{#if state.level > 0.2}
			<rect
				x="100"
				y={levelY}
				width="180"
				height={TOP + H + 40 - levelY}
				fill={liquid}
				opacity="0.7"
				clip-path="url(#mx-vessel)"
			/>
		{/if}

		<!-- stirrer -->
		<line x1="190" x2="190" y1="56" y2={TOP + H} stroke="#94a3b8" stroke-width="4" />
		<g transform="translate(190 {TOP + H - 10})">
			<g>
				<rect x="-34" y="-5" width="68" height="10" rx="3" fill="#cbd5e1" />
				{#if state.stirrer}
					<animateTransform
						attributeName="transform"
						type="scale"
						values="1 1;0.1 1;-1 1;0.1 1;1 1"
						dur="0.5s"
						repeatCount="indefinite"
					/>
				{/if}
			</g>
		</g>
		<rect
			x="172"
			y="42"
			width="36"
			height="16"
			rx="3"
			fill="#1e293b"
			stroke={state.stirrer ? '#34d399' : '#64748b'}
			stroke-width="2"
		/>
		<text x="190" y="54" text-anchor="middle" font-size="9" fill="#e2e8f0">M</text>
		<text x="214" y="64" font-size="9" fill="#94a3b8">Q0.2</text>

		<!-- heater coil -->
		<path
			d="M120 {TOP + H + 6} h20 l6 -8 l6 8 l6 -8 l6 8 l6 -8 l6 8 h20"
			fill="none"
			stroke={state.heater ? '#f97316' : '#475569'}
			stroke-width="3"
		/>
		<text x="104" y={TOP + H + 46} font-size="9" fill="#94a3b8">grzałka Q0.3</text>

		<!-- transmitters -->
		<rect x="290" y={TOP + 20} width="44" height="22" rx="3" fill="#1e293b" stroke="#64748b" />
		<text x="312" y={TOP + 35} text-anchor="middle" font-size="9" fill="#e2e8f0">LT</text>
		<text x="340" y={TOP + 35} font-size="11" font-family="monospace" fill="#7dd3fc"
			>{state.level.toFixed(1)} %</text
		>
		<rect x="290" y={TOP + 60} width="44" height="22" rx="3" fill="#1e293b" stroke="#64748b" />
		<text x="312" y={TOP + 75} text-anchor="middle" font-size="9" fill="#e2e8f0">TT</text>
		<text x="340" y={TOP + 75} font-size="11" font-family="monospace" fill="#fdba74"
			>{state.temp.toFixed(1)} °C</text
		>
		<line x1="280" x2="290" y1={TOP + 10} y2={TOP + 10} stroke="#64748b" stroke-width="2" />
		<circle cx="296" cy={TOP + 10} r="5" fill={state.level < 95 ? '#34d399' : '#f87171'} />
		<text x="306" y={TOP + 13} font-size="9" fill="#94a3b8">LSHH 95 %</text>

		<!-- outlet -->
		<path
			d="M190 {TOP + H + 30} V318 H400"
			fill="none"
			stroke={flow(state.outlet && state.level > 0.5)}
			stroke-width="8"
		/>
		<polygon points="240,308 240,328 256,308 256,328" fill={state.outlet ? '#34d399' : '#475569'} />
		<text x="262" y="336" font-size="9" fill="#94a3b8">wylot Q0.4</text>

		{#if state.lastFault}
			<text x="190" y="24" text-anchor="middle" font-size="11" fill="#f87171" dx="0"
				>{state.lastFault}</text
			>
		{/if}
	</svg>

	<div class="w-60 space-y-3 text-xs text-slate-300">
		<dl class="grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-[11px] text-slate-400">
			<dt>partie dobre</dt>
			<dd class="text-emerald-300">{state.good}</dd>
			<dt>partie złe</dt>
			<dd class={state.bad ? 'text-red-300' : ''}>{state.bad}</dd>
			<dt>A : B</dt>
			<dd>{Math.round(state.ratioA * 100)} : {100 - Math.round(state.ratioA * 100)}</dd>
			<dt>przelania</dt>
			<dd class={state.overflows ? 'text-red-300' : ''}>{state.overflows}</dd>
		</dl>
		{#if state.lastBatch}
			<p class={state.lastBatch.startsWith('Partia dobra') ? 'text-emerald-300' : 'text-amber-300'}>
				{state.lastBatch}
			</p>
		{/if}
		<p class="text-slate-500">
			Partia dobra: A : B ≈ 1 : 1, 50 °C, ≥ 5 s mieszania, grzałka nigdy poniżej 15 %.
		</p>
		<div class="flex gap-2">
			<button
				class="rounded bg-slate-800 px-2 py-0.5 hover:bg-slate-700"
				onclick={() => command('empty')}>Opróżnij</button
			>
			<button
				class="rounded bg-slate-800 px-2 py-0.5 hover:bg-slate-700"
				onclick={() => command('clear')}>Zeruj liczniki</button
			>
		</div>
		{#if !online}<p class="text-slate-500">Obiekt działa, gdy PLC jest w RUN.</p>{/if}
	</div>
</div>
