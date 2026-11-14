<script lang="ts">
	import { t } from '#lib/i18n/i18n.svelte.js';
	import { onMount } from 'svelte';

	/** Chrome / Edge fire this when the app can be installed; Safari uses Share → Add to Home Screen. */
	interface InstallPromptEvent extends Event {
		prompt(): Promise<void>;
		userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
	}

	let deferred = $state<InstallPromptEvent | null>(null);
	let offline = $state(false);

	onMount(() => {
		const onPrompt = (e: Event) => {
			e.preventDefault();
			deferred = e as InstallPromptEvent;
		};
		const onInstalled = () => (deferred = null);
		const onNetwork = () => (offline = !navigator.onLine);
		onNetwork();
		window.addEventListener('beforeinstallprompt', onPrompt);
		window.addEventListener('appinstalled', onInstalled);
		window.addEventListener('online', onNetwork);
		window.addEventListener('offline', onNetwork);
		return () => {
			window.removeEventListener('beforeinstallprompt', onPrompt);
			window.removeEventListener('appinstalled', onInstalled);
			window.removeEventListener('online', onNetwork);
			window.removeEventListener('offline', onNetwork);
		};
	});

	async function install() {
		if (!deferred) return;
		await deferred.prompt();
		await deferred.userChoice;
		deferred = null;
	}
</script>

{#if offline}
	<span
		class="rounded border border-amber-500/40 px-2 py-0.5 text-xs text-amber-300"
		title={t('install.offlineTitle')}>{t('install.offline')}</span
	>
{/if}
{#if deferred}
	<button
		class="rounded border border-emerald-500/50 px-2.5 py-1 text-xs text-emerald-300 hover:bg-emerald-500/10"
		title={t('install.title')}
		onclick={install}>{t('install.button')}</button
	>
{/if}
