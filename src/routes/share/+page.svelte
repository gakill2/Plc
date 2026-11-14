<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';
	import { decodeProject } from '#lib/project/share.js';
	import { newProjectId, saveProject } from '#lib/project/storage.js';

	let error = $state<string | null>(null);

	// The project travels in the URL fragment (#…), so it never reaches a server.
	onMount(async () => {
		const project = await decodeProject(location.hash.slice(1));
		if (!project) {
			error = 'This share link is incomplete or damaged.';
			return;
		}
		const id = newProjectId();
		saveProject(localStorage, id, {
			...project,
			name: `${project.name ?? 'Shared project'}`,
			lesson: undefined
		});
		await goto(resolve('/editor/[id]', { id }), { replaceState: true });
	});
</script>

<svelte:head>
	<title>Opening shared project · PLC Sim</title>
</svelte:head>

<section class="mx-auto max-w-xl px-4 py-24 text-center">
	{#if error}
		<h1 class="text-xl font-semibold text-white">Could not open the project</h1>
		<p class="mt-2 text-slate-400">{error}</p>
		<a href={resolve('/projects')} class="mt-6 inline-block text-emerald-300 underline"
			>Go to your projects</a
		>
	{:else}
		<p class="text-slate-400">Opening shared project…</p>
	{/if}
</section>
