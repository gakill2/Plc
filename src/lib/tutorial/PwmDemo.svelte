<script lang="ts">
	/** Sine-triangle PWM: how six transistors make a variable-frequency "sine" from a DC link. */
	let hz = $state(25);
	let carrier = $state(15);
	let uf = $state(true);

	const W = 600;
	/** modulation depth: with U/f it follows the frequency (U/f = const), up to 50 Hz */
	const m = $derived(uf ? Math.min(1, Math.max(0.08, hz / 50)) : 1);
	/** two cycles of the 50 Hz time base shown: 40 ms */
	const T = 0.04;
	const N = 1200;
	const samples = $derived.by(() => {
		const out: { t: number; ref: number; tri: number; pwm: number; cur: number }[] = [];
		let cur = 0;
		const fc = hz * carrier;
		for (let k = 0; k < N; k++) {
			const t = (k / N) * T;
			const ref = m * Math.sin(2 * Math.PI * hz * t);
			const phase = (t * fc) % 1;
			const tri = phase < 0.5 ? 4 * phase - 1 : 3 - 4 * phase;
			const pwm = ref >= tri ? 1 : -1;
			cur += (pwm - cur) * 0.04; // motor inductance smooths the current
			out.push({ t, ref, tri, pwm, cur });
		}
		return out;
	});
	const x = (t: number) => (t / T) * W;
	const line = (f: (s: (typeof samples)[number]) => number, y0: number, h: number) =>
		samples
			.map((s, i) => `${i ? 'L' : 'M'}${x(s.t).toFixed(1)} ${(y0 - f(s) * h).toFixed(1)}`)
			.join(' ');
</script>

<figure class="space-y-3 rounded-xl border border-slate-800 bg-slate-900/60 p-4" lang="pl">
	<figcaption class="text-sm font-semibold text-white">
		Modulacja PWM: jak falownik „robi” sinusoidę
	</figcaption>
	<div class="flex flex-wrap gap-4 text-xs text-slate-400">
		<label class="flex items-center gap-2"
			>Częstotliwość wyjściowa <b class="w-12 text-white">{hz} Hz</b>
			<input type="range" min="5" max="50" bind:value={hz} /></label
		>
		<label class="flex items-center gap-2"
			>Nośna = {carrier} × f
			<input type="range" min="6" max="30" bind:value={carrier} /></label
		>
		<label class="flex items-center gap-2"
			><input type="checkbox" bind:checked={uf} /> charakterystyka U/f</label
		>
	</div>
	<svg
		viewBox="0 0 {W} 250"
		class="w-full rounded bg-slate-950"
		role="img"
		aria-label="Przebiegi PWM"
	>
		<text x="4" y="14" font-size="10" fill="#94a3b8">sinus zadany i nośna trójkątna</text>
		<path d={line((s) => s.tri, 55, 35)} fill="none" stroke="#475569" stroke-width="1" />
		<path d={line((s) => s.ref, 55, 35)} fill="none" stroke="#38bdf8" stroke-width="2" />
		<text x="4" y="112" font-size="10" fill="#94a3b8"
			>napięcie na zaciskach silnika (impulsy z DC ±280 V)</text
		>
		<path d={line((s) => s.pwm, 145, 22)} fill="none" stroke="#f59e0b" stroke-width="1" />
		<text x="4" y="192" font-size="10" fill="#94a3b8"
			>prąd silnika (wygładzony przez indukcyjność uzwojeń)</text
		>
		<path d={line((s) => s.cur, 222, 24)} fill="none" stroke="#34d399" stroke-width="2" />
	</svg>
	<p class="text-xs text-slate-400">
		Głębokość modulacji: <b class="text-white">{(m * 100).toFixed(0)} %</b> — napięcie wyjściowe
		{uf
			? 'rośnie razem z częstotliwością (U/f = const), żeby strumień i moment silnika były stałe'
			: 'stałe: przy niskiej częstotliwości silnik dostałby za duże napięcie i prąd'}.
	</p>
</figure>
