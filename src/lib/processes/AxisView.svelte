<script lang="ts">
	import type { AxisState } from './types.js';
	import { AXIS_ERRORS } from './axis.js';

	type Props = {
		state: AxisState;
		command: (name: string, value?: unknown) => void;
		online: boolean;
	};
	let { state, command, online }: Props = $props();

	/** rail 0 … 1040 mm (physical) → 40 … 640 px */
	const px = (mm: number) => 40 + (mm / 1040) * 600;
	const MODES = [
		'Disabled',
		'Standstill',
		'Homing',
		'DiscreteMotion',
		'ContinuousMotion',
		'Stopping',
		'ErrorStop'
	];
	const offset = $derived(state.physical - state.position);
</script>

<div class="flex h-full flex-col items-center justify-center gap-4 p-6">
	<svg
		viewBox="0 0 680 260"
		class="w-full max-w-3xl"
		role="img"
		aria-label="Axis at {state.homed ? state.position.toFixed(1) : '?'} mm, {state.mode}"
	>
		<!-- rail, reference switch, limit switches -->
		<rect x="36" y="150" width="608" height="12" rx="3" fill="#475569" />
		<rect x={px(0) - 4} y="128" width="8" height="34" fill="#f43f5e" />
		<rect x={px(1040) - 4} y="128" width="8" height="34" fill="#f43f5e" />
		<rect x={px(20) - 3} y="164" width="6" height="12" fill="#38bdf8" />
		<text x={px(20)} y="190" text-anchor="middle" font-size="9" fill="#7dd3fc">REF</text>
		<!-- stations (axis coordinates, shown once homed) -->
		{#each [[100, 'odbiór'], [800, 'odkładanie']] as [mm, name] (name)}
			<rect
				x={px(+mm + (state.homed ? offset : 20)) - 26}
				y="200"
				width="52"
				height="22"
				fill="#1e293b"
				stroke="#64748b"
			/>
			<text
				x={px(+mm + (state.homed ? offset : 20))}
				y="215"
				text-anchor="middle"
				font-size="10"
				fill="#cbd5e1">{name} {mm}</text
			>
		{/each}
		{#if state.partAtPick}
			<rect
				x={px(100 + (state.homed ? offset : 20)) - 9}
				y="182"
				width="18"
				height="18"
				fill="#f59e0b"
			/>
		{/if}
		<!-- carriage and gripper -->
		<g transform="translate({px(state.physical)} 0)">
			<rect
				x="-28"
				y="118"
				width="56"
				height="30"
				rx="4"
				fill={state.mode === 'ErrorStop'
					? '#dc2626'
					: state.mode === 'Disabled'
						? '#475569'
						: '#0ea5e9'}
			/>
			<line x1="0" x2="0" y1="148" y2="170" stroke="#cbd5e1" stroke-width="3" />
			<line
				x1={state.gripper ? -6 : -12}
				x2={state.gripper ? -6 : -12}
				y1="168"
				y2="182"
				stroke="#cbd5e1"
				stroke-width="3"
			/>
			<line
				x1={state.gripper ? 6 : 12}
				x2={state.gripper ? 6 : 12}
				y1="168"
				y2="182"
				stroke="#cbd5e1"
				stroke-width="3"
			/>
			{#if state.holding}<rect x="-8" y="174" width="16" height="16" fill="#f59e0b" />{/if}
		</g>
		<!-- scale (axis coordinates) -->
		{#each [0, 200, 400, 600, 800, 1000] as mm (mm)}
			<line x1={px(mm + 20)} x2={px(mm + 20)} y1="240" y2="246" stroke="#64748b" />
			<text x={px(mm + 20)} y="257" text-anchor="middle" font-size="9" fill="#94a3b8">{mm}</text>
		{/each}
		<!-- PLCopen state -->
		{#each MODES as m, i (m)}
			<rect
				x={20 + i * 92}
				y="14"
				width="88"
				height="22"
				rx="4"
				fill={state.mode === m ? (m === 'ErrorStop' ? '#dc2626' : '#0284c7') : '#1e293b'}
			/>
			<text x={64 + i * 92} y="29" text-anchor="middle" font-size="9" fill="#e2e8f0">{m}</text>
		{/each}
	</svg>

	<div class="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4" aria-live="polite">
		<span class="text-slate-400">pozycja</span>
		<span class="font-mono text-white" data-testid="axis-pos"
			>{state.homed ? `${state.position.toFixed(2)} mm` : 'niezbazowana'}</span
		>
		<span class="text-slate-400">prędkość</span>
		<span class="font-mono text-white">{state.velocity.toFixed(0)} mm/s</span>
		<span class="text-slate-400">odłożone</span>
		<span class="font-mono text-emerald-300">{state.delivered}</span>
		<span class="text-slate-400">upuszczone</span>
		<span class="font-mono {state.dropped ? 'text-red-300' : 'text-slate-300'}"
			>{state.dropped}</span
		>
	</div>
	{#if state.errorId}
		<p class="text-sm text-red-300" role="status">
			ErrorID {state.errorId}: {AXIS_ERRORS[state.errorId]}{state.rejected
				? ' (polecenie odrzucone)'
				: ''}
		</p>
	{/if}
	{#if state.lastEvent}<p class="text-xs text-slate-400">{state.lastEvent}</p>{/if}
	<button
		class="rounded border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-50"
		disabled={!online}
		onclick={() => command('clear')}>wyzeruj liczniki</button
	>
</div>
