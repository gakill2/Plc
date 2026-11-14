<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { APP_NAME, NAV_ITEMS, REPO_URL } from '#lib/config.js';
	import InstallButton from './InstallButton.svelte';
	import StatusLed from './StatusLed.svelte';

	const isActive = (href: string) => page.url.pathname.startsWith(href);
</script>

<header class="border-b border-slate-800 bg-slate-950/80 backdrop-blur print:hidden">
	<div class="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 sm:gap-6">
		<a
			href={resolve('/')}
			class="flex shrink-0 items-center gap-2 font-mono text-sm font-semibold tracking-wide whitespace-nowrap"
		>
			<StatusLed label="run" />
			{APP_NAME}
		</a>

		<nav class="-mx-1 flex min-w-0 gap-1 overflow-x-auto text-sm">
			{#each NAV_ITEMS as item (item.href)}
				<a
					href={resolve(item.href)}
					class="shrink-0 rounded px-2 py-1.5 transition-colors sm:px-3 {isActive(item.href)
						? 'bg-slate-800 text-white'
						: 'text-slate-400 hover:text-white'}"
					aria-current={isActive(item.href) ? 'page' : undefined}
				>
					{item.label}
				</a>
			{/each}
		</nav>

		<div class="ml-auto flex items-center gap-3">
			<InstallButton />
		</div>
		<!-- eslint-disable svelte/no-navigation-without-resolve -- external link -->
		<a
			href={REPO_URL}
			class="hidden text-sm text-slate-400 hover:text-white sm:inline"
			target="_blank"
			rel="noreferrer"
		>
			GitHub
		</a>
		<!-- eslint-enable svelte/no-navigation-without-resolve -->
	</div>
</header>
