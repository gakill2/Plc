<script lang="ts">
	import Report from '#lib/report/Report.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<svelte:head>
	<title>Report · PLC Sim</title>
</svelte:head>

<Report projectId={data.projectId} />
