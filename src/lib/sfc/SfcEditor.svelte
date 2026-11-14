<script lang="ts">
	import { newId } from '#lib/ladder/model.js';
	import {
		sfcStep,
		sfcTransition,
		stepVar,
		type Qualifier,
		type Sfc,
		type SfcStep,
		type SfcTransition
	} from './sfc.js';

	type Props = {
		sfc: Sfc;
		readOnly: boolean;
		/** Is this step active (online)? null while offline. */
		active: (name: string) => boolean | null;
		/** Ids of steps / transitions with problems. */
		flagged: string[];
	};
	let { sfc, readOnly, active, flagged }: Props = $props();

	const QUALIFIERS: { id: Qualifier; title: string }[] = [
		{ id: 'N', title: 'N — włączone, dopóki krok jest aktywny' },
		{ id: 'S', title: 'S — ustaw (zostaje po wyjściu z kroku)' },
		{ id: 'R', title: 'R — skasuj' }
	];

	/** Transitions drawn under a step: those leaving it (listed under their first source step). */
	const leaving = (s: SfcStep) =>
		sfc.transitions.filter((t) => (t.from[0] ?? '').toUpperCase() === s.name.toUpperCase());
	const orphans = $derived(
		sfc.transitions.filter(
			(t) => !sfc.steps.some((s) => s.name.toUpperCase() === (t.from[0] ?? '').toUpperCase())
		)
	);
	const indexOf = (t: SfcTransition) => sfc.transitions.indexOf(t) + 1;

	function uniqueName(base: string) {
		let i = sfc.steps.length + 1;
		while (sfc.steps.some((s) => s.name.toUpperCase() === `${base}${i}`.toUpperCase())) i++;
		return `${base}${i}`;
	}

	function addStep(after?: SfcStep) {
		const step = sfcStep(uniqueName('Krok'));
		const prev = after ?? sfc.steps.at(-1);
		const at = after ? sfc.steps.indexOf(after) + 1 : sfc.steps.length;
		sfc.steps.splice(at, 0, step);
		if (prev) sfc.transitions.push(sfcTransition(prev.name, step.name, ''));
	}

	function rename(step: SfcStep, name: string) {
		const old = step.name;
		step.name = name;
		for (const t of sfc.transitions) {
			t.from = t.from.map((n) => (n === old ? name : n));
			t.to = t.to.map((n) => (n === old ? name : n));
		}
	}

	function removeStep(step: SfcStep) {
		sfc.steps.splice(sfc.steps.indexOf(step), 1);
		sfc.transitions = sfc.transitions.filter(
			(t) => !t.from.includes(step.name) && !t.to.includes(step.name)
		);
	}

	function move(step: SfcStep, by: number) {
		const i = sfc.steps.indexOf(step);
		const j = i + by;
		if (j < 0 || j >= sfc.steps.length) return;
		[sfc.steps[i], sfc.steps[j]] = [sfc.steps[j], sfc.steps[i]];
	}

	function addTransition(from: SfcStep) {
		const i = sfc.steps.indexOf(from);
		const to = sfc.steps[i + 1] ?? sfc.steps[0];
		sfc.transitions.push(sfcTransition(from.name, to.name, ''));
	}

	const others = (list: string[]) => sfc.steps.filter((s) => !list.includes(s.name));
</script>

{#snippet chips(t: SfcTransition, key: 'from' | 'to', label: string)}
	<span class="text-slate-500">{label}</span>
	{#each t[key] as name, i (i)}
		<span class="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-slate-200"
			>{name}{#if !readOnly && t[key].length > 1}<button
					class="ml-1 text-slate-500 hover:text-red-300"
					aria-label="Usuń {name}"
					onclick={() => t[key].splice(i, 1)}>×</button
				>{/if}</span
		>
	{/each}
	{#if !readOnly && others(t[key]).length}
		<select
			class="rounded border border-slate-700 bg-slate-900 px-1 py-0.5 text-[11px] text-slate-400"
			aria-label="{label} — dodaj krok"
			value=""
			onchange={(e) => {
				if (e.currentTarget.value) t[key].push(e.currentTarget.value);
				e.currentTarget.value = '';
			}}
		>
			<option value="">+</option>
			{#each others(t[key]) as s (s.id)}<option value={s.name}>{s.name}</option>{/each}
		</select>
	{/if}
{/snippet}

{#snippet transition(t: SfcTransition)}
	{@const live = t.from.every((n) => active(n))}
	<div class="flex items-center gap-3 py-1" data-testid="sfc-transition">
		<div class="flex w-48 flex-col items-center">
			<div class="h-3 w-0.5 bg-slate-500"></div>
			<div
				class="h-1 w-10 {flagged.includes(t.id)
					? 'bg-red-400'
					: live
						? 'bg-amber-300'
						: 'bg-slate-300'}"
				title="Przejście {indexOf(t)}"
			></div>
			<div class="h-3 w-0.5 bg-slate-500"></div>
		</div>
		<div class="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 text-[11px]">
			<span class="font-mono text-slate-500">T{indexOf(t)}</span>
			{#if readOnly}
				<code class="rounded bg-slate-900 px-1.5 py-0.5 text-emerald-300">{t.condition || '—'}</code
				>
			{:else}
				<input
					class="min-w-48 flex-1 rounded border border-slate-700 bg-slate-900 px-2 py-0.5 font-mono text-emerald-300"
					value={t.condition}
					placeholder="warunek, np. Sensor AND Krok1.T >= T#2s"
					aria-label="Warunek przejścia T{indexOf(t)}"
					spellcheck="false"
					oninput={(e) => (t.condition = e.currentTarget.value)}
				/>
			{/if}
			{#if t.from.length > 1}{@render chips(t, 'from', 'z')}{/if}
			{@render chips(t, 'to', '→')}
			{#if !readOnly}
				{#if t.from.length === 1}
					<button
						class="text-slate-500 hover:text-sky-300"
						title="Zbieżność równoległa: przejście czeka na kilka kroków"
						onclick={() => {
							const extra = others(t.from)[0];
							if (extra) t.from.push(extra.name);
						}}>⫽ z kilku</button
					>
				{/if}
				<button
					class="text-slate-500 hover:text-red-300"
					aria-label="Usuń przejście T{indexOf(t)}"
					onclick={() => sfc.transitions.splice(sfc.transitions.indexOf(t), 1)}>×</button
				>
			{/if}
		</div>
	</div>
{/snippet}

<div class="space-y-1 p-4" lang="pl">
	{#each sfc.steps as step (step.id)}
		{@const on = active(step.name)}
		<div class="flex items-start gap-3" data-testid="sfc-step">
			<div class="flex w-48 flex-col items-center">
				<div
					class="w-40 rounded border-2 p-1.5 text-center {on
						? 'border-emerald-400 bg-emerald-500/20'
						: flagged.includes(step.id)
							? 'border-red-400 bg-slate-900'
							: 'border-slate-400 bg-slate-900'} {step.initial
						? 'outline-2 outline-offset-2 outline-slate-400'
						: ''}"
					aria-current={on ? 'step' : undefined}
				>
					{#if readOnly}
						<p class="font-mono text-sm font-semibold text-white">{step.name}</p>
					{:else}
						<input
							class="w-full rounded bg-transparent text-center font-mono text-sm font-semibold text-white outline-none hover:bg-slate-800 focus:bg-slate-800"
							value={step.name}
							aria-label="Nazwa kroku"
							spellcheck="false"
							onchange={(e) => rename(step, e.currentTarget.value.trim().replace(/\s+/g, '_'))}
						/>
					{/if}
					<p class="font-mono text-[9px] text-slate-500">{stepVar(step.name)}</p>
				</div>
				{#if !readOnly}
					<div class="mt-1 flex items-center gap-2 text-[10px] text-slate-500">
						<label class="flex items-center gap-1"
							><input type="checkbox" bind:checked={step.initial} /> początkowy</label
						>
						<button class="hover:text-white" aria-label="Krok w górę" onclick={() => move(step, -1)}
							>↑</button
						>
						<button class="hover:text-white" aria-label="Krok w dół" onclick={() => move(step, 1)}
							>↓</button
						>
						<button
							class="hover:text-red-300"
							aria-label="Usuń krok {step.name}"
							onclick={() => removeStep(step)}>×</button
						>
					</div>
				{/if}
			</div>

			<div class="mt-1 flex min-w-0 flex-1 flex-col gap-1 border-l-2 border-slate-700 pl-3 text-xs">
				{#each step.actions as a (a.id)}
					<div class="flex items-center gap-1.5">
						{#if readOnly}
							<span class="w-6 rounded bg-slate-800 text-center font-mono text-sky-300"
								>{a.qualifier}</span
							>
							<span class="font-mono text-slate-200">{a.operand}</span>
						{:else}
							<select
								class="rounded border border-slate-700 bg-slate-900 px-1 py-0.5 font-mono text-sky-300"
								bind:value={a.qualifier}
								aria-label="Kwalifikator akcji"
							>
								{#each QUALIFIERS as q (q.id)}<option value={q.id} title={q.title}>{q.id}</option
									>{/each}
							</select>
							<input
								class="w-40 rounded border border-slate-700 bg-slate-900 px-2 py-0.5 font-mono text-slate-100"
								bind:value={a.operand}
								placeholder="np. Valve albo Q0.1"
								aria-label="Operand akcji"
								spellcheck="false"
							/>
							<button
								class="text-slate-500 hover:text-red-300"
								aria-label="Usuń akcję"
								onclick={() => step.actions.splice(step.actions.indexOf(a), 1)}>×</button
							>
						{/if}
					</div>
				{:else}
					<span class="text-slate-600">brak akcji</span>
				{/each}
				{#if !readOnly}
					<div class="flex gap-3 text-[11px]">
						<button
							class="text-sky-300 hover:text-sky-200"
							onclick={() => step.actions.push({ id: newId('a'), qualifier: 'N', operand: '' })}
							>+ akcja</button
						>
						<button class="text-sky-300 hover:text-sky-200" onclick={() => addTransition(step)}
							>+ przejście</button
						>
						<button class="text-sky-300 hover:text-sky-200" onclick={() => addStep(step)}
							>+ krok poniżej</button
						>
					</div>
				{/if}
			</div>
		</div>
		{#each leaving(step) as t (t.id)}{@render transition(t)}{/each}
	{/each}

	{#if orphans.length}
		<p class="pt-2 text-xs text-red-300">Przejścia bez kroku źródłowego:</p>
		{#each orphans as t (t.id)}{@render transition(t)}{/each}
	{/if}

	{#if !readOnly && sfc.steps.length === 0}
		<button class="text-sm text-sky-300" onclick={() => addStep()}>+ pierwszy krok</button>
	{/if}
</div>
