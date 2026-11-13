<script lang="ts">
	import { resolve } from '$app/paths';
	import { APP_NAME, APP_TAGLINE } from '#lib/config.js';
	import StatusLed from '#lib/components/StatusLed.svelte';

	const features = [
		{
			title: 'Build the circuit',
			body: 'Wire push buttons, sensors, lamps and motors to the I/O modules of a virtual PLC.'
		},
		{
			title: 'Program it',
			body: 'Write Ladder Logic or Structured Text. Both compile to the same instruction list.'
		},
		{
			title: 'Watch it think',
			body: 'Step through scan cycles, see power flow live and plot signals on a timing diagram.'
		}
	];

	const scanPhases = ['Read inputs', 'Execute program', 'Write outputs'];
</script>

<section class="mx-auto max-w-6xl px-4 py-20">
	<p
		class="mb-4 flex items-center gap-2 font-mono text-xs tracking-widest text-emerald-400 uppercase"
	>
		<StatusLed /> Runtime ready
	</p>
	<h1 class="text-4xl font-bold tracking-tight text-white sm:text-6xl">{APP_NAME}</h1>
	<p class="mt-4 max-w-2xl text-lg text-slate-400">{APP_TAGLINE}</p>

	<div class="mt-8 flex flex-wrap gap-3">
		<a
			href={resolve('/editor/[id]', { id: 'new' })}
			class="rounded-md bg-emerald-500 px-5 py-2.5 font-medium text-slate-950 hover:bg-emerald-400"
		>
			Open editor
		</a>
		<a
			href={resolve('/learn')}
			class="rounded-md border border-slate-700 px-5 py-2.5 font-medium hover:border-slate-500"
		>
			Start learning
		</a>
	</div>

	<ol class="mt-16 flex flex-wrap items-center gap-2 font-mono text-sm text-slate-400">
		{#each scanPhases as phase, i (phase)}
			<li class="rounded border border-slate-800 bg-slate-900 px-3 py-1.5">{phase}</li>
			{#if i < scanPhases.length - 1}<li aria-hidden="true">→</li>{/if}
		{/each}
		<li aria-hidden="true" class="text-slate-600">↺</li>
	</ol>
</section>

<section class="mx-auto grid max-w-6xl gap-4 px-4 pb-20 sm:grid-cols-3">
	{#each features as feature (feature.title)}
		<article class="rounded-lg border border-slate-800 bg-slate-900/50 p-6">
			<h2 class="font-semibold text-white">{feature.title}</h2>
			<p class="mt-2 text-sm text-slate-400">{feature.body}</p>
		</article>
	{/each}
</section>
