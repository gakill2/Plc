<script lang="ts">
	import { formatAddress, parseAddress, type Address } from '#lib/engine/index.js';
	import { portOf, type Circuit } from '#lib/circuit/model.js';
	import type { RuntimeSnapshot } from '#lib/runtime/protocol.js';
	import { readBit, readNumber } from '#lib/runtime/read.js';
	import type { SymbolEntry } from '#lib/symbols/symbols.js';

	/*
	 * The signal check sheet of a commissioning (loop check): every I/O point from the
	 * documentation, its live value, and what is actually wired to that terminal.
	 */
	type Props = { symbols: SymbolEntry[]; circuit: Circuit; snapshot: RuntimeSnapshot | null };
	let { symbols, circuit, snapshot }: Props = $props();

	let ok = $state<Record<string, boolean>>({});

	const rows = $derived(
		symbols.flatMap((s) => {
			let a: Address;
			try {
				a = parseAddress(s.address);
			} catch {
				return [];
			}
			if (a.area !== 'I' && a.area !== 'Q') return [];
			const address = formatAddress(a);
			const at = circuit.wires
				.filter((w) => w.terminal.trim().toUpperCase() === address)
				.map((w) => {
					const d = circuit.devices.find((x) => x.id === w.device);
					const port = d ? portOf(d.type, w.port) : null;
					return d
						? `${d.label}${port && port.id !== 'main' ? ` (${port.label})` : ''}${d.nc ? ' NC' : ''}`
						: '?';
				});
			const words = circuit.devices
				.filter(
					(d) =>
						d.type === 'vfd' &&
						(d.aiWord?.toUpperCase() === address || d.aoWord?.toUpperCase() === address)
				)
				.map((d) => `${d.label} (${d.aiWord?.toUpperCase() === address ? 'AI1' : 'AO1'})`);
			return [{ s, a, address, at: [...at, ...words], bit: a.size === 'X' }];
		})
	);
	const value = (a: Address, bit: boolean) => {
		if (!snapshot) return '—';
		if (bit) return readBit(snapshot, a) ? '1' : '0';
		return String(readNumber(snapshot, a) ?? '—');
	};
	const done = $derived(rows.filter((r) => ok[r.s.id]).length);
</script>

<div class="h-full overflow-auto p-4" lang="pl">
	<h2 class="text-sm font-semibold text-slate-100">Test sygnałów (I/O check)</h2>
	<p class="mt-1 max-w-3xl text-xs text-slate-400">
		Na uruchomieniu sprawdza się każdy punkt po kolei, zanim maszyna ruszy w automacie: <b
			>wejścia</b
		>
		— uruchom urządzenie (w widoku Circuit) i zobacz, czy zmienia się właściwy adres; <b>wyjścia</b>
		— w trybie RUN wymuś je w tabeli Watch (F1) i patrz, co się załącza. Zaznacz punkty, które zgadzają
		się z dokumentacją. Sprawdzone: <b class="text-white">{done} / {rows.length}</b>
	</p>
	<table class="mt-3 w-full max-w-4xl text-left text-xs">
		<thead class="border-b border-slate-700 text-[10px] tracking-wider text-slate-500 uppercase">
			<tr>
				<th class="py-1.5 pr-2">OK</th>
				<th class="py-1.5 pr-2">Adres</th>
				<th class="py-1.5 pr-2">Symbol</th>
				<th class="py-1.5 pr-2">Dokumentacja</th>
				<th class="py-1.5 pr-2">Stan</th>
				<th class="py-1.5">Podłączone na zacisku</th>
			</tr>
		</thead>
		<tbody>
			{#each rows as r (r.s.id)}
				{@const v = value(r.a, r.bit)}
				<tr class="border-b border-slate-800 {ok[r.s.id] ? 'text-slate-500' : 'text-slate-200'}">
					<td class="py-1.5 pr-2">
						<input
							type="checkbox"
							class="accent-emerald-500"
							aria-label="{r.address} sprawdzony"
							checked={ok[r.s.id] ?? false}
							onchange={(e) => (ok[r.s.id] = e.currentTarget.checked)}
						/>
					</td>
					<td class="py-1.5 pr-2 font-mono {r.a.area === 'I' ? 'text-sky-300' : 'text-amber-300'}"
						>{r.address}</td
					>
					<td class="py-1.5 pr-2 font-mono">{r.s.name}</td>
					<td class="py-1.5 pr-2 text-slate-400">{r.s.comment}</td>
					<td class="py-1.5 pr-2 font-mono">
						{#if r.bit}
							<span
								class="inline-block size-3 rounded-full align-middle {v === '1'
									? 'bg-emerald-400'
									: 'bg-slate-700'}"
								aria-label="{r.address} = {v}"
							></span>
						{:else}{v}{/if}
					</td>
					<td class="py-1.5 font-mono">{r.at.length ? r.at.join(', ') : '— nic —'}</td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>
