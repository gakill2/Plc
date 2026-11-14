<script lang="ts">
	import Prose from './Prose.svelte';

	type Props = {
		question: string;
		options: string[];
		correct: number;
		explanation: string;
		solved: boolean;
		onSolved: () => void;
		/** Called on every answer, right or wrong. */
		onAnswer?: (right: boolean) => void;
	};
	let { question, options, correct, explanation, solved, onSolved, onAnswer }: Props = $props();

	let chosen = $state<number | null>(null);
	const answered = $derived(chosen !== null);
	const right = $derived(chosen === correct);

	function choose(i: number) {
		chosen = i;
		onAnswer?.(i === correct);
		if (i === correct) onSolved();
	}
</script>

<section
	class="rounded-lg border border-violet-500/30 bg-violet-500/5 p-4"
	aria-label="Pytanie sprawdzające"
>
	<p class="mb-3 flex items-start gap-2 font-medium text-white">
		<span
			class="mt-0.5 rounded bg-violet-500/30 px-1.5 text-[10px] font-semibold tracking-wider text-violet-200 uppercase"
		>
			Sprawdź się
		</span>
		<span>{question}</span>
		{#if solved && !answered}<span
				class="ml-auto text-xs text-emerald-300"
				title="Rozwiązane wcześniej">✓</span
			>{/if}
	</p>
	<div class="grid gap-1.5">
		{#each options as option, i (i)}
			<button
				class="rounded-md border px-3 py-2 text-left text-sm transition-colors {answered &&
				i === correct
					? 'border-emerald-500/60 bg-emerald-500/15 text-emerald-100'
					: answered && i === chosen
						? 'border-red-500/60 bg-red-500/15 text-red-100'
						: 'border-slate-700 bg-slate-900 text-slate-200 hover:border-slate-500'}"
				aria-pressed={chosen === i}
				onclick={() => choose(i)}
			>
				{option}
			</button>
		{/each}
	</div>
	{#if answered}
		<div
			class="mt-3 rounded-md px-3 py-2 text-sm {right ? 'bg-emerald-500/10' : 'bg-amber-500/10'}"
			aria-live="polite"
		>
			<p class="mb-1 font-semibold {right ? 'text-emerald-300' : 'text-amber-300'}">
				{right ? 'Dobrze!' : 'Nie tym razem — spróbuj jeszcze raz.'}
			</p>
			{#if right}<Prose text={explanation} />{/if}
		</div>
	{/if}
</section>
