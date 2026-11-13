<script lang="ts">
	import { Handle, Position, type NodeProps } from '@xyflow/svelte';
	import { getCircuitView, terminalBit } from './context.js';
	import { DEVICES, deviceSignal, removeDevice, wireOf, type LampColor } from './model.js';

	let { data, selected }: NodeProps = $props();

	const view = getCircuitView();
	const dev = $derived(view.project.circuit.devices.find((d) => d.id === data.deviceId));
	const spec = $derived(dev ? DEVICES[dev.type] : null);
	const wire = $derived(dev ? wireOf(view.project.circuit, dev.id) : undefined);
	const actuated = $derived(dev ? view.sim.isActuated(dev.id) : false);
	/** Input: the signal sent to the PLC. Output: whether the PLC drives this device. */
	const on = $derived.by(() => {
		if (!dev || !spec) return false;
		if (spec.io === 'input') return deviceSignal(dev, actuated);
		return wire ? terminalBit(view.snapshot?.outputs, wire.terminal) : false;
	});

	const COLORS: Record<LampColor, { fill: string; glow: string }> = {
		green: { fill: 'bg-emerald-400', glow: 'shadow-emerald-400/80' },
		red: { fill: 'bg-red-500', glow: 'shadow-red-500/80' },
		amber: { fill: 'bg-amber-300', glow: 'shadow-amber-300/80' },
		blue: { fill: 'bg-sky-400', glow: 'shadow-sky-400/80' }
	};
	const color = $derived(COLORS[dev?.color ?? (dev?.type === 'pushbutton' ? 'blue' : 'green')]);
</script>

{#if dev && spec}
	<div
		class="w-40 rounded-lg border bg-slate-900 p-2 text-slate-200 shadow-lg {selected
			? 'border-emerald-400'
			: 'border-slate-700'}"
	>
		<div class="mb-1 flex items-center justify-between gap-1">
			<input
				class="nodrag min-w-0 flex-1 rounded bg-transparent px-1 font-mono text-xs font-semibold outline-none hover:bg-slate-800 focus:bg-slate-800"
				value={dev.label}
				disabled={view.locked}
				aria-label="Device name"
				spellcheck="false"
				oninput={(e) => (dev.label = e.currentTarget.value.replace(/\s+/g, '_'))}
			/>
			{#if !view.locked}
				<button
					class="nodrag rounded px-1 text-xs text-slate-500 hover:bg-red-500/20 hover:text-red-300"
					title="Remove device"
					onclick={() => removeDevice(view.project.circuit, dev.id)}>×</button
				>
			{/if}
		</div>
		<div class="text-[10px] text-slate-500">{spec.name}{dev.nc ? ' · NC' : ''}</div>

		<div class="my-2 flex h-14 items-center justify-center">
			{#if dev.type === 'pushbutton'}
				<button
					class="nodrag size-12 rounded-full border-4 border-slate-600 transition-transform select-none {color.fill} {actuated
						? 'scale-90 brightness-125'
						: 'shadow-md'}"
					aria-label="Press {dev.label}"
					aria-pressed={actuated}
					onpointerdown={(e) => {
						e.currentTarget.setPointerCapture(e.pointerId);
						view.sim.press(dev);
					}}
					onpointerup={() => view.sim.release(dev)}
					onpointercancel={() => view.sim.release(dev)}
				></button>
			{:else if dev.type === 'switch'}
				<button
					class="nodrag relative h-12 w-12 rounded-full border-4 border-slate-600 bg-slate-800"
					aria-label="Turn {dev.label}"
					aria-pressed={actuated}
					onclick={() => view.sim.toggle(dev)}
				>
					<span
						class="absolute top-1/2 left-1/2 h-1.5 w-8 -translate-1/2 rounded bg-slate-200 transition-transform {actuated
							? 'rotate-45'
							: '-rotate-45'}"
					></span>
					<span class="absolute -bottom-4 left-0 font-mono text-[9px] text-slate-500">0</span>
					<span class="absolute -right-0 -bottom-4 font-mono text-[9px] text-slate-500">1</span>
				</button>
			{:else if dev.type === 'limit' || dev.type === 'sensor'}
				<button
					class="nodrag flex items-center gap-2 rounded border px-2 py-1 text-[11px] {actuated
						? 'border-emerald-500/60 bg-emerald-500/15 text-emerald-200'
						: 'border-slate-700 text-slate-400'}"
					aria-pressed={actuated}
					onclick={() => view.sim.toggle(dev)}
				>
					{#if dev.type === 'sensor'}
						<svg viewBox="0 0 24 24" class="size-6" aria-hidden="true">
							<rect x="2" y="8" width="10" height="8" rx="1" fill="#475569" />
							<path
								d="M14 9 q3 3 0 6 M17 7 q5 5 0 10"
								stroke="currentColor"
								fill="none"
								stroke-width="1.5"
							/>
						</svg>
						{actuated ? 'object' : 'clear'}
					{:else}
						<svg viewBox="0 0 24 24" class="size-6" aria-hidden="true">
							<rect x="4" y="12" width="16" height="8" rx="1" fill="#475569" />
							<line
								x1="12"
								y1="12"
								x2={actuated ? 20 : 18}
								y2={actuated ? 9 : 4}
								stroke="currentColor"
								stroke-width="2"
							/>
							<circle cx={actuated ? 20 : 18} cy={actuated ? 9 : 4} r="2" fill="currentColor" />
						</svg>
						{actuated ? 'hit' : 'free'}
					{/if}
				</button>
			{:else if dev.type === 'lamp'}
				<span
					class="size-10 rounded-full border-4 border-slate-600 transition-all {on
						? `${color.fill} shadow-[0_0_24px] ${color.glow}`
						: 'bg-slate-800'}"
					role="img"
					aria-label="{dev.label} {on ? 'on' : 'off'}"
				></span>
			{:else if dev.type === 'motor'}
				<svg
					viewBox="0 0 48 48"
					class="size-12"
					role="img"
					aria-label="{dev.label} {on ? 'running' : 'stopped'}"
				>
					<circle
						cx="24"
						cy="24"
						r="21"
						fill="#1e293b"
						stroke={on ? '#34d399' : '#475569'}
						stroke-width="3"
					/>
					<g class={on ? 'origin-center animate-spin [animation-duration:0.6s]' : ''}>
						{#each [0, 120, 240] as angle (angle)}
							<path
								d="M24 24 L24 8 A6 6 0 0 1 30 14 Z"
								fill={on ? '#34d399' : '#64748b'}
								transform="rotate({angle} 24 24)"
							/>
						{/each}
					</g>
					<text x="24" y="28" text-anchor="middle" font-size="10" font-weight="bold" fill="#e2e8f0"
						>M</text
					>
				</svg>
			{:else if dev.type === 'buzzer'}
				<svg
					viewBox="0 0 24 24"
					class="size-10 {on ? 'animate-pulse text-amber-300' : 'text-slate-500'}"
					role="img"
					aria-label="{dev.label} {on ? 'sounding' : 'silent'}"
				>
					<path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor" />
					{#if on}
						<path
							d="M16 8 q3 4 0 8 M19 5 q5 7 0 14"
							stroke="currentColor"
							fill="none"
							stroke-width="1.5"
						/>
					{/if}
				</svg>
			{/if}
		</div>

		<div class="flex items-center justify-between gap-1 text-[10px]">
			<span
				class="font-mono {wire ? (on ? 'text-emerald-300' : 'text-slate-400') : 'text-amber-400'}"
			>
				{wire ? `${spec.io === 'input' ? '→' : '←'} ${wire.terminal}` : 'not wired'}
			</span>
			{#if spec.io === 'input'}
				<label
					class="nodrag flex items-center gap-1 text-slate-400"
					title="Wire through the normally-closed contact"
				>
					<input
						type="checkbox"
						class="accent-emerald-500"
						checked={dev.nc ?? false}
						disabled={view.locked}
						onchange={(e) => (dev.nc = e.currentTarget.checked)}
					/>
					NC
				</label>
			{:else if dev.type === 'lamp'}
				<select
					class="nodrag rounded bg-slate-800 text-[10px] text-slate-300"
					value={dev.color ?? 'green'}
					aria-label="Lamp colour"
					onchange={(e) => (dev.color = e.currentTarget.value as LampColor)}
				>
					{#each Object.keys(COLORS) as c (c)}<option value={c}>{c}</option>{/each}
				</select>
			{/if}
		</div>

		{#if spec.io === 'input'}
			<Handle
				type="source"
				position={Position.Right}
				id="out"
				isConnectable={!view.locked}
				class="!size-3 !border-slate-900 !bg-sky-400"
			/>
		{:else}
			<Handle
				type="target"
				position={Position.Left}
				id="in"
				isConnectable={!view.locked}
				class="!size-3 !border-slate-900 !bg-amber-400"
			/>
		{/if}
	</div>
{/if}
