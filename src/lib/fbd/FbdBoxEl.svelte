<script lang="ts">
	import { operandInput as baseInput, wireColor } from '#lib/editor/colors.js';
	/** the shared operand style, with a width of its own */
	const operandInput = baseInput.replace('w-full ', '');
	import { getFbdEditor, type Slot } from './context.js';
	import { findType, operand, type FbdBox, type FbdPin } from './fbd.js';
	import FbdBoxEl from './FbdBoxEl.svelte';

	type Props = { box: FbdBox; slot: Slot };
	let { box, slot }: Props = $props();

	const ctx = getFbdEditor();
	const type = $derived(findType(ctx.types, box.type));
	const flagged = $derived(ctx.flagged.includes(box.id));
	const out = $derived(ctx.signal(box.id));

	const pinValue = (p: FbdPin) =>
		p.value.kind === 'box' ? ctx.signal(p.value.box.id) : ctx.valueOf(p.value.text);
	const isOn = (v: boolean | number | null) => v === true || (typeof v === 'number' && v !== 0);
	const bool = (p: FbdPin) => type?.inputs.find((x) => x.name === p.name)?.bool ?? true;
	const show = (v: boolean | number | null) =>
		typeof v === 'number' ? (Number.isInteger(v) ? String(v) : v.toFixed(2)) : '';

	function addInput() {
		box.inputs.push({ name: `IN${box.inputs.length + 1}`, value: operand() });
	}
	function remove() {
		slot.value = box.inputs[0]?.value ?? operand();
		ctx.select(null);
	}
	const stop = (e: Event) => e.stopPropagation();
</script>

<div
	class="grid shrink-0 grid-cols-[auto_0.9rem_auto_0.9rem] items-center"
	style:grid-template-rows="auto repeat({box.inputs.length + Object.keys(box.outputs).length},
	minmax(1.9rem, auto))"
>
	<!-- header -->
	<div></div>
	<div></div>
	<div
		class="flex items-center gap-1 rounded-t border-2 border-b-0 bg-slate-950 px-1.5 pt-0.5 {flagged
			? 'border-red-500'
			: ctx.selected === slot
				? 'border-sky-400'
				: 'border-slate-500'}"
	>
		<button
			class="font-mono text-xs font-bold text-violet-300"
			title={type?.title ?? box.type}
			aria-label="Blok {box.type}"
			onclick={() => ctx.select(slot)}>{type?.label ?? box.type}</button
		>
		{#if type?.instance}
			<input
				class="{operandInput} w-20 text-left text-[11px] text-sky-200"
				value={box.instance ?? ''}
				disabled={ctx.readOnly}
				aria-label="Instancja {box.type}"
				title="Instancja — własna pamięć tego bloku"
				oninput={(e) => (box.instance = e.currentTarget.value.trim())}
			/>
		{/if}
		{#if !ctx.readOnly}
			<span class="ml-auto flex gap-0.5">
				{#if type?.variadic}
					<button
						class="rounded px-1 text-[11px] text-slate-400 hover:bg-slate-800"
						title="Dodaj wejście"
						aria-label="Dodaj wejście do {box.type}"
						onclick={addInput}>+</button
					>
				{/if}
				<button
					class="rounded px-1 text-[11px] text-slate-500 hover:bg-slate-800 hover:text-red-300"
					title="Usuń blok (zostaje jego pierwsze wejście)"
					aria-label="Usuń blok {box.type}"
					onclick={remove}>×</button
				>
			</span>
		{/if}
	</div>
	<div class="col-start-4 row-span-full flex h-full items-center self-stretch">
		<div
			class="h-0.5 w-full"
			style:background-color={wireColor(ctx.online, isOn(out))}
			title={show(out)}
		></div>
	</div>

	<!-- input pins -->
	{#each box.inputs as pin, i (i)}
		{@const v = pinValue(pin)}
		<div class="flex items-center justify-end py-0.5">
			{#if pin.value.kind === 'box'}
				<FbdBoxEl box={pin.value.box} slot={pin} />
			{:else}
				{@const op = pin.value}
				<input
					class="{operandInput} w-24 text-right {ctx.selected === pin
						? 'border-sky-400!'
						: ''} {flagged && !op.text.trim() ? 'border-red-500!' : ''}"
					value={op.text}
					placeholder="…"
					list="fbd-names"
					disabled={ctx.readOnly}
					aria-label="{box.type} {pin.name}"
					onfocus={() => ctx.select(pin)}
					oninput={(e) => (op.text = e.currentTarget.value)}
				/>
				{#if ctx.online && typeof v === 'number' && !bool(pin)}
					<span class="ml-1 font-mono text-[10px] text-sky-300">{show(v)}</span>
				{/if}
			{/if}
		</div>
		<div class="relative flex h-full items-center">
			<div class="h-0.5 w-full" style:background-color={wireColor(ctx.online, isOn(v))}></div>
			{#if pin.negated}
				<span
					class="absolute -right-1 h-2 w-2 rounded-full border-2 bg-slate-950"
					style:border-color={wireColor(ctx.online, isOn(v))}
					title="Negacja"
				></span>
			{/if}
		</div>
		<button
			class="h-full border-x-2 bg-slate-950 px-1.5 text-left font-mono text-[10px] font-semibold {flagged
				? 'border-red-500'
				: ctx.selected === slot
					? 'border-sky-400'
					: 'border-slate-500'} {ctx.selected === pin ? 'text-sky-300' : 'text-slate-500'} {i ===
				box.inputs.length - 1 && !Object.keys(box.outputs).length
				? 'rounded-b border-b-2'
				: ''}"
			onclick={(e) => {
				stop(e);
				ctx.select(pin);
			}}
			aria-label="Wejście {pin.name} bloku {box.type}">{pin.name}</button
		>
	{/each}

	<!-- extra outputs: ET, CV, OUT … -->
	{#each Object.keys(box.outputs) as name, i (name)}
		<div></div>
		<div></div>
		<label
			class="flex h-full items-center justify-end gap-1 border-x-2 bg-slate-950 px-1.5 {flagged
				? 'border-red-500'
				: ctx.selected === slot
					? 'border-sky-400'
					: 'border-slate-500'} {i === Object.keys(box.outputs).length - 1
				? 'rounded-b border-b-2'
				: ''}"
		>
			<span class="font-mono text-[10px] font-semibold text-slate-500">{name} →</span>
			<input
				class="{operandInput} w-20 text-left"
				value={box.outputs[name]}
				placeholder="(nic)"
				list="fbd-names"
				disabled={ctx.readOnly}
				aria-label="{box.type} {name}"
				oninput={(e) => (box.outputs[name] = e.currentTarget.value)}
			/>
		</label>
	{/each}
</div>
