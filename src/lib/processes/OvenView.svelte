<script lang="ts">
	import type { OvenState } from './types.js';

	type Props = {
		state: OvenState;
		command: (name: string, value?: unknown) => void;
		online: boolean;
	};
	let { state, command, online }: Props = $props();

	/** 0 … 300 °C mapped onto the thermometer */
	const ty = (t: number) => 290 - Math.min(1, Math.max(0, t / 300)) * 240;
	const glow = $derived(Math.min(1, state.temp / 280));
</script>

<div class="flex h-full flex-wrap items-center justify-center gap-10 p-8">
	<svg
		viewBox="0 0 420 330"
		class="h-80 max-w-full"
		role="img"
		aria-label="Oven at {state.temp.toFixed(1)} °C"
	>
		<!-- oven body -->
		<rect
			x="30"
			y="40"
			width="240"
			height="250"
			rx="10"
			fill="#1e293b"
			stroke="#64748b"
			stroke-width="3"
		/>
		<rect
			x="50"
			y="60"
			width="200"
			height="170"
			rx="6"
			fill="rgb({Math.round(40 + 200 * glow)}, {Math.round(40 + 60 * glow)}, 40)"
			opacity="0.85"
		/>
		<!-- heating elements -->
		{#each [90, 130, 170, 210] as y (y)}
			<path
				d="M60 {y} q15 -8 30 0 t30 0 t30 0 t30 0 t30 0 t30 0"
				fill="none"
				stroke={state.power > 0.01 ? `rgba(251, 146, 60, ${0.4 + state.power * 0.6})` : '#475569'}
				stroke-width="4"
			/>
		{/each}
		<!-- door -->
		{#if !state.doorClosed}
			<rect x="268" y="60" width="16" height="170" fill="#334155" stroke="#94a3b8" />
			<text x="150" y="150" text-anchor="middle" font-size="16" font-weight="bold" fill="#fde68a"
				>DRZWI OTWARTE</text
			>
		{/if}
		<text x="150" y="265" text-anchor="middle" font-size="26" font-weight="bold" fill="#f8fafc"
			>{state.temp.toFixed(1)} °C</text
		>
		<text x="150" y="30" text-anchor="middle" font-size="11" fill="#94a3b8"
			>moc {(state.power * 100).toFixed(0)} % (zadana {(state.demand * 100).toFixed(0)} %) · grzałki Q0.0
			{state.heater ? 'ZAŁ' : 'WYŁ'}</text
		>

		<!-- thermometer -->
		<rect
			x="330"
			y="40"
			width="24"
			height="260"
			rx="12"
			fill="#0f172a"
			stroke="#64748b"
			stroke-width="2"
		/>
		<rect
			x="336"
			y={ty(state.temp)}
			width="12"
			height={296 - ty(state.temp)}
			rx="6"
			fill="#f97316"
		/>
		{#each [0, 100, 200, 300] as t (t)}
			<line x1="356" x2="364" y1={ty(t)} y2={ty(t)} stroke="#64748b" />
			<text x="368" y={ty(t) + 4} font-size="10" fill="#94a3b8">{t}</text>
		{/each}
		<line
			x1="326"
			x2="358"
			y1={ty(state.maxTemp)}
			y2={ty(state.maxTemp)}
			stroke="#f43f5e"
			stroke-dasharray="3 2"
		/>
		<text x="300" y={ty(state.maxTemp) + 4} font-size="9" fill="#fda4af" text-anchor="end">max</text
		>
	</svg>

	<div class="w-60 space-y-3 text-sm">
		<div class="space-y-1 font-mono text-xs">
			<p class={state.doorClosed ? 'text-emerald-300' : 'text-amber-300'}>
				I0.0 DoorClosed = {state.doorClosed ? 1 : 0}
			</p>
			<p class={state.overTemp ? 'text-red-300' : 'text-slate-400'}>
				I0.1 OverTemp = {state.overTemp ? 1 : 0}
			</p>
			<p class="text-sky-300">IW4 Temperature = {Math.round(state.temp * 10)}</p>
			<p class="text-amber-300">QW4 HeaterPower = {Math.round(state.demand * 27648)}</p>
		</div>
		<div class="flex flex-wrap gap-2">
			<button
				class="rounded-md border border-slate-700 px-3 py-1.5 text-xs hover:border-slate-500"
				onclick={() => command('door', state.doorClosed)}
				>{state.doorClosed ? 'Otwórz drzwi' : 'Zamknij drzwi'}</button
			>
			<button
				class="rounded-md border border-slate-700 px-3 py-1.5 text-xs hover:border-slate-500 disabled:opacity-50"
				disabled={!online}
				onclick={() => command('load')}>Włóż zimny wsad</button
			>
		</div>
		<p class="text-xs text-slate-500">
			Proces pierwszego rzędu z opóźnieniem: stała czasowa 25 s, martwy czas 1,5 s, przy 100 % mocy
			ustaliłoby się ok. 300 °C. Termostat bezpieczeństwa odcina grzanie powyżej 280 °C.
		</p>
	</div>
</div>
