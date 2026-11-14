<script lang="ts">
	import { onMount } from 'svelte';
	import { newOven, newPid, onOff, pid, stepOven, type Oven, type PidState } from './physics.js';

	/** Which controller this figure starts with (the user can switch). */
	let { initial = 'onoff' }: { initial?: 'onoff' | 'pid' } = $props();

	type Mode = 'manual' | 'onoff' | 'pid';
	let mode = $state<Mode>('onoff');
	let sp = $state(120);
	let hyst = $state(6);
	let kp = $state(4);
	let ti = $state(60);
	let td = $state(0);
	let manual = $state(50);
	let speed = $state(10);
	let running = $state(true);

	const WINDOW = 600; // seconds shown
	const DT = 0.5;
	let oven: Oven = newOven();
	let pidState: PidState = newPid();
	let heaterOn = false;
	let t = $state(0);
	let samples = $state.raw<{ t: number; pv: number; sp: number; out: number }[]>([]);
	let last = $state({ pv: 20, out: 0, p: 0, i: 0, d: 0 });

	function reset() {
		oven = newOven();
		pidState = newPid();
		heaterOn = false;
		t = 0;
		samples = [];
		last = { pv: 20, out: 0, p: 0, i: 0, d: 0 };
	}

	function step() {
		let out: number;
		let parts = { p: 0, i: 0, d: 0 };
		if (mode === 'manual') out = manual;
		else if (mode === 'onoff') {
			heaterOn = onOff(oven.temp, sp, hyst, heaterOn);
			out = heaterOn ? 100 : 0;
		} else {
			const r = pid(pidState, oven.temp, sp, { kp, ti, td }, DT);
			pidState = r.state;
			out = r.out;
			parts = { p: r.p, i: r.i, d: r.d };
		}
		oven = stepOven(oven, out, DT);
		t += DT;
		last = { pv: oven.temp, out, ...parts };
		return { t, pv: oven.temp, sp, out };
	}

	let raf = 0;
	let prev = 0;
	function frame(now: number) {
		raf = requestAnimationFrame(frame);
		if (!prev) prev = now;
		const real = Math.min(0.1, (now - prev) / 1000);
		prev = now;
		if (!running) return;
		const n = Math.max(1, Math.round((real * speed) / DT));
		const fresh = Array.from({ length: n }, step);
		const keep = samples.filter((s) => s.t > t - WINDOW);
		samples = [...keep, ...fresh];
	}
	onMount(() => {
		mode = initial;
		raf = requestAnimationFrame(frame);
		return () => cancelAnimationFrame(raf);
	});

	// chart: 600 × 200, 0 … 250 °C and 0 … 100 %
	const W = 600;
	const H = 200;
	const x = (s: number) => ((s - Math.max(0, t - WINDOW)) / WINDOW) * W;
	const yT = (v: number) => H - (Math.min(250, Math.max(0, v)) / 250) * H;
	const yP = (v: number) => H - (v / 100) * H * 0.45;
	const line = (pick: (s: (typeof samples)[number]) => number, y: (v: number) => number) =>
		samples.map((s) => `${x(s.t).toFixed(1)},${y(pick(s)).toFixed(1)}`).join(' ');

	const MODES: [Mode, string][] = [
		['manual', 'ręcznie'],
		['onoff', 'dwustawna'],
		['pid', 'PID']
	];
	const pill = (on: boolean) =>
		`rounded px-2.5 py-1 text-xs ${on ? 'bg-sky-500 text-slate-950 font-semibold' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`;
	const slider = 'w-full accent-sky-500';
</script>

<figure class="space-y-3 rounded-lg border border-slate-700 bg-slate-950 p-4">
	<div class="flex flex-wrap items-center gap-2 text-xs">
		<span class="font-semibold tracking-wider text-sky-300 uppercase">Piec z grzałką</span>
		{#each MODES as [m, label] (m)}
			<button class={pill(mode === m)} aria-pressed={mode === m} onclick={() => (mode = m)}
				>{label}</button
			>
		{/each}
		<span class="ml-auto flex items-center gap-2">
			<button class={pill(false)} onclick={() => (running = !running)}
				>{running ? '❚❚ pauza' : '▶ dalej'}</button
			>
			<button class={pill(false)} onclick={reset}>↺ od nowa</button>
			<label class="flex items-center gap-1 text-slate-400"
				>tempo ×<select class="rounded bg-slate-800 text-slate-200" bind:value={speed}>
					{#each [5, 10, 20, 40] as v (v)}<option value={v}>{v}</option>{/each}
				</select></label
			>
		</span>
	</div>

	<svg
		viewBox="0 0 {W} {H + 20}"
		class="w-full rounded bg-slate-900"
		role="img"
		aria-label="Wykres temperatury i mocy grzałki"
	>
		{#each [50, 100, 150, 200] as g (g)}
			<line x1="0" x2={W} y1={yT(g)} y2={yT(g)} stroke="#1e293b" />
			<text x="4" y={yT(g) - 3} font-size="9" fill="#475569">{g} °C</text>
		{/each}
		<polyline
			points={line((s) => s.out, yP)}
			fill="none"
			stroke="#f59e0b"
			stroke-width="1.5"
			opacity="0.7"
		/>
		<polyline
			points={line((s) => s.sp, yT)}
			fill="none"
			stroke="#94a3b8"
			stroke-width="1.5"
			stroke-dasharray="6 4"
		/>
		{#if mode === 'onoff'}
			<polyline
				points={line((s) => s.sp + hyst / 2, yT)}
				fill="none"
				stroke="#475569"
				stroke-dasharray="2 4"
			/>
			<polyline
				points={line((s) => s.sp - hyst / 2, yT)}
				fill="none"
				stroke="#475569"
				stroke-dasharray="2 4"
			/>
		{/if}
		<polyline points={line((s) => s.pv, yT)} fill="none" stroke="#34d399" stroke-width="2" />
		<text x={W - 4} y={H + 14} text-anchor="end" font-size="9" fill="#64748b"
			>ostatnie {WINDOW / 60} min · t = {Math.round(t)} s</text
		>
		<text x="4" y={H + 14} font-size="9" fill="#34d399">— temperatura (PV)</text>
		<text x="110" y={H + 14} font-size="9" fill="#94a3b8">- - zadana (SP)</text>
		<text x="200" y={H + 14} font-size="9" fill="#f59e0b">— moc grzałki (0–100 %)</text>
	</svg>

	<div class="grid gap-x-6 gap-y-2 text-xs text-slate-300 sm:grid-cols-2">
		<label
			>Temperatura zadana SP: <b class="font-mono">{sp} °C</b>
			<input class={slider} type="range" min="40" max="200" bind:value={sp} />
		</label>
		{#if mode === 'manual'}
			<label
				>Moc grzałki: <b class="font-mono">{manual} %</b>
				<input class={slider} type="range" min="0" max="100" bind:value={manual} />
			</label>
		{:else if mode === 'onoff'}
			<label
				>Histereza: <b class="font-mono">{hyst} °C</b>
				<input class={slider} type="range" min="0" max="30" bind:value={hyst} />
			</label>
		{:else}
			<label
				>Wzmocnienie Kp: <b class="font-mono">{kp}</b>
				<input class={slider} type="range" min="0.5" max="20" step="0.5" bind:value={kp} />
			</label>
			<label
				>Czas całkowania Ti: <b class="font-mono">{ti === 0 ? 'wył.' : `${ti} s`}</b>
				<input class={slider} type="range" min="0" max="300" step="5" bind:value={ti} />
			</label>
			<label
				>Czas różniczkowania Td: <b class="font-mono">{td === 0 ? 'wył.' : `${td} s`}</b>
				<input class={slider} type="range" min="0" max="40" step="1" bind:value={td} />
			</label>
		{/if}
	</div>

	<p class="font-mono text-xs text-slate-400" role="status">
		PV = {last.pv.toFixed(1)} °C · uchyb e = SP − PV = {(sp - last.pv).toFixed(1)} °C · wyjście = {last.out.toFixed(
			0
		)} %
		{#if mode === 'pid'}
			<br />= P {last.p.toFixed(1)} + I {last.i.toFixed(1)} + D {last.d.toFixed(1)} (obcięte do 0…100
			%)
		{/if}
	</p>
</figure>
