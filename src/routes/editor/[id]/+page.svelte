<script lang="ts">
	import Workspace from '#lib/editor/Workspace.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head>
	<title>Editor · PLC Sim</title>
</svelte:head>

{#key data.projectId}
	<Workspace projectId={data.projectId} />
{/key}
