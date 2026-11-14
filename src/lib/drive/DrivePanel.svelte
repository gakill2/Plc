<script lang="ts">
	import {
		CURRENT_TRIP,
		hex4,
		STATE_NAMES,
		STW_BITS,
		VDC_TRIP,
		ZSW_BITS,
		type DriveParams,
		type DriveState,
		type DriveStateId
	} from './drive.js';

	type Props = {
		drive: DriveState;
		stw: number;
		zsw: number;
		nist: number;
		params: DriveParams;
		onParams: (p: Partial<DriveParams>) => void;
		onTrip?: () => void;
	};
	let { drive, stw, zsw, nist, params, onParams, onTrip }: Props = $props();

	const STATES: DriveStateId[] = ['S1', 'S2', 'S3', 'S4', 'FAULT'];
	const bit = (w: number, b: number) => ((w >> b) & 1) === 1;
	const LOADS = [
		{ label: 'lekka taśma', inertia: 0.01, load: 0.3 },
		{ label: 'koło zamachowe / wentylator', inertia: 0.1, load: 0.1 },
		{ label: 'przeciążona taśma', inertia: 0.02, load: 1.3 }
	];
	const loadIndex = $derived(
		LOADS.findIndex((l) => l.inertia === params.inertia && l.load === params.load)
	);

	const bar = (v: number, max: number) => `${Math.min(100, Math.max(0, (v / max) * 100))}%`;
</script>

<div class="grid gap-4 text-xs lg:grid-cols-[13rem_1fr_15rem]" lang="pl">
	<!-- state machine -->
	<div class="space-y-1.5">
		<p class="font-semibold text-slate-300">Stan napędu (PROFIdrive)</p>
		{#each STATES as st (st)}
			<div
				class="rounded border px-2 py-1 {drive.state === st
					? st === 'FAULT'
						? 'border-red-400 bg-red-500/20 text-red-100'
						: 'border-emerald-400 bg-emerald-500/20 text-white'
					: 'border-slate-700 text-slate-500'}"
				aria-current={drive.state === st ? 'step' : undefined}
			>
				{STATE_NAMES[st]}
			</div>
		{/each}
		{#if drive.fault}
			<p class="rounded bg-red-500/10 px-2 py-1 font-mono text-red-200" role="alert">
				{drive.fault}
			</p>
		{/if}
		{#if drive.stopping}
			<p class="text-amber-200">
				Zatrzymanie: {drive.stopping === 'off1'
					? 'OFF1 (rampa)'
					: drive.stopping === 'off3'
						? 'OFF3 (szybkie)'
						: 'wybieg'}
			</p>
		{/if}
	</div>

	<!-- words -->
	<div class="grid gap-3 sm:grid-cols-2">
		<div>
			<p class="font-semibold text-slate-300">
				STW1 z PLC <code class="text-sky-300">{hex4(stw)}</code>
			</p>
			<ul class="mt-1 space-y-0.5">
				{#each STW_BITS as b (b.bit)}
					<li class="flex items-center gap-1.5" title={b.text}>
						<span class="w-4 font-mono text-slate-500">{b.bit}</span>
						<span class="size-2 rounded-full {bit(stw, b.bit) ? 'bg-sky-400' : 'bg-slate-700'}"
						></span>
						<span class={bit(stw, b.bit) ? 'text-slate-200' : 'text-slate-500'}>{b.name}</span>
					</li>
				{/each}
			</ul>
		</div>
		<div>
			<p class="font-semibold text-slate-300">
				ZSW1 do PLC <code class="text-emerald-300">{hex4(zsw)}</code>
			</p>
			<ul class="mt-1 space-y-0.5">
				{#each ZSW_BITS as b (b.bit)}
					<li class="flex items-center gap-1.5">
						<span class="w-4 font-mono text-slate-500">{b.bit}</span>
						<span
							class="size-2 rounded-full {bit(zsw, b.bit)
								? b.bit === 3
									? 'bg-red-400'
									: 'bg-emerald-400'
								: 'bg-slate-700'}"
						></span>
						<span class={bit(zsw, b.bit) ? 'text-slate-200' : 'text-slate-500'}>{b.name}</span>
					</li>
				{/each}
			</ul>
			<p class="mt-2 text-slate-400">
				NIST_A = <b class="font-mono text-white">{nist}</b> ({((nist / 16384) * 100).toFixed(0)} %)
			</p>
		</div>
	</div>

	<!-- measurements and parameters -->
	<div class="space-y-2">
		<p class="font-mono text-2xl text-emerald-300" data-testid="drive-hz">
			{drive.hz.toFixed(1)} Hz
		</p>
		{#each [['Prąd silnika', drive.current, CURRENT_TRIP, `${(drive.current * 100).toFixed(0)} %`], ['Napięcie DC', drive.vdc - 400, VDC_TRIP - 400, `${drive.vdc.toFixed(0)} V`], ['Temperatura (I²t)', drive.thermal, 1, `${(drive.thermal * 100).toFixed(0)} %`]] as [name, v, max, text] (name)}
			<div>
				<p class="flex justify-between text-slate-400">
					<span>{name}</span><span class="font-mono text-slate-200">{text}</span>
				</p>
				<div class="h-1.5 overflow-hidden rounded bg-slate-800">
					<div
						class="h-full {Number(v) / Number(max) > 0.85 ? 'bg-red-400' : 'bg-sky-400'}"
						style:width={bar(Number(v), Number(max))}
					></div>
				</div>
			</div>
		{/each}
		{#if drive.braking}<p class="text-amber-300">Rezystor hamujący grzeje się</p>{/if}

		<div class="space-y-1.5 border-t border-slate-800 pt-2">
			<p class="font-semibold text-slate-300">Parametry</p>
			<label class="block text-slate-400"
				>P1120 rampa rozpędzania: <b class="text-white">{params.rampUp} s</b>
				<input
					class="w-full"
					type="range"
					min="0.5"
					max="20"
					step="0.5"
					value={params.rampUp}
					oninput={(e) => onParams({ rampUp: +e.currentTarget.value })}
				/></label
			>
			<label class="block text-slate-400"
				>P1121 rampa hamowania: <b class="text-white">{params.rampDown} s</b>
				<input
					class="w-full"
					type="range"
					min="0.5"
					max="20"
					step="0.5"
					value={params.rampDown}
					oninput={(e) => onParams({ rampDown: +e.currentTarget.value })}
				/></label
			>
			<label class="flex items-center gap-2 text-slate-400"
				><input
					type="checkbox"
					checked={params.brakingResistor}
					onchange={(e) => onParams({ brakingResistor: e.currentTarget.checked })}
				/> rezystor hamujący</label
			>
			<label class="block text-slate-400"
				>Obciążenie
				<select
					class="mt-0.5 w-full rounded border border-slate-700 bg-slate-900 px-1 py-0.5"
					value={loadIndex}
					onchange={(e) =>
						onParams({
							inertia: LOADS[+e.currentTarget.value].inertia,
							load: LOADS[+e.currentTarget.value].load
						})}
				>
					{#each LOADS as l, i (i)}<option value={i}>{l.label}</option>{/each}
				</select></label
			>
			{#if onTrip}
				<button
					class="rounded border border-slate-700 px-2 py-0.5 text-slate-400 hover:bg-slate-800"
					onclick={onTrip}>Wywołaj błąd</button
				>
			{/if}
		</div>
	</div>
</div>
