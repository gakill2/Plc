<script lang="ts">
	import { onMount } from 'svelte';
	import DrivePanel from '#lib/drive/DrivePanel.svelte';
	import { DEFAULT_PARAMS, newDrive, stepDrive, type DriveParams } from '#lib/drive/drive.js';

	/** A drive on the desk: buttons write the control word like a PLC would. */
	let params = $state<DriveParams>({ ...DEFAULT_PARAMS, inertia: 0.1, load: 0.1, rampUp: 10 });
	let drive = $state(newDrive());
	let stw = $state(0x047e);
	let pulse = $state(0);
	let nsoll = $state(16384);
	let out = $state({ zsw: 0, nist: 0 });
	let history = $state<{ hz: number; vdc: number; i: number }[]>([]);

	const COMMANDS = [
		{ label: '047E · gotowość (OFF1)', word: 0x047e },
		{ label: '047F · start (ON)', word: 0x047f },
		{ label: '047D · OFF2 wybieg', word: 0x047d },
		{ label: '047B · OFF3 szybki stop', word: 0x047b }
	];

	onMount(() => {
		const t = setInterval(() => {
			const word = pulse > 0 ? stw | 0x80 : stw;
			if (pulse > 0) pulse--;
			for (let k = 0; k < 5; k++) {
				const r = stepDrive(drive, word, nsoll, params, 20);
				drive = r.state;
				out = r.out;
			}
			history = [...history.slice(-199), { hz: drive.hz, vdc: drive.vdc, i: drive.current }];
		}, 100);
		return () => clearInterval(t);
	});

	const path = (values: number[], max: number, min = 0) =>
		values
			.map(
				(v, i) => `${i === 0 ? 'M' : 'L'}${(i / 199) * 400} ${80 - ((v - min) / (max - min)) * 76}`
			)
			.join(' ');
</script>

<figure class="space-y-4 rounded-xl border border-slate-800 bg-slate-900/60 p-4" lang="pl">
	<figcaption class="text-sm font-semibold text-white">
		Laboratorium falownika: słowo sterujące, rampy i błędy
	</figcaption>
	<div class="flex flex-wrap items-center gap-2 text-xs">
		{#each COMMANDS as c (c.word)}
			<button
				class="rounded border px-2 py-1 font-mono {stw === c.word
					? 'border-sky-400 bg-sky-500/20 text-white'
					: 'border-slate-700 text-slate-300 hover:bg-slate-800'}"
				onclick={() => (stw = c.word)}>{c.label}</button
			>
		{/each}
		<button
			class="rounded border border-amber-500/60 px-2 py-1 text-amber-200 hover:bg-amber-500/10"
			onclick={() => (pulse = 2)}>Kwituj błąd (bit 7)</button
		>
		<label class="ml-auto flex items-center gap-2 text-slate-400"
			>NSOLL_A {((nsoll / 16384) * 100).toFixed(0)} %
			<input type="range" min="-16384" max="16384" step="1024" bind:value={nsoll} /></label
		>
	</div>
	<DrivePanel
		{drive}
		{stw}
		zsw={out.zsw}
		nist={out.nist}
		{params}
		onParams={(p) => (params = { ...params, ...p })}
	/>
	<svg
		viewBox="0 0 400 84"
		class="h-28 w-full rounded bg-slate-950"
		role="img"
		aria-label="Wykres częstotliwości, napięcia DC i prądu"
	>
		<path
			d={path(
				history.map((h) => h.hz),
				50,
				-50
			)}
			fill="none"
			stroke="#34d399"
			stroke-width="1.5"
		/>
		<path
			d={path(
				history.map((h) => h.vdc),
				900,
				400
			)}
			fill="none"
			stroke="#f59e0b"
			stroke-width="1.5"
		/>
		<path
			d={path(
				history.map((h) => h.i),
				3
			)}
			fill="none"
			stroke="#38bdf8"
			stroke-width="1.5"
		/>
		<line
			x1="0"
			x2="400"
			y1={80 - ((820 - 400) / 500) * 76}
			y2={80 - ((820 - 400) / 500) * 76}
			stroke="#f43f5e"
			stroke-dasharray="4 3"
		/>
	</svg>
	<p class="text-[11px] text-slate-500">
		<span class="text-emerald-400">— częstotliwość</span> ·
		<span class="text-amber-400">— napięcie DC</span>
		(czerwona linia: próg przepięcia 820 V) · <span class="text-sky-400">— prąd</span>. Spróbuj:
		koło zamachowe, rampa hamowania 3 s, start i 047E. Potem wydłuż rampę albo włącz rezystor
		hamujący.
	</p>
</figure>
