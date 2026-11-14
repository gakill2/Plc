<script lang="ts">
	import { Handle, Position, type NodeProps } from '@xyflow/svelte';
	import { getCircuitView, terminalBit } from './context.js';
	import {
		DEVICES,
		MAIN,
		portSignal,
		portsOf,
		removeDevice,
		wireOf,
		type LampColor
	} from './model.js';

	let { data, selected }: NodeProps = $props();

	const view = getCircuitView();
	const dev = $derived(view.project.circuit.devices.find((d) => d.id === data.deviceId));
	const spec = $derived(dev ? DEVICES[dev.type] : null);
	const actuated = $derived(dev ? view.sim.isActuated(dev.id) : false);
	const position = $derived(dev ? view.sim.position(dev.id) : 0);
	const ports = $derived(dev ? portsOf(dev.type) : []);
	const deviceState = $derived({
		positions: view.sim.positions,
		output: (t: string) => terminalBit(view.snapshot?.outputs, t)
	});
	/** Signal on a port: input ports → sent to the PLC, output ports → driven by the PLC. */
	const portOn = (port: string, io: 'input' | 'output') => {
		if (!dev) return false;
		if (io === 'input')
			return portSignal(view.project.circuit, dev, port, view.sim.actuated, deviceState);
		const w = wireOf(view.project.circuit, dev.id, port);
		return w ? terminalBit(view.snapshot?.outputs, w.terminal) : false;
	};
	const on = $derived(spec ? portOn(MAIN, spec.io) : false);
	/** Contactor: the coil is energised, but the motor only runs if the overload has not tripped. */
	const running = $derived(dev?.type === 'contactor' ? on && !actuated : on);
	const POSITIONS = [
		{ value: -1, label: 'HAND' },
		{ value: 0, label: '0' },
		{ value: 1, label: 'AUTO' }
	];

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
			{:else if dev.type === 'selector'}
				<div
					class="flex flex-col items-center gap-1"
					role="group"
					aria-label="{dev.label} position"
				>
					<svg viewBox="0 0 48 48" class="size-9" aria-hidden="true">
						<circle cx="24" cy="24" r="20" fill="#1e293b" stroke="#475569" stroke-width="3" />
						<rect
							x="21"
							y="6"
							width="6"
							height="36"
							rx="3"
							fill="#e2e8f0"
							class="origin-center transition-transform"
							transform="rotate({position * 45} 24 24)"
						/>
					</svg>
					<div class="flex gap-0.5">
						{#each POSITIONS as p (p.value)}
							<button
								class="nodrag rounded px-1 font-mono text-[9px] {position === p.value
									? 'bg-emerald-500/25 text-emerald-200'
									: 'text-slate-400 hover:bg-slate-800'}"
								aria-label="{dev.label} {p.label}"
								aria-pressed={position === p.value}
								onclick={() => view.sim.setPosition(dev, p.value)}>{p.label}</button
							>
						{/each}
					</div>
				</div>
			{:else if dev.type === 'estop'}
				<button
					class="nodrag grid size-14 place-items-center rounded-md bg-amber-300"
					aria-label="Emergency stop {dev.label}"
					aria-pressed={actuated}
					title={actuated ? 'Locked — click to twist and release' : 'Click to press (it locks)'}
					onclick={() => view.sim.toggle(dev)}
				>
					<span
						class="block size-10 rounded-full border-2 border-red-900 bg-red-600 transition-transform {actuated
							? 'scale-90 shadow-inner brightness-90'
							: 'shadow-[0_3px_0_#7f1d1d]'}"
					></span>
				</button>
				<span class="ml-2 font-mono text-[9px] {actuated ? 'text-red-300' : 'text-slate-500'}"
					>{actuated ? 'LOCKED' : 'ready'}</span
				>
			{:else if dev.type === 'contactor'}
				<div class="flex items-center gap-2">
					<svg
						viewBox="0 0 40 48"
						class="h-12 w-10"
						role="img"
						aria-label="{dev.label} {actuated ? 'tripped' : on ? 'pulled in' : 'released'}"
					>
						<rect
							x="2"
							y="2"
							width="36"
							height="44"
							rx="3"
							fill="#1e293b"
							stroke="#475569"
							stroke-width="2"
						/>
						<rect
							x="8"
							y={on && !actuated ? 18 : 10}
							width="24"
							height="8"
							rx="1"
							fill={on && !actuated ? '#34d399' : '#64748b'}
							class="transition-all"
						/>
						<text x="20" y="40" text-anchor="middle" font-size="9" font-weight="bold" fill="#e2e8f0"
							>{dev.label.slice(0, 4)}</text
						>
					</svg>
					<div class="flex flex-col items-start gap-1">
						<span
							class="font-mono text-[9px] {running ? 'text-emerald-300' : 'text-slate-500'}"
							role="img"
							aria-label="{dev.label} {running ? 'running' : 'stopped'}"
							>M {running ? '⟳' : '■'}</span
						>
						<button
							class="nodrag rounded border px-1 text-[9px] {actuated
								? 'border-red-500/60 bg-red-500/20 text-red-200'
								: 'border-slate-700 text-slate-400 hover:bg-slate-800'}"
							title="Simulate the overload relay tripping (the motor stops, feedback drops)"
							aria-pressed={actuated}
							onclick={() => view.sim.toggle(dev)}>{actuated ? 'Reset trip' : 'Trip'}</button
						>
					</div>
				</div>
			{:else if dev.type === 'vfd'}
				{@const v = view.sim.vfd[dev.id]}
				{@const hz = v?.hz ?? 0}
				<div class="flex w-full items-center gap-2">
					<div
						class="flex-1 rounded border border-slate-600 bg-slate-950 px-1.5 py-1 font-mono"
						role="img"
						aria-label="{dev.label} {Math.abs(hz).toFixed(1)} Hz{v?.code ? ` ${v.code}` : ''}"
					>
						<div
							class="text-right text-base leading-none {v?.code
								? 'text-red-400'
								: 'text-emerald-300'}"
						>
							{v?.code
								? v.code.slice(0, 4)
								: `${hz < 0 ? '◀' : hz > 0 ? '▶' : ''} ${Math.abs(hz).toFixed(1)}`}
						</div>
						<div class="mt-0.5 flex justify-between text-[8px] text-slate-500">
							<span class={(v?.ready ?? true) ? 'text-emerald-400' : ''}>RDY</span>
							<span class={hz !== 0 ? 'text-emerald-400' : ''}>RUN</span>
							<span class={v?.fault ? 'text-red-400' : ''}>FLT</span>
							<span>Hz</span>
						</div>
					</div>
					<div class="flex flex-col items-center gap-1">
						<svg viewBox="0 0 24 24" class="size-6" aria-hidden="true">
							<circle
								cx="12"
								cy="12"
								r="10"
								fill="#1e293b"
								stroke={hz ? '#34d399' : '#475569'}
								stroke-width="2"
							/>
							<g
								class={hz ? 'origin-center animate-spin' : ''}
								style:animation-duration="{hz ? Math.max(0.15, 30 / Math.abs(hz)) : 0}s"
								style:animation-direction={hz < 0 ? 'reverse' : 'normal'}
							>
								<path d="M12 12 L12 4 A3 3 0 0 1 15 7 Z" fill={hz ? '#34d399' : '#64748b'} />
								<path
									d="M12 12 L12 4 A3 3 0 0 1 15 7 Z"
									fill={hz ? '#34d399' : '#64748b'}
									transform="rotate(180 12 12)"
								/>
							</g>
						</svg>
						<button
							class="nodrag rounded border border-slate-700 px-1 text-[9px] text-slate-400 hover:bg-slate-800"
							title="Simulate a drive fault (overcurrent). The PLC has to reset it."
							onclick={() => view.sim.tripVfd(dev)}>Trip</button
						>
					</div>
				</div>
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

		{#if dev.type === 'vfd'}
			<div class="mb-1 grid grid-cols-2 gap-1 text-[10px]">
				{#each [['aiWord', 'AI1 ← ', 'QW4'], ['aoWord', 'AO1 → ', 'IW4']] as const as [key, label, placeholder] (key)}
					<label class="flex items-center gap-0.5 text-slate-400">
						{label}<input
							class="nodrag w-12 rounded bg-slate-800 px-1 font-mono text-slate-200 disabled:opacity-70"
							value={dev[key] ?? ''}
							{placeholder}
							disabled={view.locked}
							aria-label="{dev.label} {key === 'aiWord' ? 'setpoint word' : 'speed word'}"
							oninput={(e) => (dev[key] = e.currentTarget.value.toUpperCase().trim())}
						/>
					</label>
				{/each}
			</div>
		{/if}
		<div class="flex items-center justify-between gap-1 text-[10px]">
			<div class="flex flex-col">
				{#each ports as port (port.id)}
					{@const w = wireOf(view.project.circuit, dev.id, port.id)}
					<span
						class="font-mono {w
							? portOn(port.id, port.io)
								? 'text-emerald-300'
								: 'text-slate-400'
							: 'text-amber-400'}"
					>
						{#if ports.length > 1}<span class="text-slate-500">{port.label}</span>{/if}
						{w ? `${port.io === 'input' ? '→' : '←'} ${w.terminal}` : 'not wired'}
					</span>
				{/each}
			</div>
			{#if spec.io === 'input' && dev.type !== 'selector'}
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

		{#each ports as port, i (port.id)}
			{@const outs = ports.filter((p) => p.io === 'output')}
			{@const ins = ports.filter((p) => p.io === 'input')}
			{#if port.io === 'input'}
				{@const k = ins.indexOf(port)}
				<Handle
					type="source"
					position={spec.io === 'input' ? Position.Right : Position.Bottom}
					id={port.id === MAIN ? 'out' : port.id}
					isConnectable={!view.locked}
					style={spec.io === 'input'
						? ports.length > 1
							? `top: ${35 + i * 30}%`
							: undefined
						: ins.length > 1
							? `left: ${25 + k * 25}%`
							: undefined}
					title={port.label}
					class="!size-3 !border-slate-900 !bg-sky-400"
				/>
			{:else}
				{@const k = outs.indexOf(port)}
				<Handle
					type="target"
					position={Position.Left}
					id={port.id === MAIN ? 'in' : port.id}
					isConnectable={!view.locked}
					style={outs.length > 1 ? `top: ${30 + k * 20}%` : undefined}
					title={port.label}
					class="!size-3 !border-slate-900 !bg-amber-400"
				/>
			{/if}
		{/each}
	</div>
{/if}
