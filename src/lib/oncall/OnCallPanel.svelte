<script lang="ts">
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';
	import type { Circuit } from '#lib/circuit/model.js';
	import { beginShift } from './begin.js';
	import { faultOptions, fieldSuspects, sameFault, type Machine } from './machines.js';
	import type { ProcessKind } from '#lib/processes/types.js';
	import { diagnose, downtimeMin, incidentOf, loadLog, PENALTY_MIN, type Shift } from './shift.js';

	type Props = {
		machine: Machine;
		circuit: Circuit;
		scenario: ProcessKind | undefined;
		onRepaired: () => void;
	};
	let { machine, circuit, scenario, onRepaired }: Props = $props();

	let shift = $state<Shift | null>(null);
	let now = $state(Date.now());
	onMount(() => {
		const current = loadLog().current;
		if (current?.machine === machine.id) shift = current;
		const t = setInterval(() => (now = Date.now()), 5000);
		return () => clearInterval(t);
	});

	const incident = $derived(shift ? incidentOf(shift) : null);
	const solved = $derived(shift?.solvedAt !== undefined);
	const minutes = $derived(shift ? downtimeMin(shift, now) : 0);

	let deviceLabel = $state('');
	let choice = $state(-1);
	let feedback = $state<string | null>(null);
	/** suspects: the circuit's devices, then the plant's sensors and the plant itself */
	const suspects = $derived([
		...circuit.devices.map((d) => ({ label: d.label, options: faultOptions(d.type, d.label) })),
		...fieldSuspects(scenario)
	]);
	const device = $derived(suspects.find((d) => d.label === deviceLabel));
	const options = $derived(device?.options ?? []);

	function submit() {
		const option = options[choice];
		if (!option || !incident) return;
		const text = `${device?.label}: ${option.text}`;
		const ok = sameFault(option.fault, incident.fault);
		shift = diagnose(ok, text);
		now = Date.now();
		if (ok) {
			feedback = null;
			onRepaired();
		} else {
			feedback = `Naprawiono „${text}” — maszyna dalej nie działa. +${PENALTY_MIN} min przestoju.`;
		}
	}
</script>

<section
	lang="pl"
	aria-label="Dyżur"
	class="space-y-3 rounded-lg border border-orange-500/40 bg-orange-500/5 p-3 text-xs"
>
	<div class="flex items-center gap-2">
		<span class="text-[10px] font-semibold tracking-wider text-orange-300 uppercase">🌙 Dyżur</span>
		<a href={resolve('/oncall')} class="ml-auto text-[11px] text-slate-400 underline">wszystkie</a>
	</div>
	<h2 class="text-sm font-semibold text-white">{machine.name}</h2>
	<p class="text-slate-400">{machine.area}</p>

	{#if shift && incident}
		<div class="rounded border border-slate-700 bg-slate-900/70 p-2">
			<p class="text-slate-400">📞 {incident.time} · {incident.caller}</p>
			<p class="mt-1 leading-relaxed text-slate-100 italic">„{incident.report}”</p>
		</div>

		{#if !solved}
			<p class="text-slate-400">
				Przestój: <b class="text-orange-200" data-testid="downtime">{minutes} min</b>. Program i
				okablowanie są dobre — coś się zepsuło. Uruchom PLC, odtwórz objaw, patrz w
				<b>Test I/O</b>, <b>Watch</b>, trend, <b>Diagnostykę</b> i widoki <b>Circuit</b> /
				<b>Process</b>.
			</p>
			<form
				class="space-y-2"
				onsubmit={(e) => {
					e.preventDefault();
					submit();
				}}
			>
				<label class="block">
					<span class="text-slate-400">Uszkodzony element</span>
					<select
						bind:value={deviceLabel}
						onchange={() => (choice = -1)}
						class="mt-0.5 w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-slate-100"
					>
						<option value="">— wybierz —</option>
						{#each suspects as d (d.label)}<option value={d.label}>{d.label}</option>{/each}
					</select>
				</label>
				<label class="block">
					<span class="text-slate-400">Usterka</span>
					<select
						bind:value={choice}
						disabled={!device}
						class="mt-0.5 w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-slate-100 disabled:opacity-50"
					>
						<option value={-1}>— wybierz —</option>
						{#each options as o, i (i)}<option value={i}>{o.text}</option>{/each}
					</select>
				</label>
				<button
					class="rounded-md bg-orange-400 px-3 py-1.5 font-semibold text-slate-950 hover:bg-orange-300 disabled:opacity-50"
					disabled={choice < 0}>Naprawiam</button
				>
			</form>
			{#if feedback}
				<p class="rounded bg-red-500/10 px-2 py-1 text-red-200" aria-live="polite">{feedback}</p>
			{/if}
			{#if shift.tried.length}
				<p class="text-slate-500">Bez skutku: {shift.tried.join(' · ')}</p>
			{/if}
		{:else}
			<div
				class="space-y-1.5 rounded border border-emerald-500/40 bg-emerald-500/10 p-2"
				aria-live="polite"
				data-testid="oncall-result"
			>
				<p class="font-semibold text-emerald-200">
					Maszyna naprawiona!
					<span class="ml-1 text-amber-300" aria-label="{shift.stars} z 3 gwiazdek"
						>{'★'.repeat(shift.stars ?? 0)}{'☆'.repeat(3 - (shift.stars ?? 0))}</span
					>
				</p>
				<p class="text-slate-300">
					Przestój: {downtimeMin(shift)} min{shift.wrong
						? ` (w tym ${shift.wrong * PENALTY_MIN} min za zbędne naprawy)`
						: ''}
				</p>
				<p class="text-slate-300"><b class="text-white">Przyczyna:</b> {incident.cause}</p>
				<p class="text-slate-300"><b class="text-white">Naprawa:</b> {incident.repair}</p>
				<p class="text-slate-400">Uruchom PLC jeszcze raz — maszyna działa normalnie.</p>
				<button
					class="rounded bg-orange-400 px-2 py-1 font-semibold text-slate-950 hover:bg-orange-300"
					onclick={() => beginShift()}>Następne wezwanie →</button
				>
			</div>
		{/if}
	{:else}
		<p class="text-slate-400">
			Maszyna pracuje bez usterek. Możesz poznać jej program i okablowanie, zanim coś się zepsuje.
		</p>
		<button
			class="rounded bg-orange-400 px-2 py-1 font-semibold text-slate-950 hover:bg-orange-300"
			onclick={() => beginShift(machine.id)}>Wezwanie do tej maszyny</button
		>
	{/if}
</section>
