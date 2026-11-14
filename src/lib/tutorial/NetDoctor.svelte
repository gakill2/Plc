<script lang="ts">
	import {
		deviceSummary,
		FAULT_TEXT,
		ping,
		profinetStatus,
		SCENARIOS,
		type FaultKind,
		type NetDevice
	} from '#lib/net/netsim.js';

	let index = $state(0);
	const scenario = $derived(SCENARIOS[index]);
	const net = $derived(scenario.network());

	let from = $state('plc');
	let to = $state('drive');
	let log = $state<{ ok: boolean; text: string }[]>([]);
	let inspected = $state<string[]>([]);
	let device = $state('');
	let kind = $state<FaultKind | ''>('');
	let wrong = $state(0);
	let solved = $state(false);
	let feedback = $state<string | null>(null);

	function reset(i: number) {
		index = i;
		log = [];
		inspected = [];
		device = '';
		kind = '';
		wrong = 0;
		solved = false;
		feedback = null;
	}

	function doPing() {
		if (from === to) return;
		log = [ping(net, from, to), ...log].slice(0, 8);
	}

	function answer() {
		if (!device || !kind) return;
		if (device === scenario.fault.device && kind === scenario.fault.kind) {
			solved = true;
			feedback = null;
		} else {
			wrong++;
			const d = net.devices.find((x) => x.id === device)!;
			feedback = `${d.label}: „${FAULT_TEXT[kind]}” — to nie to. Sprawdź jeszcze raz.`;
		}
	}

	const ICON: Record<NetDevice['kind'], string> = {
		plc: '▣',
		hmi: '▭',
		drive: '⟳',
		io: '⋮',
		laptop: '⌨',
		router: '⇄',
		scada: '🖥'
	};
	const pn = $derived(profinetStatus(net));
	/** positions on the diagram */
	const ot = $derived(net.devices.filter((d) => d.vlan === 10 && d.kind !== 'scada'));
</script>

<figure class="space-y-4 rounded-xl border border-slate-800 bg-slate-900/60 p-4" lang="pl">
	<figcaption class="flex flex-wrap items-center gap-2 text-sm font-semibold text-white">
		Diagnosta sieci: „dlaczego to się nie łączy?”
		<select
			class="ml-auto rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs font-normal"
			value={index}
			aria-label="Zgłoszenie"
			onchange={(e) => reset(+e.currentTarget.value)}
		>
			{#each SCENARIOS as s, i (s.id)}<option value={i}>{i + 1}. {s.title}</option>{/each}
		</select>
	</figcaption>

	<p class="rounded border border-slate-700 bg-slate-950 p-2 text-xs text-slate-200 italic">
		📞 „{scenario.report}”
	</p>

	<!-- diagram -->
	<div class="grid gap-3 text-xs md:grid-cols-[1fr_14rem]">
		<div class="rounded border border-slate-800 bg-slate-950 p-3">
			<p class="mb-2 text-[11px] text-slate-500">
				Switch zarządzalny · kliknij urządzenie, żeby zobaczyć konfigurację
			</p>
			<div class="flex flex-wrap gap-2">
				{#each net.devices as d (d.id)}
					<button
						class="w-36 rounded border px-2 py-1.5 text-left {inspected.includes(d.id)
							? 'border-sky-500/60 bg-sky-500/10'
							: 'border-slate-700 hover:border-slate-500'}"
						onclick={() =>
							(inspected = inspected.includes(d.id) ? inspected : [...inspected, d.id])}
					>
						<span class="flex items-center gap-1.5 font-semibold text-slate-200">
							<span aria-hidden="true">{ICON[d.kind]}</span>{d.label}
							<span
								class="ml-auto size-2 rounded-full {d.link ? 'bg-emerald-400' : 'bg-slate-600'}"
								title={d.link ? 'LINK' : 'brak linku'}
							></span>
						</span>
						<span class="text-[10px] text-slate-500"
							>port VLAN {d.vlan}{d.kind === 'scada' ? ' · biuro' : ''}</span
						>
						{#if inspected.includes(d.id)}
							<span class="mt-1 block font-mono text-[10px] text-sky-200">{deviceSummary(d)}</span>
						{/if}
					</button>
				{/each}
			</div>
			<p class="mt-2 text-[10px] text-slate-500">
				Router / firewall: VLAN 10 → 192.168.10.254/24 · VLAN 20 → 10.20.0.1/16 · w sieci maszyny {ot.length}
				urządzeń
			</p>
		</div>
		<div class="space-y-1 rounded border border-slate-800 bg-slate-950 p-2">
			<p class="font-semibold text-slate-300">Diagnostyka Profinet w PLC</p>
			{#each pn as s (s.name)}
				<p class={s.ok ? 'text-emerald-300' : 'text-red-300'}>{s.ok ? '●' : '✕'} {s.text}</p>
			{/each}
		</div>
	</div>

	<!-- ping -->
	<div class="flex flex-wrap items-center gap-2 text-xs">
		<span class="text-slate-400">ping z</span>
		<select
			class="rounded border border-slate-700 bg-slate-900 px-1 py-0.5"
			bind:value={from}
			aria-label="Ping z"
		>
			{#each net.devices as d (d.id)}<option value={d.id}>{d.label}</option>{/each}
		</select>
		<span class="text-slate-400">do</span>
		<select
			class="rounded border border-slate-700 bg-slate-900 px-1 py-0.5"
			bind:value={to}
			aria-label="Ping do"
		>
			{#each net.devices as d (d.id)}<option value={d.id}>{d.label}</option>{/each}
		</select>
		<button class="rounded bg-slate-700 px-2 py-0.5 hover:bg-slate-600" onclick={doPing}
			>Ping</button
		>
	</div>
	{#if log.length}
		<pre
			class="max-h-32 overflow-auto rounded bg-black p-2 font-mono text-[11px] leading-5"
			aria-label="Wyniki ping">{#each log as l, i (i)}<span
					class={l.ok ? 'text-emerald-300' : 'text-red-300'}>{l.text}</span
				>
			{/each}</pre>
	{/if}

	<!-- answer -->
	{#if solved}
		<div
			class="space-y-1 rounded border border-emerald-500/40 bg-emerald-500/10 p-2 text-xs"
			role="status"
		>
			<p class="font-semibold text-emerald-200">
				Znalezione{wrong ? ` (pomyłek: ${wrong})` : ' za pierwszym razem!'}
			</p>
			<p class="text-slate-200">{scenario.explanation}</p>
			{#if index < SCENARIOS.length - 1}
				<button
					class="rounded bg-emerald-400 px-2 py-0.5 font-semibold text-slate-950"
					onclick={() => reset(index + 1)}>Następne zgłoszenie →</button
				>
			{/if}
		</div>
	{:else}
		<div class="flex flex-wrap items-center gap-2 text-xs">
			<span class="text-slate-400">Diagnoza:</span>
			<select
				class="rounded border border-slate-700 bg-slate-900 px-1 py-0.5"
				bind:value={device}
				aria-label="Urządzenie"
			>
				<option value="">— urządzenie —</option>
				{#each net.devices as d (d.id)}<option value={d.id}>{d.label}</option>{/each}
			</select>
			<select
				class="rounded border border-slate-700 bg-slate-900 px-1 py-0.5"
				bind:value={kind}
				aria-label="Usterka sieci"
			>
				<option value="">— usterka —</option>
				{#each Object.entries(FAULT_TEXT) as [k, t] (k)}<option value={k}>{t}</option>{/each}
			</select>
			<button
				class="rounded bg-sky-500 px-2 py-0.5 font-semibold text-slate-950 disabled:opacity-50"
				disabled={!device || !kind}
				onclick={answer}>Sprawdź</button
			>
		</div>
		{#if feedback}<p class="text-xs text-red-300">{feedback}</p>{/if}
	{/if}
</figure>
