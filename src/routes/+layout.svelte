<script lang="ts">
	import './layout.css';
	import AppHeader from '#lib/components/AppHeader.svelte';
	import { APP_NAME, APP_TAGLINE } from '#lib/config.js';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();
</script>

<svelte:head>
	<title>{APP_NAME}</title>
	<meta name="description" content={APP_TAGLINE} />
</svelte:head>

<div class="flex min-h-dvh flex-col">
	<AppHeader />
	<main class="flex-1">
		{@render children()}
	</main>
</div>
