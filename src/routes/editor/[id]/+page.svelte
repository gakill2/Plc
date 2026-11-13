<script lang="ts">
	import PagePlaceholder from '#lib/components/PagePlaceholder.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
</script>

<PagePlaceholder
	title="Editor"
	description={`Project “${data.projectId}”: circuit, program and monitor views will live here.`}
	stage="stage 2"
/>
