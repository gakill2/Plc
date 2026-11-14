<script lang="ts">
	import type { ConveyorState } from './types.js';

	type Props = {
		state: ConveyorState;
		command: (name: string, value?: unknown) => void;
		online: boolean;
	};
	let { state, command, online }: Props = $props();

	// 2 m of belt → 500 px
	const X0 = 60;
	const SCALE = 250;
	const BELT_Y = 150;
	const px = (m: number) => X0 + m * SCALE;
</script>

<div class="flex h-full flex-col items-center justify-center gap-6 p-6">
	<svg viewBox="0 0 640 260" class="w-full max-w-3xl" role="img" aria-label="Sorting conveyor">
		<!-- reject bin -->
		<rect
			x={px(1.1)}
			y="16"
			width={px(1.4) - px(1.1)}
			height="40"
			fill="#1e293b"
			stroke="#475569"
		/>
		<text x={(px(1.1) + px(1.4)) / 2} y="40" text-anchor="middle" font-size="11" fill="#94a3b8"
			>rejects {state.rejected}</text
		>

		<!-- pusher (from below the belt) -->
		<rect
			x={px(1.15)}
			y={BELT_Y + 40 - state.pusher * 80}
			width={px(1.35) - px(1.15)}
			height="14"
			fill={state.pusher > 0 ? '#f472b6' : '#475569'}
		/>
		<text x={px(1.25)} y={BELT_Y + 72} text-anchor="middle" font-size="10" fill="#94a3b8"
			>Pusher Q0.1</text
		>

		<!-- belt -->
		<rect x={px(0)} y={BELT_Y} width={px(2) - px(0)} height="18" rx="9" fill="#334155" />
		<line
			x1={px(0)}
			x2={px(2)}
			y1={BELT_Y + 9}
			y2={BELT_Y + 9}
			stroke={state.belt ? '#34d399' : '#64748b'}
			stroke-dasharray="10 8"
			stroke-width="2"
			class={state.belt ? 'belt-moving' : ''}
		/>
		<text x={px(0)} y={BELT_Y + 40} font-size="10" fill="#94a3b8"
			>Belt Q0.0 {state.belt ? '▶' : '■'}</text
		>

		<!-- delivered -->
		<rect x={px(2) + 10} y={BELT_Y - 10} width="50" height="50" fill="#1e293b" stroke="#475569" />
		<text x={px(2) + 35} y={BELT_Y + 20} text-anchor="middle" font-size="12" fill="#e2e8f0"
			>{state.delivered}</text
		>

		<!-- sensors -->
		{#each [{ m: 0.2, on: state.sensors.entry, name: 'Entry I0.0' }, { m: 1.25, on: state.sensors.tall, name: 'Tall I0.2', high: true }, { m: 1.9, on: state.sensors.end, name: 'End I0.1' }] as s (s.name)}
			<circle
				cx={px(s.m)}
				cy={s.high ? 78 : 112}
				r="6"
				fill={s.on ? '#34d399' : '#334155'}
				stroke="#64748b"
			/>
			<line
				x1={px(s.m)}
				x2={px(s.m)}
				y1={s.high ? 84 : 118}
				y2={BELT_Y}
				stroke={s.on ? '#34d399' : '#334155'}
				stroke-dasharray="2 3"
			/>
			<text x={px(s.m)} y={s.high ? 70 : 104} text-anchor="middle" font-size="10" fill="#94a3b8"
				>{s.name}</text
			>
		{/each}

		<!-- boxes -->
		{#each state.boxes as b (b.id)}
			{@const h = b.tall ? 44 : 24}
			<rect
				x={px(b.x) - 16}
				y={BELT_Y - h}
				width="32"
				height={h}
				rx="2"
				fill={b.tall ? '#a78bfa' : '#fbbf24'}
				stroke="#0f172a"
			/>
		{/each}
	</svg>

	<div class="flex flex-wrap items-center justify-center gap-2 text-xs">
		<button
			class="rounded bg-slate-800 px-3 py-1 hover:bg-slate-700"
			onclick={() => command('spawn', { tall: false })}
		>
			+ Short box
		</button>
		<button
			class="rounded bg-slate-800 px-3 py-1 hover:bg-slate-700"
			onclick={() => command('spawn', { tall: true })}
		>
			+ Tall box
		</button>
		<label class="flex items-center gap-1.5 rounded bg-slate-800 px-3 py-1">
			<input
				type="checkbox"
				class="accent-emerald-500"
				checked={state.autoFeed}
				onchange={(e) => command('autoFeed', e.currentTarget.checked)}
			/>
			Auto feed
		</label>
		<button
			class="rounded bg-slate-800 px-3 py-1 hover:bg-slate-700"
			onclick={() => command('clear')}>Clear</button
		>
		<span class="ml-2 font-mono text-slate-400">
			delivered {state.delivered} · rejected {state.rejected}
			{#if state.wrongRejected || state.missedTall}
				<span class="text-red-400">· mistakes {state.wrongRejected + state.missedTall}</span>
			{/if}
		</span>
	</div>
	{#if !online}<p class="text-xs text-slate-500">The plant runs while the PLC is in RUN.</p>{/if}
</div>

<style>
	.belt-moving {
		animation: belt 0.6s linear infinite;
	}
	@keyframes belt {
		to {
			stroke-dashoffset: -18;
		}
	}
</style>
