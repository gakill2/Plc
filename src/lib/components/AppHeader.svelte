<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { APP_NAME, NAV_ITEMS, REPO_URL } from '#lib/config.js';
	import StatusLed from './StatusLed.svelte';

	const isActive = (href: string) => page.url.pathname.startsWith(href);
</script>

<header class="border-b border-slate-800 bg-slate-950/80 backdrop-blur">
	<div class="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4">
		<a
			href={resolve('/')}
			class="flex items-center gap-2 font-mono text-sm font-semibold tracking-wide"
		>
			<StatusLed label="run" />
			{APP_NAME}
		</a>

		<nav class="flex gap-1 text-sm">
			{#each NAV_ITEMS as item (item.href)}
				<a
					href={resolve(item.href)}
					class="rounded px-3 py-1.5 transition-colors {isActive(item.href)
						? 'bg-slate-800 text-white'
						: 'text-slate-400 hover:text-white'}"
					aria-current={isActive(item.href) ? 'page' : undefined}
				>
					{item.label}
				</a>
			{/each}
		</nav>

		<!-- eslint-disable svelte/no-navigation-without-resolve -- external link -->
		<a
			href={REPO_URL}
			class="ml-auto text-sm text-slate-400 hover:text-white"
			target="_blank"
			rel="noreferrer"
		>
			GitHub
		</a>
		<!-- eslint-enable svelte/no-navigation-without-resolve -->
	</div>
</header>
