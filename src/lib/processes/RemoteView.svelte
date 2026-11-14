<script lang="ts">
	import type { RemoteState } from './types.js';

	type Props = {
		state: RemoteState;
		command: (name: string, value?: unknown) => void;
		online: boolean;
	};
	let { state, command, online }: Props = $props();
	const stale = $derived(state.plcHeartbeat !== state.heartbeat);
</script>

<div class="flex h-full flex-col items-center justify-center gap-6 p-6" lang="pl">
	<svg viewBox="0 0 680 220" class="w-full max-w-3xl" role="img" aria-label="Zdalna stacja I/O">
		<!-- PLC -->
		<rect
			x="20"
			y="60"
			width="150"
			height="100"
			rx="8"
			fill="#1e293b"
			stroke="#64748b"
			stroke-width="2"
		/>
		<text x="95" y="90" text-anchor="middle" font-size="14" font-weight="bold" fill="#e2e8f0"
			>PLC</text
		>
		<text x="95" y="112" text-anchor="middle" font-size="10" fill="#94a3b8">IO controller</text>
		<text x="95" y="134" text-anchor="middle" font-size="11" fill={stale ? '#fca5a5' : '#7dd3fc'}
			>IW6 = {state.plcHeartbeat}</text
		>

		<!-- cable -->
		<line
			x1="170"
			y1="110"
			x2={state.link ? 470 : 300}
			y2="110"
			stroke="#22c55e"
			stroke-width="4"
			stroke-dasharray={state.link ? '0' : '0'}
		/>
		{#if state.link}
			<circle r="5" fill="#bbf7d0">
				<animate attributeName="cx" from="175" to="465" dur="0.6s" repeatCount="indefinite" />
				<animate attributeName="cy" from="110" to="110" dur="0.6s" repeatCount="indefinite" />
			</circle>
		{:else}
			<line x1="340" y1="110" x2="470" y2="110" stroke="#22c55e" stroke-width="4" />
			<text x="320" y="96" text-anchor="middle" font-size="18" fill="#f87171">✂</text>
		{/if}
		<text x="320" y="140" text-anchor="middle" font-size="10" fill="#94a3b8"
			>Profinet / Modbus TCP · cykl 20 ms · telegramów: {state.telegrams}</text
		>

		<!-- remote station -->
		<rect
			x="470"
			y="40"
			width="190"
			height="140"
			rx="8"
			fill="#1e293b"
			stroke={state.stationTripped ? '#f87171' : '#64748b'}
			stroke-width="2"
		/>
		<text x="565" y="66" text-anchor="middle" font-size="13" font-weight="bold" fill="#e2e8f0"
			>Stacja zdalna</text
		>
		<text x="565" y="84" text-anchor="middle" font-size="10" fill="#94a3b8"
			>IO device · pompownia</text
		>
		<circle
			cx="525"
			cy="125"
			r="24"
			fill="#0f172a"
			stroke={state.pumpRunning ? '#34d399' : state.pumpFault ? '#f87171' : '#64748b'}
			stroke-width="3"
		/>
		<text x="525" y="130" text-anchor="middle" font-size="13" font-weight="bold" fill="#e2e8f0"
			>P</text
		>
		<text
			x="600"
			y="118"
			text-anchor="middle"
			font-size="10"
			fill={state.pumpRunning ? '#6ee7b7' : '#94a3b8'}
			>{state.pumpRunning ? 'pracuje' : 'stoi'}</text
		>
		<text x="600" y="134" text-anchor="middle" font-size="10" fill="#7dd3fc"
			>licznik {state.heartbeat}</text
		>
		{#if state.stationTripped}
			<text x="600" y="152" text-anchor="middle" font-size="9" fill="#fca5a5"
				>watchdog: wyjścia OFF</text
			>
		{/if}
	</svg>

	<div class="flex flex-wrap items-center gap-3 text-xs">
		<button
			class="rounded-md border px-3 py-1.5 {state.link
				? 'border-red-500/60 text-red-200 hover:bg-red-500/10'
				: 'border-emerald-500/60 text-emerald-200 hover:bg-emerald-500/10'}"
			onclick={() => command('link', !state.link)}
			>{state.link ? '✂ Przerwij kabel' : 'Podłącz kabel'}</button
		>
		<button
			class="rounded-md border border-slate-700 px-3 py-1.5 hover:border-slate-500 disabled:opacity-50"
			disabled={!online}
			onclick={() => command('fault')}>Awaria pompy</button
		>
		<span class="text-slate-400">
			RunCmd (Q2.0) dotarł do stacji: <b class="text-white">{state.runCmd ? '1' : '0'}</b>
		</span>
	</div>
	{#if stale}
		<p class="max-w-xl rounded bg-amber-500/10 px-3 py-1.5 text-center text-xs text-amber-200">
			Sterownik widzi stare dane: licznik w PLC stoi na {state.plcHeartbeat}, a w stacji jest już
			{state.heartbeat}. Bity statusu w obrazie procesu też są „zamrożone”.
		</p>
	{/if}
</div>
