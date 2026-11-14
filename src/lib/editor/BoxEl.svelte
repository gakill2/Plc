<script lang="ts">
	import type { CmpOp, MathFn } from '#lib/engine/index.js';
	import { getLadderView } from '#lib/ladder/context.js';
	import type { Compare, CounterBox, MathBox, MoveBox, TimerBox } from '#lib/ladder/model.js';
	import { operandInput, wireColor } from './colors.js';
	import Selectable from './Selectable.svelte';

	type Props = { el: TimerBox | CounterBox | Compare | MoveBox | MathBox; inId: string | null };
	let { el, inId }: Props = $props();

	const view = getLadderView();
	const online = $derived(view.monitor !== null);
	const inPower = $derived(view.monitor?.power(inId) ?? false);
	const outPower = $derived(view.monitor?.power(el.id) ?? false);
	const CMP_OPS: CmpOp[] = ['==', '<>', '<', '>', '<=', '>='];
	const MATH_FNS: MathFn[] = ['ADD', 'SUB', 'MUL', 'DIV', 'MOD'];
	type IoKey = 'src' | 'a' | 'b' | 'dst';
	const ioFields: { key: IoKey; name: string }[] = $derived(
		el.kind === 'move'
			? [
					{ key: 'src', name: 'IN' },
					{ key: 'dst', name: 'OUT' }
				]
			: el.kind === 'math'
				? [
						{ key: 'a', name: 'IN1' },
						{ key: 'b', name: 'IN2' },
						{ key: 'dst', name: 'OUT' }
					]
				: []
	);

	const instanceAlias = $derived(
		view.doc.alias(el.kind === 'timer' ? el.timer : el.kind === 'counter' ? el.counter : '')
	);
	const title = $derived(
		el.kind === 'compare'
			? 'CMP'
			: el.kind === 'move'
				? 'MOVE'
				: el.kind === 'math'
					? el.fn
					: el.type
	);
	const timerState = $derived(el.kind === 'timer' ? view.monitor?.timer(el.timer) : null);
	const counterState = $derived(el.kind === 'counter' ? view.monitor?.counter(el.counter) : null);

	function formatMs(ms: number): string {
		return ms >= 1000 ? `${(ms / 1000).toFixed(ms % 1000 === 0 ? 0 : 2)} s` : `${ms} ms`;
	}

	const stop = (e: Event) => e.stopPropagation();
	const field = 'grid grid-cols-[2rem_1fr] items-center gap-1';
	const label = 'text-[10px] font-semibold text-slate-500';
</script>

<Selectable id={el.id} label="{title} box" class="w-40 pb-2">
	<!-- wire stubs at y = 32 -->
	<div
		class="absolute top-[31px] left-0 h-0.5 w-3"
		style:background-color={wireColor(online, inPower)}
	></div>
	<div
		class="absolute top-[31px] right-0 h-0.5 w-3"
		style:background-color={wireColor(online, outPower)}
	></div>

	<div
		class="mx-3 mt-3 space-y-1 rounded border-2 bg-slate-950 px-1.5 py-1 transition-colors"
		style:border-color={online ? (outPower ? '#34d399' : '#475569') : '#64748b'}
	>
		<div class="flex items-center justify-between gap-1">
			{#if el.kind !== 'math'}
				<span class="font-mono text-xs font-bold text-slate-200">{title}</span>
			{/if}
			{#if el.kind === 'timer'}
				<input
					list={view.listId}
					class="{operandInput} w-14"
					value={el.timer}
					disabled={view.locked}
					aria-label="Timer"
					oninput={(e) => view.doc.update(el, { timer: e.currentTarget.value })}
					onclick={stop}
				/>
			{:else if el.kind === 'math'}
				<select
					class="rounded bg-slate-800 px-0.5 font-mono text-xs text-slate-100 disabled:opacity-70"
					value={el.fn}
					disabled={view.locked}
					aria-label="Function"
					onchange={(e) => view.doc.update(el, { fn: e.currentTarget.value as MathFn })}
					onclick={stop}
				>
					{#each MATH_FNS as fn (fn)}<option value={fn}>{fn}</option>{/each}
				</select>
			{:else if el.kind === 'counter'}
				<input
					list={view.listId}
					class="{operandInput} w-14"
					value={el.counter}
					disabled={view.locked}
					aria-label="Counter"
					oninput={(e) => view.doc.update(el, { counter: e.currentTarget.value })}
					onclick={stop}
				/>
			{/if}
		</div>

		{#if instanceAlias}
			<div class="-mt-1 text-right font-mono text-[10px] text-sky-300/80">{instanceAlias}</div>
		{/if}
		{#if el.kind === 'timer'}
			<label class={field}>
				<span class={label}>PT</span>
				<input
					list={view.listId}
					class="{operandInput} text-left"
					value={el.pt}
					disabled={view.locked}
					oninput={(e) => view.doc.update(el, { pt: e.currentTarget.value })}
					onclick={stop}
				/>
			</label>
			<div class={field}>
				<span class={label}>ET</span>
				<span class="px-1 font-mono text-xs text-amber-300">
					{timerState ? formatMs(timerState.et) : '–'}
				</span>
			</div>
		{:else if el.kind === 'counter'}
			<label class={field}>
				<span class={label}>PV</span>
				<input
					list={view.listId}
					class="{operandInput} text-left"
					value={el.pv}
					disabled={view.locked}
					oninput={(e) => view.doc.update(el, { pv: e.currentTarget.value })}
					onclick={stop}
				/>
			</label>
			<label class={field}>
				<span class={label}>{el.type === 'CTU' ? 'R' : 'LD'}</span>
				<input
					list={view.listId}
					class="{operandInput} text-left"
					value={el.reset}
					placeholder="—"
					disabled={view.locked}
					oninput={(e) => view.doc.update(el, { reset: e.currentTarget.value })}
					onclick={stop}
				/>
			</label>
			<div class={field}>
				<span class={label}>CV</span>
				<span class="px-1 font-mono text-xs text-amber-300">{counterState?.cv ?? '–'}</span>
			</div>
		{:else if el.kind === 'move' || el.kind === 'math'}
			{#each ioFields as { key, name } (key)}
				{@const text = (el as unknown as Record<IoKey, string>)[key]}
				<label class={field}>
					<span class={label}>{name}</span>
					<input
						list={view.listId}
						class="{operandInput} text-left"
						value={text}
						disabled={view.locked}
						aria-label="{title} {name}"
						oninput={(e) =>
							view.doc.update(el, { [key]: e.currentTarget.value } as Partial<typeof el>)}
						onclick={stop}
					/>
				</label>
				{#if view.monitor && key === 'dst'}
					<div class="-mt-1 text-right font-mono text-[10px] text-amber-300">
						= {view.monitor.number(text) ?? '–'}
					</div>
				{/if}
			{/each}
		{:else}
			<div class="flex items-center gap-1">
				<input
					list={view.listId}
					class="{operandInput} min-w-0"
					value={el.a}
					disabled={view.locked}
					aria-label="Left operand"
					oninput={(e) => view.doc.update(el, { a: e.currentTarget.value })}
					onclick={stop}
				/>
				<select
					class="rounded bg-slate-800 px-0.5 font-mono text-xs text-slate-100 disabled:opacity-70"
					value={el.cmp}
					disabled={view.locked}
					aria-label="Comparison"
					onchange={(e) => view.doc.update(el, { cmp: e.currentTarget.value as CmpOp })}
					onclick={stop}
				>
					{#each CMP_OPS as op (op)}<option value={op}>{op}</option>{/each}
				</select>
				<input
					list={view.listId}
					class="{operandInput} min-w-0"
					value={el.b}
					disabled={view.locked}
					aria-label="Right operand"
					oninput={(e) => view.doc.update(el, { b: e.currentTarget.value })}
					onclick={stop}
				/>
			</div>
			{#if view.monitor}
				<div class="text-center font-mono text-[10px] text-amber-300">
					{view.monitor.number(el.a) ?? el.a}
					{el.cmp}
					{view.monitor.number(el.b) ?? el.b}
				</div>
			{/if}
		{/if}
	</div>
</Selectable>
