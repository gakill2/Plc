<script lang="ts">
	import {
		FUNCTIONS,
		hex,
		request,
		respond,
		type FunctionCode,
		type Part,
		type Slave
	} from './modbus.js';

	let slave = $state<Slave>({ coils: [true, false, true, false], registers: [215, 1800, 0, 42] });
	let fc = $state<FunctionCode>(3);
	let address = $state(0);
	let amount = $state(2);
	let transaction = $state(1);
	let sent = $state<{ req: Part[]; res: Part[]; text: string } | null>(null);

	const isWrite = $derived(FUNCTIONS[fc].write);
	const preview = $derived(request(fc, address, amount, transaction));

	function send() {
		const reply = respond(slave, fc, address, amount, transaction);
		sent = { req: preview, res: reply.parts, text: reply.text };
		slave = reply.slave;
		transaction++;
	}

	const COLORS = [
		'text-slate-400',
		'text-slate-500',
		'text-slate-400',
		'text-slate-500',
		'text-sky-300',
		'text-amber-300',
		'text-emerald-300',
		'text-violet-300'
	];
</script>

{#snippet frame(parts: Part[], title: string)}
	<div>
		<p class="mb-1 text-[11px] font-semibold tracking-wider text-slate-400 uppercase">{title}</p>
		<div class="flex flex-wrap gap-1.5">
			{#each parts as p, i (i)}
				<div class="rounded border border-slate-700 bg-slate-950 px-1.5 py-1 text-center">
					<code class="block font-mono text-xs {COLORS[i % COLORS.length]}">{hex(p.bytes)}</code>
					<span class="block text-[9px] text-slate-500">{p.label}</span>
				</div>
			{/each}
		</div>
	</div>
{/snippet}

<figure class="space-y-4 rounded-xl border border-slate-800 bg-slate-900/60 p-4" lang="pl">
	<figcaption class="text-sm font-semibold text-white">
		Modbus TCP: zapytanie i odpowiedź bajt po bajcie
	</figcaption>

	<div class="grid gap-4 md:grid-cols-[1fr_14rem]">
		<div class="space-y-3">
			<div class="flex flex-wrap items-end gap-3 text-xs">
				<label class="block">
					<span class="text-slate-400">Funkcja</span>
					<select
						class="mt-0.5 block rounded border border-slate-700 bg-slate-900 px-2 py-1"
						bind:value={fc}
					>
						{#each Object.entries(FUNCTIONS) as [code, f] (code)}<option value={Number(code)}
								>{f.name}</option
							>{/each}
					</select>
				</label>
				<label class="block">
					<span class="text-slate-400">Adres (od 0)</span>
					<input
						type="number"
						min="0"
						class="mt-0.5 block w-20 rounded border border-slate-700 bg-slate-900 px-2 py-1"
						bind:value={address}
					/>
				</label>
				<label class="block">
					<span class="text-slate-400"
						>{isWrite ? (fc === 5 ? 'Wartość (0/1)' : 'Wartość') : 'Ilość'}</span
					>
					<input
						type="number"
						min="0"
						class="mt-0.5 block w-24 rounded border border-slate-700 bg-slate-900 px-2 py-1"
						bind:value={amount}
					/>
				</label>
				<button
					class="rounded bg-sky-500 px-3 py-1.5 font-semibold text-slate-950 hover:bg-sky-400"
					onclick={send}>Wyślij</button
				>
			</div>
			<p class="text-xs text-slate-400">
				Tablica: {FUNCTIONS[fc].table}. W dokumentacji urządzeń adres często podaje się „od 1” z
				prefiksem (np. rejestr <b class="text-white">40001</b>) — w telegramie to adres
				<b class="text-white">0</b>.
			</p>
			{@render frame(sent?.req ?? preview, 'Zapytanie mastera (klienta)')}
			{#if sent}
				{@render frame(sent.res, 'Odpowiedź stacji (serwera)')}
				<p class="rounded bg-slate-800/60 px-2 py-1 text-xs text-slate-200" role="status">
					{sent.text}
				</p>
			{/if}
		</div>

		<div class="space-y-2 text-xs">
			<p class="font-semibold text-slate-300">Stacja (slave / serwer), ID 1</p>
			<table class="w-full">
				<tbody>
					{#each slave.coils as c, i (i)}
						<tr class="border-t border-slate-800">
							<td class="py-0.5 font-mono text-slate-500">0000{i + 1}</td>
							<td class="text-slate-400">cewka {i}</td>
							<td class="text-right">
								<button
									class="rounded px-1.5 font-mono {c
										? 'bg-emerald-500/30 text-emerald-200'
										: 'bg-slate-800 text-slate-400'}"
									onclick={() => (slave.coils[i] = !c)}>{c ? 1 : 0}</button
								>
							</td>
						</tr>
					{/each}
					{#each slave.registers as r, i (i)}
						<tr class="border-t border-slate-800">
							<td class="py-0.5 font-mono text-slate-500">4000{i + 1}</td>
							<td class="text-slate-400">rejestr {i}</td>
							<td class="text-right font-mono text-amber-200">{r}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</div>
</figure>
