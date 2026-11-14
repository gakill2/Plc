<script lang="ts">
	import { wiring, type InputType, type SensorType } from './physics.js';

	let sensor = $state<SensorType>('PNP');
	let input = $state<InputType>('sink');
	let detects = $state(false);

	const r = $derived(wiring(sensor, input, detects));
	const RED = '#ef4444';
	const BLUE = '#3b82f6';
	const flow = '#34d399';
	/** common terminal 1M: 0 V for sink inputs, +24 V for source inputs */
	const commonColor = $derived(input === 'sink' ? BLUE : RED);
	const signalColor = $derived(r.wire === 24 ? RED : r.wire === 0 ? BLUE : '#64748b');

	const pill = (on: boolean) =>
		`rounded px-2.5 py-1 text-xs ${on ? 'bg-sky-500 text-slate-950 font-semibold' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`;
</script>

<figure class="space-y-3 rounded-lg border border-slate-700 bg-slate-950 p-4">
	<div class="flex flex-wrap items-center gap-4 text-xs">
		<div class="flex items-center gap-1" role="group" aria-label="Typ czujnika">
			<span class="mr-1 font-semibold tracking-wider text-sky-300 uppercase">Czujnik</span>
			{#each ['PNP', 'NPN'] as const as t (t)}
				<button class={pill(sensor === t)} aria-pressed={sensor === t} onclick={() => (sensor = t)}
					>{t}</button
				>
			{/each}
		</div>
		<div class="flex items-center gap-1" role="group" aria-label="Typ wejścia">
			<span class="mr-1 font-semibold tracking-wider text-sky-300 uppercase">Wejście PLC</span>
			{#each [['sink', 'sink (1M na 0 V)'], ['source', 'source (1M na +24 V)']] as const as [t, label] (t)}
				<button class={pill(input === t)} aria-pressed={input === t} onclick={() => (input = t)}
					>{label}</button
				>
			{/each}
		</div>
		<button
			class="rounded border px-2.5 py-1 {detects
				? 'border-amber-400 bg-amber-400/20 text-amber-200'
				: 'border-slate-600 text-slate-300'}"
			aria-pressed={detects}
			onclick={() => (detects = !detects)}
			>{detects ? '■ obiekt przed czujnikiem' : '□ brak obiektu'}</button
		>
	</div>

	<svg
		viewBox="0 0 640 250"
		class="w-full"
		role="img"
		aria-label="Schemat podłączenia czujnika {sensor} do wejścia {input}"
	>
		<!-- supply rails -->
		<line x1="20" x2="620" y1="24" y2="24" stroke={RED} stroke-width="3" />
		<text x="24" y="16" font-size="11" fill={RED}>L+ (+24 V)</text>
		<line x1="20" x2="620" y1="226" y2="226" stroke={BLUE} stroke-width="3" />
		<text x="24" y="244" font-size="11" fill={BLUE}>M (0 V)</text>

		<!-- sensor -->
		<rect x="70" y="80" width="120" height="90" rx="8" fill="#1e293b" stroke="#475569" />
		<text x="130" y="104" text-anchor="middle" font-size="13" font-weight="bold" fill="#e2e8f0"
			>czujnik {sensor}</text
		>
		<circle cx="170" cy="94" r="6" fill={detects ? '#f59e0b' : '#334155'} />
		<text x="130" y="124" text-anchor="middle" font-size="10" fill="#94a3b8"
			>{sensor === 'PNP' ? 'przełącza +24 V' : 'przełącza 0 V'}</text
		>
		<!-- transistor switch inside -->
		<line x1="100" x2="100" y1="136" y2="160" stroke="#94a3b8" stroke-width="2" />
		<line
			x1="100"
			y1="136"
			x2={detects ? 100 : 114}
			y2={detects ? 148 : 144}
			stroke="#e2e8f0"
			stroke-width="3"
			class="transition-all"
		/>
		<!-- brown (+24), blue (0 V) supply of the sensor -->
		<line x1="90" x2="90" y1="24" y2="80" stroke="#92400e" stroke-width="3" />
		<text x="76" y="62" font-size="9" fill="#d97706" text-anchor="end">BN</text>
		<line x1="160" x2="160" y1="170" y2="226" stroke={BLUE} stroke-width="3" />
		<text x="168" y="206" font-size="9" fill={BLUE}>BU</text>

		<!-- black signal wire → input I0.0 -->
		<path
			d="M190 130 H420"
			stroke={signalColor}
			stroke-width="3"
			fill="none"
			stroke-dasharray={r.wire === null ? '6 6' : undefined}
		/>
		<text x="300" y="122" text-anchor="middle" font-size="10" fill="#94a3b8"
			>BK — sygnał {r.wire === null ? '(niepodłączony, „wisi”)' : `= ${r.wire} V`}</text
		>
		{#if r.signal}
			{#each [0, 1, 2] as k (k)}
				<polygon
					points={sensor === 'PNP'
						? `${250 + k * 50},125 ${262 + k * 50},130 ${250 + k * 50},135`
						: `${262 + k * 50},125 ${250 + k * 50},130 ${262 + k * 50},135`}
					fill={flow}
				/>
			{/each}
		{/if}

		<!-- input module -->
		<rect x="420" y="70" width="170" height="120" rx="6" fill="#0f172a" stroke="#475569" />
		<text x="505" y="90" text-anchor="middle" font-size="12" font-weight="bold" fill="#e2e8f0"
			>moduł wejść PLC</text
		>
		<circle cx="434" cy="130" r="5" fill="#cbd5e1" />
		<text x="444" y="134" font-size="11" fill="#e2e8f0">I0.0</text>
		<!-- optocoupler LED -->
		<polygon points="490,122 490,138 504,130" fill={r.signal ? '#34d399' : '#334155'} />
		<line
			x1="504"
			x2="504"
			y1="122"
			y2="138"
			stroke={r.signal ? '#34d399' : '#475569'}
			stroke-width="2"
		/>
		<line x1="439" x2="490" y1="130" y2="130" stroke="#64748b" stroke-width="2" />
		<line x1="504" x2="540" y1="130" y2="130" stroke="#64748b" stroke-width="2" />
		<line x1="540" x2="540" y1="130" y2="170" stroke="#64748b" stroke-width="2" />
		<circle cx="540" cy="174" r="5" fill="#cbd5e1" />
		<text x="552" y="178" font-size="11" fill="#e2e8f0">1M</text>
		<text x="505" y="112" text-anchor="middle" font-size="9" fill="#94a3b8">transoptor</text>
		<!-- common terminal wire -->
		<line
			x1="540"
			x2="540"
			y1="179"
			y2={input === 'sink' ? 226 : 24}
			stroke={commonColor}
			stroke-width="3"
			class={input === 'source' ? 'hidden' : ''}
		/>
		{#if input === 'source'}
			<path d="M540 179 V200 H600 V24" stroke={RED} stroke-width="3" fill="none" />
		{/if}

		<!-- PLC sees -->
		<rect x="560" y="76" width="70" height="26" rx="4" fill={r.signal ? '#065f46' : '#1e293b'} />
		<text x="595" y="94" text-anchor="middle" font-size="12" font-family="monospace" fill="#e2e8f0"
			>I0.0 = {r.signal ? 1 : 0}</text
		>
	</svg>

	<figcaption
		class="rounded px-3 py-2 text-sm {detects && !r.compatible
			? 'bg-red-500/10 text-red-200'
			: r.signal
				? 'bg-emerald-500/10 text-emerald-200'
				: 'bg-slate-800/60 text-slate-300'}"
		role="status"
	>
		{r.explanation}
	</figcaption>
</figure>
