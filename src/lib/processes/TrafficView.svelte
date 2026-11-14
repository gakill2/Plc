<script lang="ts">
	import type { TrafficState } from './types.js';

	let { state }: { state: TrafficState } = $props();

	const lamps = $derived([
		{ on: state.red, color: '#ef4444', label: 'Red Q0.0' },
		{ on: state.yellow, color: '#fbbf24', label: 'Yellow Q0.1' },
		{ on: state.green, color: '#22c55e', label: 'Green Q0.2' }
	]);
</script>

<div class="flex h-full items-center justify-center gap-16 p-8">
	<svg viewBox="0 0 120 320" class="h-80" role="img" aria-label="Traffic light">
		<rect x="40" y="250" width="40" height="70" fill="#334155" />
		<rect
			x="10"
			y="10"
			width="100"
			height="250"
			rx="18"
			fill="#0f172a"
			stroke="#475569"
			stroke-width="4"
		/>
		{#each lamps as lamp, i (lamp.label)}
			<circle
				cx="60"
				cy={55 + i * 78}
				r="30"
				fill={lamp.on ? lamp.color : '#1e293b'}
				style={lamp.on ? `filter: drop-shadow(0 0 14px ${lamp.color})` : ''}
			/>
		{/each}
	</svg>
	<ul class="space-y-2 font-mono text-sm">
		{#each lamps as lamp (lamp.label)}
			<li class="flex items-center gap-2 {lamp.on ? 'text-slate-100' : 'text-slate-500'}">
				<span class="size-3 rounded-full" style:background-color={lamp.on ? lamp.color : '#334155'}
				></span>
				{lamp.label}
			</li>
		{/each}
	</ul>
</div>
