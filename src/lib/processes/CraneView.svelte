<script lang="ts">
	import type { CraneState } from './types.js';

	type Props = {
		state: CraneState;
		command: (name: string, value?: unknown) => void;
		online: boolean;
	};
	let { state, command, online }: Props = $props();

	/** runway 0 … 10 m → 40 … 640 px */
	const px = (mm: number) => 40 + (mm / 10_000) * 600;
	const hookY = $derived(110 + state.hook * 150);
	const sway = $derived(state.hook > 0.05 ? Math.max(-14, Math.min(14, -state.v / 40)) : 0);
</script>

<div class="flex h-full flex-col items-center justify-center gap-4 p-6">
	<svg
		viewBox="0 0 680 320"
		class="w-full max-w-3xl"
		role="img"
		aria-label="Crane at {(state.x / 1000).toFixed(2)} m"
	>
		<!-- runway beam and buffers -->
		<rect x="30" y="70" width="620" height="14" fill="#475569" />
		<rect x="22" y="60" width="10" height="34" fill="#f59e0b" />
		<rect x="648" y="60" width="10" height="34" fill="#f59e0b" />
		<!-- limit switch zones -->
		<rect x={px(0)} y="88" width={px(150) - px(0)} height="4" fill="#f43f5e" opacity="0.7" />
		<rect
			x={px(9850)}
			y="88"
			width={px(10000) - px(9850)}
			height="4"
			fill="#f43f5e"
			opacity="0.7"
		/>
		<!-- scale -->
		{#each [0, 2, 4, 6, 8, 10] as m (m)}
			<line x1={px(m * 1000)} x2={px(m * 1000)} y1="300" y2="306" stroke="#64748b" />
			<text x={px(m * 1000)} y="318" text-anchor="middle" font-size="10" fill="#94a3b8">{m} m</text>
		{/each}
		<line x1="40" x2="640" y1="300" y2="300" stroke="#334155" />
		<!-- stations -->
		{#each [[2000, 'A'], [8000, 'B']] as [mm, name] (name)}
			<rect x={px(+mm) - 24} y="270" width="48" height="30" fill="#1e293b" stroke="#64748b" />
			<text x={px(+mm)} y="290" text-anchor="middle" font-size="12" fill="#cbd5e1">{name}</text>
		{/each}

		<!-- trolley -->
		<g transform="translate({px(state.x)} 0)">
			<rect
				x="-30"
				y="48"
				width="60"
				height="22"
				rx="4"
				fill={state.left || state.right ? '#10b981' : '#64748b'}
			/>
			<circle cx="-18" cy="72" r="5" fill="#cbd5e1" />
			<circle cx="18" cy="72" r="5" fill="#cbd5e1" />
			<text x="0" y="63" text-anchor="middle" font-size="10" font-weight="bold" fill="#0f172a"
				>{state.left ? '◀' : ''}{state.fast ? '⏩' : ''}{state.right ? '▶' : ''}</text
			>
			<line x1="0" y1="84" x2={sway} y2={hookY} stroke="#94a3b8" stroke-width="2" />
			<path d="M{sway - 8} {hookY} q8 14 16 0" fill="none" stroke="#e2e8f0" stroke-width="3" />
		</g>
		<line x1={px(state.x)} x2={px(state.x)} y1="296" y2="304" stroke="#38bdf8" stroke-width="3" />
	</svg>

	<div class="flex flex-wrap items-start gap-6 text-xs">
		<div class="space-y-1 font-mono">
			<p class="text-sky-300">IW4 Position = {Math.round(state.x)} mm</p>
			<p class="text-slate-400">prędkość {(state.v / 1000).toFixed(2)} m/s</p>
			<p class="text-slate-400">
				hak {state.hook <= 0.01 ? 'na górze' : state.hook >= 0.99 ? 'na dole' : 'w ruchu'}
			</p>
		</div>
		<div class="space-y-1">
			<p>
				Uderzenia w odbojnik: <b class={state.crashes ? 'text-red-300' : 'text-white'}
					>{state.crashes}</b
				>
			</p>
			<p>
				Jazda z opuszczonym hakiem: <b class={state.swings ? 'text-amber-300' : 'text-white'}
					>{state.swings}</b
				>
			</p>
			<p>
				Left + Right naraz: <b class={state.shorts ? 'text-red-300' : 'text-white'}
					>{state.shorts}</b
				>
			</p>
		</div>
		<div class="flex flex-wrap gap-2">
			<button
				class="rounded-md border border-slate-700 px-3 py-1.5 hover:border-slate-500 disabled:opacity-50"
				disabled={!online}
				onclick={() => command('hook', state.hook > 0.5 ? 0 : 1)}
				>{state.hook > 0.5 ? 'Podnieś hak (ręcznie)' : 'Opuść hak (ręcznie)'}</button
			>
			<button
				class="rounded-md border border-slate-700 px-3 py-1.5 hover:border-slate-500"
				onclick={() => command('clear')}>Wyzeruj liczniki</button
			>
		</div>
	</div>
	{#if state.lastFault}
		<p class="rounded bg-red-500/10 px-3 py-1.5 text-xs text-red-200" role="status">
			⚠ {state.lastFault}
		</p>
	{/if}
</div>
