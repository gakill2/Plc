<script lang="ts">
	type Props = { title: string; description: string; stage: string };
	let { title, description, stage }: Props = $props();
</script>

<svelte:head>
	<title>{title} · PLC Sim</title>
</svelte:head>

<section class="mx-auto max-w-6xl px-4 py-16">
	<h1 class="text-3xl font-bold text-white">{title}</h1>
	<p class="mt-3 max-w-xl text-slate-400">{description}</p>
	<p
		class="mt-6 inline-block rounded border border-dashed border-slate-700 px-3 py-1.5 font-mono text-xs text-slate-500"
	>
		Coming in {stage}
	</p>
</section>
