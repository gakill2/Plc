<script lang="ts">
	import {
		closedLoop,
		performance,
		PLANT_NAMES,
		simc,
		stepResponse,
		type Plant,
		type PlantKind
	} from './control.js';

	const W = 560;
	const H = 180;

	/* ---------- explore ---------- */
	let plant = $state<Plant>({ kind: 'first', k: 2, t: 8, delay: 2, zeta: 0.3 });
	const span = 60;
	const curve = $derived(stepResponse(plant, span, 0.1));
	const yMax = $derived(Math.max(1.2, ...curve.map((s) => s.y)) * 1.1);

	const path = (pts: { t: number; y: number }[], tMax: number, max: number, min = 0) =>
		pts
			.map(
				(s, i) =>
					`${i ? 'L' : 'M'}${((s.t / tMax) * W).toFixed(1)} ${(H - 10 - ((s.y - min) / (max - min)) * (H - 20)).toFixed(1)}`
			)
			.join(' ');
	const yPx = (y: number, max: number) => H - 10 - (y / max) * (H - 20);

	/* ---------- identify and tune ---------- */
	const rnd = (a: number, b: number) => Math.round((a + Math.random() * (b - a)) * 2) / 2;
	let hidden = $state<Plant>({ kind: 'first', k: 1.5, t: 12, delay: 3, zeta: 1 });
	let guess = $state({ k: '', t: '', delay: '' });
	let checked = $state(false);
	const hiddenCurve = $derived(stepResponse(hidden, 80, 0.1));
	const close = (v: string, real: number) => {
		const n = Number(v.replace(',', '.'));
		return Number.isFinite(n) && Math.abs(n - real) <= Math.max(0.5, real * 0.15);
	};
	const allOk = $derived(
		close(guess.k, hidden.k) && close(guess.t, hidden.t) && close(guess.delay, hidden.delay)
	);
	const tuned = $derived(
		allOk
			? simc(
					Number(guess.k.replace(',', '.')),
					Number(guess.t.replace(',', '.')),
					Number(guess.delay.replace(',', '.'))
				)
			: null
	);
	let kp = $state(1);
	let ti = $state(10);
	const loop = $derived(closedLoop(hidden, kp, ti, 80, 0.1));
	const perf = $derived(performance(loop));

	function newPlant() {
		hidden = { kind: 'first', k: rnd(0.8, 3), t: rnd(5, 20), delay: rnd(1, 5), zeta: 1 };
		guess = { k: '', t: '', delay: '' };
		checked = false;
	}
</script>

<figure class="space-y-4 rounded-xl border border-slate-800 bg-slate-900/60 p-4 text-xs" lang="pl">
	<figcaption class="text-sm font-semibold text-white">Laboratorium odpowiedzi skokowej</figcaption>

	<!-- explore -->
	<div class="grid gap-3 md:grid-cols-[14rem_1fr]">
		<div class="space-y-2">
			<label class="block text-slate-400"
				>Obiekt
				<select
					class="mt-0.5 w-full rounded border border-slate-700 bg-slate-900 px-1 py-0.5"
					bind:value={plant.kind}
					aria-label="Typ obiektu"
				>
					{#each Object.entries(PLANT_NAMES) as [k, name] (k)}<option value={k as PlantKind}
							>{name}</option
						>{/each}
				</select></label
			>
			<label class="block text-slate-400"
				>Wzmocnienie K = <b class="text-white">{plant.k}</b>
				<input
					class="w-full"
					type="range"
					min="0.5"
					max="3"
					step="0.1"
					bind:value={plant.k}
				/></label
			>
			{#if plant.kind !== 'integrating'}
				<label class="block text-slate-400"
					>Stała czasowa T = <b class="text-white">{plant.t} s</b>
					<input
						class="w-full"
						type="range"
						min="1"
						max="20"
						step="0.5"
						bind:value={plant.t}
					/></label
				>
			{/if}
			<label class="block text-slate-400"
				>Opóźnienie τ = <b class="text-white">{plant.delay} s</b>
				<input
					class="w-full"
					type="range"
					min="0"
					max="10"
					step="0.5"
					bind:value={plant.delay}
				/></label
			>
			{#if plant.kind === 'second'}
				<label class="block text-slate-400"
					>Tłumienie ζ = <b class="text-white">{plant.zeta}</b>
					<input
						class="w-full"
						type="range"
						min="0.05"
						max="1.5"
						step="0.05"
						bind:value={plant.zeta}
					/></label
				>
			{/if}
		</div>
		<svg
			viewBox="0 0 {W} {H}"
			class="w-full rounded bg-slate-950"
			role="img"
			aria-label="Odpowiedź skokowa"
		>
			<line
				x1="0"
				x2={W}
				y1={yPx(1, yMax)}
				y2={yPx(1, yMax)}
				stroke="#334155"
				stroke-dasharray="3 3"
			/>
			<text x="4" y={yPx(1, yMax) - 3} font-size="9" fill="#64748b">wejście: skok 0 → 1</text>
			{#if plant.kind === 'first'}
				<line
					x1="0"
					x2={W}
					y1={yPx(plant.k * 0.632, yMax)}
					y2={yPx(plant.k * 0.632, yMax)}
					stroke="#f59e0b"
					stroke-dasharray="2 4"
				/>
				<text
					x={W - 4}
					y={yPx(plant.k * 0.632, yMax) - 3}
					font-size="9"
					fill="#f59e0b"
					text-anchor="end">63 % — po czasie τ + T</text
				>
				<line
					x1={((plant.delay + plant.t) / span) * W}
					x2={((plant.delay + plant.t) / span) * W}
					y1="10"
					y2={H - 10}
					stroke="#f59e0b"
					stroke-dasharray="2 4"
				/>
			{/if}
			<path d={path(curve, span, yMax)} fill="none" stroke="#34d399" stroke-width="2" />
			<text x={W - 4} y={H - 2} font-size="9" fill="#64748b" text-anchor="end">{span} s</text>
		</svg>
	</div>

	<!-- identify -->
	<div class="space-y-2 border-t border-slate-800 pt-3">
		<p class="text-sm font-semibold text-white">
			Zadanie: odczytaj K, T i τ nieznanego obiektu, potem go wyreguluj
		</p>
		<div class="grid gap-3 md:grid-cols-[1fr_14rem]">
			<svg
				viewBox="0 0 {W} {H}"
				class="w-full rounded bg-slate-950"
				role="img"
				aria-label="Odpowiedź nieznanego obiektu"
			>
				{#each [0, 10, 20, 30, 40, 50, 60, 70, 80] as s (s)}
					<line x1={(s / 80) * W} x2={(s / 80) * W} y1="10" y2={H - 10} stroke="#1e293b" />
					<text x={(s / 80) * W + 2} y={H - 1} font-size="8" fill="#64748b">{s} s</text>
				{/each}
				{#each [0.5, 1, 1.5, 2, 2.5, 3] as v (v)}
					<line x1="0" x2={W} y1={yPx(v, 3.5)} y2={yPx(v, 3.5)} stroke="#1e293b" />
					<text x="2" y={yPx(v, 3.5) - 2} font-size="8" fill="#64748b">{v}</text>
				{/each}
				<path d={path(hiddenCurve, 80, 3.5)} fill="none" stroke="#38bdf8" stroke-width="2" />
				{#if tuned}
					<path d={path(loop, 80, 3.5)} fill="none" stroke="#34d399" stroke-width="2" />
					<line
						x1="0"
						x2={W}
						y1={yPx(1, 3.5)}
						y2={yPx(1, 3.5)}
						stroke="#34d399"
						stroke-dasharray="3 3"
					/>
				{/if}
			</svg>
			<div class="space-y-1.5">
				<p class="text-slate-400">Skok wejścia 0 → 1 w chwili 0. Odczytaj z wykresu:</p>
				{#each [['k', 'K (wartość końcowa)'], ['delay', 'τ — opóźnienie, s'], ['t', 'T — od końca opóźnienia do 63 %, s']] as [key, label] (key)}
					<label class="flex items-center justify-between gap-2 text-slate-300"
						>{label}
						<input
							class="w-16 rounded border bg-slate-900 px-1.5 py-0.5 font-mono {checked
								? close(guess[key as 'k'], hidden[key as 'k'])
									? 'border-emerald-500'
									: 'border-red-500'
								: 'border-slate-700'}"
							bind:value={guess[key as 'k']}
							aria-label={label}
						/></label
					>
				{/each}
				<div class="flex gap-2">
					<button
						class="rounded bg-sky-500 px-2 py-1 font-semibold text-slate-950"
						onclick={() => {
							checked = true;
							if (allOk && tuned) {
								kp = +tuned.kp.toFixed(2);
								ti = +tuned.ti.toFixed(1);
							}
						}}>Sprawdź</button
					>
					<button
						class="rounded border border-slate-700 px-2 py-1 text-slate-300"
						onclick={newPlant}>Nowy obiekt</button
					>
				</div>
				{#if checked && !allOk}
					<p class="text-red-300" role="status">
						Jeszcze nie — tolerancja ±15 %. Wskazówka: T mierz od końca opóźnienia.
					</p>
				{/if}
				{#if checked && tuned}
					<div
						class="space-y-1 rounded border border-emerald-500/40 bg-emerald-500/10 p-2"
						role="status"
					>
						<p class="text-emerald-200">
							Dobrze! Reguła SIMC: Kp = T / (K · 2τ) = <b>{tuned.kp.toFixed(2)}</b>, Ti = min(T, 8τ)
							= <b>{tuned.ti.toFixed(1)} s</b>.
						</p>
						<label class="block text-slate-300"
							>Kp = {kp}<input
								class="w-full"
								type="range"
								min="0.1"
								max="5"
								step="0.05"
								bind:value={kp}
							/></label
						>
						<label class="block text-slate-300"
							>Ti = {ti} s<input
								class="w-full"
								type="range"
								min="0.5"
								max="40"
								step="0.5"
								bind:value={ti}
							/></label
						>
						<p class="text-slate-300">
							Przeregulowanie {(perf.overshoot * 100).toFixed(0)} % · czas regulacji {perf.settling ===
							null
								? '> 80 s'
								: `${perf.settling.toFixed(0)} s`}
						</p>
					</div>
				{/if}
			</div>
		</div>
	</div>
</figure>
