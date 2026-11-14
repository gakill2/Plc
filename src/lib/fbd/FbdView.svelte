<script lang="ts">
	import type { Snippet } from 'svelte';
	import { operandInput as baseInput, wireColor } from '#lib/editor/colors.js';
	/** the shared operand style, with a width of its own */
	const operandInput = baseInput.replace('w-full ', '');
	import { setFbdEditor, type Slot } from './context.js';
	import {
		fbdNetwork,
		freeInstance,
		newBox,
		operand,
		type BoxGroup,
		type BoxType,
		type Fbd,
		type FbdAssign,
		type FbdBox,
		type FbdNetwork
	} from './fbd.js';
	import { newId } from '#lib/ladder/model.js';
	import FbdBoxEl from './FbdBoxEl.svelte';

	type Props = {
		fbd: Fbd;
		types: BoxType[];
		readOnly: boolean;
		online: boolean;
		/** diagnostic ids of the compiled program (`fbd:<id>`) */
		problemIds: string[];
		generated: string;
		/** names for the operand autocompletion */
		names: string[];
		valueOf: (text: string) => boolean | number | null;
		signal: (boxId: string) => boolean | number | null;
		header: Snippet;
	};
	let {
		fbd,
		types,
		readOnly,
		online,
		problemIds,
		generated,
		names,
		valueOf,
		signal,
		header
	}: Props = $props();

	let showSt = $state(false);
	let selected: Slot | null = $state(null);
	const flagged = $derived(problemIds.filter((p) => p.startsWith('fbd:')).map((p) => p.slice(4)));

	setFbdEditor({
		get types() {
			return types;
		},
		get readOnly() {
			return readOnly;
		},
		get online() {
			return online;
		},
		get flagged() {
			return flagged;
		},
		get selected() {
			return selected;
		},
		select: (s) => (selected = s),
		valueOf: (t) => valueOf(t),
		signal: (id) => signal(id)
	});

	const GROUPS: { group: BoxGroup; label: string }[] = [
		{ group: 'logic', label: 'Logika' },
		{ group: 'compare', label: 'Porównanie' },
		{ group: 'math', label: 'Arytmetyka' },
		{ group: 'move', label: 'Przepisanie' },
		{ group: 'timer', label: 'Czasy' },
		{ group: 'counter', label: 'Liczniki' },
		{ group: 'memory', label: 'Pamięć i zbocza' },
		{ group: 'fb', label: 'Bloki FB' }
	];

	/** Puts a new box into the selected input; what was there becomes the box's first input. */
	function insert(t: BoxType) {
		const slot = selected ?? fbd.networks.at(-1);
		if (!slot) return;
		const prefix = t.instance;
		const b = newBox(t, prefix ? freeInstance(fbd, prefix) : undefined, slot.value);
		slot.value = { kind: 'box', box: b };
		selected = b.inputs[1] ?? b.inputs[0] ?? null;
	}

	/** The pin that is selected — when the selection is an input of a box. */
	const selectedPin = $derived.by(() => {
		if (!selected || !('name' in selected)) return null;
		return selected as Slot & { name: string };
	});
	const parentOf = (slot: Slot) => {
		const walk = (s: Slot): { box: FbdBox } | null => {
			if (s.value.kind !== 'box') return null;
			if (s.value.box.inputs.includes(slot as never)) return { box: s.value.box };
			for (const p of s.value.box.inputs) {
				const r = walk(p);
				if (r) return r;
			}
			return null;
		};
		for (const n of fbd.networks) {
			const r = walk(n);
			if (r) return r.box;
		}
		return null;
	};
	const canRemovePin = $derived.by(() => {
		if (!selectedPin) return false;
		const b = parentOf(selectedPin);
		const t = b && types.find((x) => x.type === b.type);
		return !!b && !!t?.variadic && b.inputs.length > 2;
	});

	function negate() {
		if (selectedPin) selectedPin.negated = !selectedPin.negated;
	}
	function removePin() {
		if (!selectedPin) return;
		const b = parentOf(selectedPin);
		if (!b) return;
		b.inputs.splice(b.inputs.indexOf(selectedPin as never), 1);
		b.inputs.forEach((p, i) => (p.name = `IN${i + 1}`));
		selected = null;
	}

	function addNetwork(after?: FbdNetwork) {
		const n = fbdNetwork(operand(), [['=', '']]);
		const at = after ? fbd.networks.indexOf(after) + 1 : fbd.networks.length;
		fbd.networks.splice(at, 0, n);
		selected = n;
	}
	function removeNetwork(n: FbdNetwork) {
		fbd.networks.splice(fbd.networks.indexOf(n), 1);
		selected = null;
	}
	function move(n: FbdNetwork, by: number) {
		const i = fbd.networks.indexOf(n);
		const j = i + by;
		if (j < 0 || j >= fbd.networks.length) return;
		[fbd.networks[i], fbd.networks[j]] = [fbd.networks[j], fbd.networks[i]];
	}
	const NEXT: Record<FbdAssign, FbdAssign> = { '=': 'S', S: 'R', R: '=' };
	const isOn = (v: boolean | number | null) => v === true || (typeof v === 'number' && v !== 0);
	const rootValue = (n: FbdNetwork) =>
		n.value.kind === 'box' ? signal(n.value.box.id) : valueOf(n.value.text);
</script>

<datalist id="fbd-names">
	{#each names as n (n)}<option value={n}></option>{/each}
</datalist>

<div class="flex h-full flex-col" lang="pl">
	<div class="flex flex-wrap items-center gap-3 border-b border-slate-800 px-4 py-2">
		{@render header()}
		<span class="text-[11px] text-slate-500">
			Zaznacz wejście (pole operandu albo nazwę pinu) i kliknij blok — wstawi się w to miejsce
		</span>
		<button class="ml-auto text-[11px] text-slate-400 underline" onclick={() => (showSt = !showSt)}
			>{showSt ? 'Ukryj' : 'Pokaż'} wygenerowany ST</button
		>
	</div>

	{#if !readOnly}
		<div
			class="flex flex-wrap items-start gap-x-4 gap-y-1 border-b border-slate-800 px-4 py-2"
			role="toolbar"
			aria-label="Bloki FBD"
		>
			{#each GROUPS as g (g.group)}
				{@const list = types.filter((t) => t.group === g.group)}
				{#if list.length}
					<div class="flex flex-wrap items-center gap-1">
						<span class="text-[10px] font-semibold tracking-wider text-slate-500 uppercase"
							>{g.label}</span
						>
						{#each list as t (t.type)}
							<button
								class="rounded border border-slate-700 bg-slate-900 px-1.5 py-0.5 font-mono text-[11px] text-slate-200 hover:border-emerald-500"
								title={t.title}
								onclick={() => insert(t)}>{t.type}</button
							>
						{/each}
					</div>
				{/if}
			{/each}
			<div class="flex items-center gap-1">
				<button
					class="rounded border border-slate-700 px-1.5 py-0.5 text-[11px] text-slate-200 hover:border-emerald-500 disabled:opacity-40"
					disabled={!selectedPin}
					title="Negacja zaznaczonego wejścia (kółko)"
					onclick={negate}>¬ negacja</button
				>
				<button
					class="rounded border border-slate-700 px-1.5 py-0.5 text-[11px] text-slate-200 hover:border-red-400 disabled:opacity-40"
					disabled={!canRemovePin}
					title="Usuń zaznaczone wejście bramki"
					onclick={removePin}>− wejście</button
				>
			</div>
		</div>
	{/if}

	<div class="grid min-h-0 flex-1 {showSt ? 'grid-cols-[minmax(0,1fr)_minmax(0,1fr)]' : ''}">
		<div class="min-h-0 space-y-3 overflow-auto p-4">
			{#if online}
				<p
					class="rounded border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-200"
				>
					Online — zielone linie mają sygnał 1. Zatrzymaj PLC, żeby edytować.
				</p>
			{/if}
			{#each fbd.networks as n, i (n.id)}
				{@const root = rootValue(n)}
				<section
					class="rounded border bg-slate-900/40 {flagged.includes(n.id)
						? 'border-red-500/60'
						: 'border-slate-800'}"
					aria-label="Network {i + 1}"
				>
					<header class="flex items-center gap-2 border-b border-slate-800 px-3 py-1">
						<span class="text-xs font-semibold text-slate-400">Network {i + 1}</span>
						<input
							class="min-w-0 flex-1 bg-transparent text-xs text-slate-300 outline-none placeholder:text-slate-600"
							bind:value={n.comment}
							placeholder="Komentarz: po co ten network?"
							disabled={readOnly}
							aria-label="Komentarz networku {i + 1}"
						/>
						{#if !readOnly}
							<button
								class="text-xs text-slate-500 hover:text-slate-200"
								title="W górę"
								onclick={() => move(n, -1)}>↑</button
							>
							<button
								class="text-xs text-slate-500 hover:text-slate-200"
								title="W dół"
								onclick={() => move(n, 1)}>↓</button
							>
							<button
								class="text-xs text-slate-500 hover:text-red-300"
								aria-label="Usuń network {i + 1}"
								onclick={() => removeNetwork(n)}>×</button
							>
						{/if}
					</header>
					<div class="flex items-center overflow-x-auto px-3 py-3">
						{#if n.value.kind === 'box'}
							<FbdBoxEl box={n.value.box} slot={n} />
						{:else}
							{@const op = n.value}
							<input
								class="{operandInput} w-28 text-right {selected === n ? 'border-sky-400!' : ''}"
								value={op.text}
								placeholder="wejście…"
								list="fbd-names"
								disabled={readOnly}
								aria-label="Wejście networku {i + 1}"
								onfocus={() => (selected = n)}
								oninput={(e) => (op.text = e.currentTarget.value)}
							/>
						{/if}
						<div
							class="h-0.5 w-6 shrink-0"
							style:background-color={wireColor(online, isOn(root))}
						></div>
						<div class="flex flex-col gap-1 border-l-2 border-slate-600 py-1 pl-0">
							{#each n.outputs as o (o.id)}
								<div class="flex items-center">
									<div
										class="h-0.5 w-3"
										style:background-color={wireColor(online, isOn(root))}
									></div>
									<button
										class="w-7 rounded border-2 bg-slate-950 font-mono text-xs font-bold {flagged.includes(
											o.id
										)
											? 'border-red-500'
											: 'border-slate-500'} {o.kind === '=' ? 'text-slate-200' : 'text-amber-300'}"
										title="= przypisanie · S ustaw · R skasuj (kliknij, żeby zmienić)"
										aria-label="Rodzaj wyjścia {o.kind}"
										disabled={readOnly}
										onclick={() => (o.kind = NEXT[o.kind])}>{o.kind}</button
									>
									<input
										class="{operandInput} w-28 text-left"
										value={o.target}
										placeholder="operand…"
										list="fbd-names"
										disabled={readOnly}
										aria-label="Wyjście networku {i + 1}"
										oninput={(e) => (o.target = e.currentTarget.value)}
									/>
									{#if !readOnly}
										<button
											class="text-xs text-slate-600 hover:text-red-300"
											aria-label="Usuń wyjście"
											onclick={() => n.outputs.splice(n.outputs.indexOf(o), 1)}>×</button
										>
									{/if}
								</div>
							{/each}
							{#if !readOnly}
								<button
									class="ml-3 text-left text-[11px] text-slate-500 hover:text-emerald-300"
									onclick={() => n.outputs.push({ id: newId('o'), kind: '=', target: '' })}
									>+ wyjście</button
								>
							{/if}
						</div>
					</div>
				</section>
			{/each}
			{#if !readOnly}
				<button
					class="rounded border border-dashed border-slate-700 px-3 py-1.5 text-xs text-slate-400 hover:border-emerald-500 hover:text-emerald-300"
					onclick={() => addNetwork()}>+ Network</button
				>
			{/if}
		</div>
		{#if showSt}
			<pre
				class="min-h-0 overflow-auto border-l border-slate-800 bg-slate-950 p-3 font-mono text-[11px] text-slate-300"
				aria-label="Wygenerowany ST">{generated}</pre>
		{/if}
	</div>
</div>
