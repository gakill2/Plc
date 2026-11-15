<script lang="ts">
	import { resolve } from '$app/paths';
	import { i18n, t } from '#lib/i18n/i18n.svelte.js';
</script>

<!-- English interface, Polish content: say so instead of pretending -->
{#if i18n.locale === 'en'}
	<p
		class="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100"
		lang="en"
	>
		{t('learn.polishContent')}
		<a href={resolve('/learn/glossary')} class="text-sky-300 underline hover:text-sky-200"
			>{t('learn.glossary')}</a
		>
	</p>
{/if}
