<script lang="ts">
	import { analogRaw, RAW_NOMINAL, scale, type AnalogRange } from './physics.js';

	let range = $state<AnalogRange>('4-20mA');
	let value = $state(12);
	let lo = $state(0);
	let hi = $state(150);

	const max = $derived(range === '4-20mA' ? 24 : 11);
	const unit = $derived(range === '4-20mA' ? 'mA' : 'V');
	const r = $derived(analogRaw(value, range));
	const eng = $derived(r.fault ? null : scale(r.raw, lo, hi));

	function setRange(next: AnalogRange) {
		range = next;
		value = next === '4-20mA' ? 12 : 5;
	}
	const pill = (on: boolean) =>
		`rounded px-2.5 py-1 text-xs ${on ? 'bg-sky-500 text-slate-950 font-semibold' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`;
</script>

<figure class="space-y-4 rounded-lg border border-slate-700 bg-slate-950 p-4">
	<div class="flex flex-wrap items-center gap-3 text-xs">
		<span class="font-semibold tracking-wider text-sky-300 uppercase">Sygnał</span>
		<button
			class={pill(range === '4-20mA')}
			aria-pressed={range === '4-20mA'}
			onclick={() => setRange('4-20mA')}>4–20 mA</button
		>
		<button
			class={pill(range === '0-10V')}
			aria-pressed={range === '0-10V'}
			onclick={() => setRange('0-10V')}>0–10 V</button
		>
		<span class="ml-3 text-slate-400">Zakres czujnika:</span>
		<input
			class="w-16 rounded bg-slate-800 px-1.5 py-0.5 text-white"
			type="number"
			bind:value={lo}
			aria-label="Dolna granica"
		/>
		<span class="text-slate-500">…</span>
		<input
			class="w-16 rounded bg-slate-800 px-1.5 py-0.5 text-white"
			type="number"
			bind:value={hi}
			aria-label="Górna granica"
		/>
		<span class="text-slate-400">°C</span>
	</div>

	<label class="block">
		<span class="text-xs text-slate-400">Prąd / napięcie z czujnika (przesuń):</span>
		<input
			type="range"
			min="0"
			{max}
			step="0.05"
			bind:value
			class="mt-1 w-full accent-sky-500"
			aria-label="Sygnał analogowy"
		/>
	</label>

	<div class="grid gap-3 sm:grid-cols-3">
		<div class="rounded bg-slate-900 p-3">
			<div class="text-[10px] tracking-wider text-slate-500 uppercase">1 · na zacisku</div>
			<div class="font-mono text-2xl text-white">{value.toFixed(2)} {unit}</div>
		</div>
		<div class="rounded bg-slate-900 p-3">
			<div class="text-[10px] tracking-wider text-slate-500 uppercase">2 · w programie (IW64)</div>
			<div class="font-mono text-2xl {r.fault ? 'text-red-400' : 'text-amber-300'}">{r.raw}</div>
			<div class="text-xs text-slate-500">
				{r.fault ? '' : `${r.percent.toFixed(1)} % z ${RAW_NOMINAL}`}
			</div>
		</div>
		<div class="rounded bg-slate-900 p-3">
			<div class="text-[10px] tracking-wider text-slate-500 uppercase">3 · po przeskalowaniu</div>
			<div class="font-mono text-2xl {r.fault ? 'text-red-400' : 'text-emerald-300'}">
				{eng === null ? '—' : `${eng.toFixed(1)} °C`}
			</div>
		</div>
	</div>

	<p
		class="rounded px-3 py-2 font-mono text-xs {r.fault
			? 'bg-red-500/10 text-red-200'
			: 'bg-slate-900 text-slate-300'}"
		role="status"
	>
		{#if r.fault === 'wire-break'}
			Prąd poniżej ~1,2 mA: karta zgłasza ZERWANIE PRZEWODU (wartość {r.raw}). Program powinien to
			wykryć i przejść w stan bezpieczny — przy 0–10 V takiej diagnostyki nie ma, bo 0 V to poprawny
			pomiar.
		{:else if r.fault === 'overflow'}
			Przekroczony zakres pomiarowy (wartość {r.raw}) — czujnik uszkodzony albo zwarcie.
		{:else}
			temperatura := {lo} + {r.raw} / {RAW_NOMINAL} · ({hi} − {lo}) = {eng?.toFixed(1)} °C
		{/if}
	</p>
</figure>
