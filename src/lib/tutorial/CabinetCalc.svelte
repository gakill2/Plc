<script lang="ts">
	import { psuSize, voltageAtLoad, type Load } from './control.js';

	let loads = $state<Load[]>([
		{ name: 'CPU PLC', count: 1, amps: 0.7 },
		{ name: 'Moduły I/O', count: 4, amps: 0.1 },
		{ name: 'Czujniki indukcyjne / optyczne', count: 24, amps: 0.025 },
		{ name: 'Zawory pneumatyczne', count: 8, amps: 0.2 },
		{ name: 'Przekaźniki pośredniczące', count: 10, amps: 0.02 },
		{ name: 'Panel HMI', count: 1, amps: 0.8 },
		{ name: 'Switch zarządzalny', count: 1, amps: 0.4 }
	]);
	let reserve = $state(25);
	const r = $derived(psuSize(loads, reserve / 100));

	let amps = $state(1.5);
	let length = $state(40);
	let mm2 = $state(0.75);
	const v = $derived(voltageAtLoad(24, amps, length, mm2));
</script>

<figure class="space-y-4 rounded-xl border border-slate-800 bg-slate-900/60 p-4 text-xs" lang="pl">
	<figcaption class="text-sm font-semibold text-white">
		Szafa: dobór zasilacza 24 V i spadek napięcia na kablu
	</figcaption>
	<div class="grid gap-4 md:grid-cols-2">
		<div class="space-y-1">
			<table class="w-full">
				<thead class="text-left text-slate-500"
					><tr
						><th>Odbiornik</th><th class="w-14">szt.</th><th class="w-16">A / szt.</th><th
							class="w-14 text-right">razem</th
						></tr
					></thead
				>
				<tbody>
					{#each loads as l, i (i)}
						<tr class="border-t border-slate-800">
							<td class="py-0.5 text-slate-300">{l.name}</td>
							<td
								><input
									class="w-12 rounded border border-slate-700 bg-slate-900 px-1"
									type="number"
									min="0"
									bind:value={l.count}
									aria-label="Ilość: {l.name}"
								/></td
							>
							<td
								><input
									class="w-14 rounded border border-slate-700 bg-slate-900 px-1"
									type="number"
									min="0"
									step="0.01"
									bind:value={l.amps}
									aria-label="Prąd: {l.name}"
								/></td
							>
							<td class="text-right font-mono text-slate-200">{(l.count * l.amps).toFixed(2)}</td>
						</tr>
					{/each}
				</tbody>
			</table>
			<label class="block text-slate-400"
				>Rezerwa {reserve} %
				<input class="w-full" type="range" min="0" max="50" step="5" bind:value={reserve} /></label
			>
			<p class="text-slate-200" role="status" data-testid="psu">
				Suma {r.total.toFixed(2)} A, z rezerwą {r.needed.toFixed(2)} A →
				{#if r.psu}<b class="text-emerald-300">zasilacz {r.psu} A</b>{:else}<b class="text-red-300"
						>podziel na kilka zasilaczy</b
					>{/if}
			</p>
			<p class="text-slate-500">
				Wyjścia PLC i zawory zasilaj z osobnego obwodu (osobny bezpiecznik albo kanał zabezpieczenia
				elektronicznego) niż CPU — zwarcie w zaworze nie wyłączy sterownika.
			</p>
		</div>
		<div class="space-y-2">
			<label class="block text-slate-400"
				>Prąd odbiornika {amps} A
				<input class="w-full" type="range" min="0.1" max="5" step="0.1" bind:value={amps} /></label
			>
			<label class="block text-slate-400"
				>Długość kabla {length} m
				<input class="w-full" type="range" min="1" max="150" bind:value={length} /></label
			>
			<label class="block text-slate-400"
				>Przekrój
				<select class="ml-2 rounded border border-slate-700 bg-slate-900 px-1" bind:value={mm2}>
					{#each [0.34, 0.5, 0.75, 1, 1.5, 2.5] as s (s)}<option value={s}>{s} mm²</option>{/each}
				</select></label
			>
			<p
				class="text-lg font-semibold {v < 20.4 ? 'text-red-300' : 'text-emerald-300'}"
				data-testid="vdrop"
			>
				Na końcu kabla: {v.toFixed(1)} V
			</p>
			<p class="text-slate-400">
				ΔU = 2 · L · I · ρ / S (ρ miedzi = 0,0175 Ω·mm²/m). Urządzenia 24 V DC zwykle wymagają co
				najmniej 20,4 V (−15 %). {v < 20.4
					? 'Za mało: większy przekrój, krótsza trasa albo zasilacz bliżej odbiornika.'
					: 'W porządku.'}
			</p>
		</div>
	</div>
</figure>
