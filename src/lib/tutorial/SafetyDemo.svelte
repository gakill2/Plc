<script lang="ts">
	import { onMount } from 'svelte';
	import {
		newRelay,
		requiredPl,
		stepRelay,
		TYPICAL_CATEGORY,
		type Avoidance,
		type Frequency,
		type Severity
	} from './safety.js';

	/* ---------- safety relay ---------- */
	let estop = $state(false); // pressed
	let reset = $state(false);
	let shortB = $state(false); // channel 2 shorted (always closed)
	let welded = $state(false); // K2 welded: stays closed, feedback never closes
	let relay = $state(newRelay());

	const ch1 = $derived(!estop);
	const ch2 = $derived(!estop || shortB);
	const k1 = $derived(relay.on);
	const k2 = $derived(relay.on || welded);
	const motor = $derived(k1 && k2);

	onMount(() => {
		const t = setInterval(() => {
			relay = stepRelay(relay, { ch1, ch2, reset, feedback: !k1 && !k2 }, 50);
		}, 50);
		return () => clearInterval(t);
	});

	const led = (on: boolean, color = 'bg-emerald-400') =>
		on ? `${color} shadow-[0_0_8px]` : 'bg-slate-700';

	/* ---------- risk graph ---------- */
	let s = $state<Severity>('S2');
	let f = $state<Frequency>('F2');
	let p = $state<Avoidance>('P1');
	const pl = $derived(requiredPl(s, f, p));
	const RISK = [
		{
			key: 's',
			label: 'Skutek urazu',
			options: [
				['S1', 'lekki, odwracalny'],
				['S2', 'ciężki, nieodwracalny lub śmierć']
			]
		},
		{
			key: 'f',
			label: 'Częstość / czas narażenia',
			options: [
				['F1', 'rzadko, krótko'],
				['F2', 'często lub długo']
			]
		},
		{
			key: 'p',
			label: 'Możliwość uniknięcia',
			options: [
				['P1', 'możliwe (wolny ruch, widać)'],
				['P2', 'prawie niemożliwe']
			]
		}
	] as const;
</script>

<figure class="space-y-5 rounded-xl border border-slate-800 bg-slate-900/60 p-4" lang="pl">
	<figcaption class="text-sm font-semibold text-white">
		Przekaźnik bezpieczeństwa: dwa kanały i sprzężenie zwrotne
	</figcaption>

	<div class="grid gap-4 md:grid-cols-[1fr_1fr]">
		<div class="space-y-3 text-xs">
			<div class="flex flex-wrap gap-2">
				<button
					class="rounded-full border-4 px-4 py-3 font-bold {estop
						? 'border-yellow-400 bg-red-700 text-white'
						: 'border-yellow-400 bg-red-500 text-white'}"
					aria-pressed={estop}
					onclick={() => (estop = !estop)}
					>{estop ? 'E-STOP wciśnięty (odblokuj)' : 'E-STOP'}</button
				>
				<button
					class="rounded-md border border-sky-500/60 px-3 py-2 text-sky-200 select-none hover:bg-sky-500/10"
					onpointerdown={() => (reset = true)}
					onpointerup={() => (reset = false)}
					onpointerleave={() => (reset = false)}
					onkeydown={(e) => e.key === ' ' && (reset = true)}
					onkeyup={(e) => e.key === ' ' && (reset = false)}>Reset (przytrzymaj i puść)</button
				>
			</div>
			<div class="space-y-1 text-slate-400">
				<label class="flex items-center gap-2"
					><input type="checkbox" bind:checked={shortB} /> zwarcie w kanale 2 (np. zgnieciony przewód)</label
				>
				<label class="flex items-center gap-2"
					><input type="checkbox" bind:checked={welded} /> zgrzany styk stycznika K2</label
				>
			</div>
			{#if relay.reason}
				<p class="rounded bg-red-500/10 px-2 py-1 text-red-200" role="status">{relay.reason}</p>
			{/if}
		</div>

		<div class="grid grid-cols-2 gap-3 text-xs">
			<div class="rounded border border-slate-700 bg-slate-950 p-2">
				<p class="mb-1 font-semibold text-slate-300">Przekaźnik</p>
				{#each [['Kanał 1', ch1], ['Kanał 2', ch2], ['Wyjścia', relay.on], ['Błąd', relay.fault]] as [name, on] (name)}
					<p class="flex items-center gap-2 text-slate-400">
						<span
							class="size-2.5 rounded-full {led(
								!!on,
								name === 'Błąd' ? 'bg-red-500' : 'bg-emerald-400'
							)}"
						></span>{name}
					</p>
				{/each}
			</div>
			<div class="rounded border border-slate-700 bg-slate-950 p-2">
				<p class="mb-1 font-semibold text-slate-300">Styczniki</p>
				<p class="flex items-center gap-2 text-slate-400">
					<span class="size-2.5 rounded-full {led(k1)}"></span>K1
				</p>
				<p class="flex items-center gap-2 text-slate-400">
					<span class="size-2.5 rounded-full {led(k2, welded ? 'bg-amber-400' : 'bg-emerald-400')}"
					></span>K2{welded ? ' (zgrzany)' : ''}
				</p>
				<p class="mt-2 font-semibold {motor ? 'text-emerald-300' : 'text-slate-500'}">
					Silnik: {motor ? 'pracuje' : 'stoi'}
				</p>
			</div>
		</div>
	</div>
	<p class="text-xs text-slate-500">
		Dwa styczniki w szeregu: gdy jeden się zgrzeje, drugi i tak odetnie silnik. Ich styki pomocnicze
		NC wracają do przekaźnika (EDM) — zgrzany stycznik blokuje ponowny reset. Dwa kanały e-stopu są
		porównywane: zwarcie w jednym przekaźnik wykryje przy najbliższym naciśnięciu.
	</p>

	<div class="border-t border-slate-800 pt-4">
		<p class="mb-2 text-sm font-semibold text-white">
			Graf ryzyka (PN-EN ISO 13849-1): jaki PL jest wymagany?
		</p>
		<div class="grid gap-3 text-xs sm:grid-cols-3">
			{#each RISK as r (r.key)}
				<fieldset class="space-y-1">
					<legend class="text-slate-400">{r.label}</legend>
					{#each r.options as [value, text] (value)}
						<label class="flex items-center gap-2">
							{#if r.key === 's'}<input type="radio" name="risk-s" {value} bind:group={s} />
							{:else if r.key === 'f'}<input type="radio" name="risk-f" {value} bind:group={f} />
							{:else}<input type="radio" name="risk-p" {value} bind:group={p} />{/if}
							<b class="font-mono text-white">{value}</b>
							<span class="text-slate-400">{text}</span>
						</label>
					{/each}
				</fieldset>
			{/each}
		</div>
		<p class="mt-3 text-sm text-slate-200" role="status">
			PL<sub>r</sub> = <b class="font-mono text-lg text-amber-300" data-testid="plr">{pl}</b> —
			typowo
			{TYPICAL_CATEGORY[pl]}.
		</p>
	</div>
</figure>
