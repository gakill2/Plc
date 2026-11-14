<script lang="ts">
	import { parseAddress, type Address } from '#lib/engine/index.js';

	let text = $state('I0.3');
	const EXAMPLES = ['I0.3', 'Q1.7', 'M10.0', 'MB4', 'MW10', 'MD20', 'T3', 'C1'];

	const AREA: Record<string, string> = {
		I: 'wejście (Input) — stan zacisku wejściowego, np. przycisku lub czujnika',
		Q: 'wyjście (Output, z niem. Ausgang) — steruje np. lampką lub stycznikiem',
		M: 'marker (merker) — wewnętrzna pamięć sterownika, „zmienna pomocnicza”',
		T: 'timer — przekaźnik czasowy',
		C: 'licznik (Counter)'
	};

	const parsed = $derived.by((): { ok: true; a: Address } | { ok: false; error: string } => {
		try {
			return { ok: true, a: parseAddress(text) };
		} catch (e) {
			return { ok: false, error: (e as Error).message };
		}
	});
</script>

<figure class="space-y-4 rounded-lg border border-slate-700 bg-slate-950 p-4">
	<div class="flex flex-wrap items-center gap-2">
		<label class="text-xs font-semibold tracking-wider text-sky-300 uppercase" for="addr"
			>Rozbierz adres</label
		>
		<input
			id="addr"
			class="w-28 rounded border border-slate-700 bg-slate-900 px-2 py-1 font-mono text-sm text-white outline-none focus:border-sky-400"
			bind:value={text}
			spellcheck="false"
		/>
		{#each EXAMPLES as ex (ex)}
			<button
				class="rounded bg-slate-800 px-2 py-0.5 font-mono text-xs text-slate-300 hover:bg-slate-700"
				onclick={() => (text = ex)}>{ex}</button
			>
		{/each}
	</div>

	{#if !parsed.ok}
		<p class="text-sm text-red-300">To nie jest poprawny adres ({parsed.error}).</p>
	{:else}
		{@const a = parsed.a}
		<p class="text-sm text-slate-300">
			<code class="font-mono text-emerald-300">{a.area}</code> — {AREA[a.area]}
		</p>

		{#if a.area === 'T' || a.area === 'C'}
			<p class="text-sm text-slate-300">
				Numer instancji: <b class="text-white">{a.index}</b>. Jako bit oznacza wyjście Q {a.area ===
				'T'
					? 'timera'
					: 'licznika'}, jako liczba — {a.area === 'T'
					? 'czas, który upłynął (ET, w ms)'
					: 'aktualną wartość licznika (CV)'}.
			</p>
		{:else if a.size === 'X'}
			<p class="text-sm text-slate-300">
				Bajt <b class="text-white">{a.byte}</b>, bit <b class="text-white">{a.bit}</b> — pojedynczy sygnał
				0/1 (typ BOOL).
			</p>
			<div class="flex items-end gap-1 font-mono text-[11px]">
				<span class="mr-2 self-center text-slate-500">{a.area}B{a.byte}</span>
				{#each [7, 6, 5, 4, 3, 2, 1, 0] as bit (bit)}
					<div class="flex flex-col items-center gap-1">
						<span
							class="grid size-8 place-items-center rounded border {bit === a.bit
								? 'border-sky-400 bg-sky-500/30 text-white'
								: 'border-slate-700 text-slate-500'}"
						>
							{bit === a.bit ? '●' : ''}
						</span>
						<span class={bit === a.bit ? 'text-sky-300' : 'text-slate-600'}>.{bit}</span>
					</div>
				{/each}
			</div>
		{:else}
			{@const width = a.size === 'D' ? 4 : a.size === 'W' ? 2 : 1}
			<p class="text-sm text-slate-300">
				{a.size === 'B' ? 'Bajt' : a.size === 'W' ? 'Słowo (16 bitów)' : 'Podwójne słowo (32 bity)'} zaczynające
				się od bajtu
				<b class="text-white">{a.byte}</b>:
				{a.size === 'B'
					? 'liczba 0 … 255.'
					: a.size === 'W'
						? 'typ INT, liczba −32 768 … 32 767.'
						: 'typ DINT (±2 miliardy) albo REAL (liczba zmiennoprzecinkowa).'}
			</p>
			<div class="flex gap-1 font-mono text-[11px]">
				{#each Array.from({ length: width }, (_, i) => a.byte + i) as b, i (b)}
					<div class="rounded border border-sky-400/60 bg-sky-500/10 px-3 py-2 text-center">
						<div class="text-sky-200">{a.area}B{b}</div>
						<div class="text-slate-500">
							{i === 0 && width > 1 ? 'starszy' : i === width - 1 && width > 1 ? 'młodszy' : ''}
						</div>
					</div>
				{/each}
			</div>
			{#if width > 1}
				<p class="text-xs text-amber-200/90">
					Uwaga: {a.area}{a.size}{a.byte} i {a.area}{a.size}{a.byte + 1} zachodzą na siebie — używaj adresów
					co {width}
					bajty ({a.area}{a.size}{a.byte}, {a.area}{a.size}{a.byte + width} …), inaczej jedna zmienna
					nadpisze drugą.
				</p>
			{/if}
		{/if}
	{/if}
</figure>
