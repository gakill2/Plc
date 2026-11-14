<script lang="ts">
	import { onMount } from 'svelte';

	/*
	 * A slowed-down scan cycle with one rung: Lampa := Przycisk.
	 * The process images make it visible that a change of the input waits for the next
	 * "read inputs" phase, and the lamp changes only in the "write outputs" phase.
	 */

	const PHASES = [
		{ name: 'Odczyt wejść', text: 'Stany zacisków wejściowych są kopiowane do obrazu wejść (I).' },
		{
			name: 'Wykonanie programu',
			text: 'Program czyta obraz wejść i zapisuje obraz wyjść (Q) — instrukcja po instrukcji.'
		},
		{
			name: 'Zapis wyjść',
			text: 'Obraz wyjść jest kopiowany na zaciski wyjściowe — dopiero teraz lampa się zmienia.'
		}
	];
	const SPEEDS = [
		{ label: 'bardzo wolno', ms: 1600 },
		{ label: 'wolno', ms: 600 },
		{ label: 'jak w PLC (~10 ms/cykl)', ms: 3.3 }
	];

	let speed = $state(0);
	let phase = $state(0);
	let progress = $state(0);
	let cycle = $state(1);
	let button = $state(false);
	let imageI = $state(false);
	let imageQ = $state(false);
	let lamp = $state(false);
	let paused = $state(false);
	/** Lines of the program executed so far in this cycle (0 … 2). */
	const executed = $derived(
		phase === 1 ? Math.min(2, Math.floor(progress * 3)) : phase === 2 ? 2 : 0
	);

	function endOfPhase() {
		if (phase === 0) imageI = button;
		if (phase === 1) imageQ = imageI;
		if (phase === 2) lamp = imageQ;
		phase = (phase + 1) % 3;
		if (phase === 0) cycle++;
		progress = 0;
	}

	onMount(() => {
		let prev = performance.now();
		let frame = 0;
		const loop = (now: number) => {
			const dt = Math.min(now - prev, 200);
			prev = now;
			if (!paused) {
				progress += dt / SPEEDS[speed].ms;
				while (progress >= 1) {
					progress -= 1;
					const carry = progress;
					endOfPhase();
					progress = carry;
				}
			}
			frame = requestAnimationFrame(loop);
		};
		frame = requestAnimationFrame(loop);
		return () => cancelAnimationFrame(frame);
	});

	const box =
		'flex flex-col items-center gap-2 rounded-lg border p-3 text-center text-xs transition-colors';
	const active = (p: number) =>
		phase === p ? 'border-sky-400 bg-sky-500/10' : 'border-slate-700 bg-slate-900';
	const led = (on: boolean) =>
		`size-4 rounded-full border-2 border-slate-600 ${on ? 'bg-emerald-400 shadow-[0_0_10px] shadow-emerald-400/70' : 'bg-slate-800'}`;
</script>

<figure class="space-y-4 rounded-lg border border-slate-700 bg-slate-950 p-4">
	<div class="flex flex-wrap items-center gap-2 text-xs">
		<span class="font-semibold tracking-wider text-sky-300 uppercase"
			>Cykl skanowania w zwolnionym tempie</span
		>
		<span class="ml-auto font-mono text-slate-500">cykl #{cycle}</span>
		<select
			class="rounded bg-slate-800 px-1 py-0.5 text-slate-200"
			bind:value={speed}
			aria-label="Tempo"
		>
			{#each SPEEDS as s, i (s.label)}<option value={i}>{s.label}</option>{/each}
		</select>
		<button
			class="rounded bg-slate-800 px-2 py-0.5 hover:bg-slate-700"
			onclick={() => (paused = !paused)}
		>
			{paused ? '▶ Start' : '❚❚ Pauza'}
		</button>
	</div>

	<!-- phase ring -->
	<ol class="grid grid-cols-3 gap-2">
		{#each PHASES as p, i (p.name)}
			<li
				class="rounded-md border px-3 py-2 {phase === i
					? 'border-sky-400 bg-sky-500/15'
					: 'border-slate-800 bg-slate-900'}"
			>
				<p class="text-xs font-semibold {phase === i ? 'text-sky-200' : 'text-slate-400'}">
					{i + 1}. {p.name}
				</p>
				<div class="mt-1.5 h-1 overflow-hidden rounded bg-slate-800">
					<div
						class="h-full bg-sky-400"
						style:width="{phase === i ? progress * 100 : phase > i ? 100 : 0}%"
					></div>
				</div>
			</li>
		{/each}
	</ol>
	<p class="min-h-10 text-sm text-slate-300">{PHASES[phase].text}</p>

	<div class="grid grid-cols-5 items-stretch gap-2">
		<div class="{box} border-slate-700 bg-slate-900">
			<span class="text-slate-400">Przycisk (zacisk I0.0)</span>
			<button
				class="size-12 rounded-full border-4 border-slate-600 select-none {button
					? 'scale-90 bg-emerald-400'
					: 'bg-emerald-700'}"
				aria-label="Wciśnij przycisk"
				aria-pressed={button}
				onpointerdown={(e) => {
					e.currentTarget.setPointerCapture(e.pointerId);
					button = true;
				}}
				onpointerup={() => (button = false)}
				onpointercancel={() => (button = false)}
			></button>
			<span class="font-mono text-slate-300">{button ? 1 : 0}</span>
		</div>
		<div class="{box} {active(0)}">
			<span class="text-slate-400">Obraz wejść I0.0</span>
			<span class={led(imageI)}></span>
			<span class="font-mono text-slate-300">{imageI ? 1 : 0}</span>
		</div>
		<div class="{box} {active(1)}">
			<span class="text-slate-400">Program</span>
			<code class="w-full rounded bg-slate-950 p-1.5 text-left font-mono text-[11px] leading-5">
				<span class={executed >= 1 && phase === 1 ? 'text-sky-300' : 'text-slate-400'}
					>LD Przycisk</span
				><br />
				<span class={executed >= 2 && phase === 1 ? 'text-sky-300' : 'text-slate-400'}
					>ST Lampa</span
				>
			</code>
		</div>
		<div class="{box} {active(1)}">
			<span class="text-slate-400">Obraz wyjść Q0.0</span>
			<span class={led(imageQ)}></span>
			<span class="font-mono text-slate-300">{imageQ ? 1 : 0}</span>
		</div>
		<div class="{box} {active(2)}">
			<span class="text-slate-400">Lampa (zacisk Q0.0)</span>
			<span
				class="size-10 rounded-full border-4 border-slate-600 {lamp
					? 'bg-amber-300 shadow-[0_0_18px] shadow-amber-300/80'
					: 'bg-slate-800'}"
			></span>
			<span class="font-mono text-slate-300">{lamp ? 1 : 0}</span>
		</div>
	</div>

	<figcaption class="text-xs text-slate-400">
		Wciśnij przycisk w trakcie fazy „Wykonanie programu” i obserwuj: program nadal widzi stary stan,
		bo czyta
		<b class="text-slate-200">obraz wejść</b>, a nie zacisk. Zmiana dotrze do lampy dopiero w
		kolejnym cyklu.
	</figcaption>
</figure>
