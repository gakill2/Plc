<script lang="ts">
	import { t } from '#lib/i18n/i18n.svelte.js';

	type Props = { url: string; copied: boolean; onClose: () => void };
	let { url, copied, onClose }: Props = $props();
</script>

<div class="fixed inset-0 z-50 grid place-items-center bg-slate-950/70 p-4" role="presentation">
	<div
		class="w-full max-w-lg space-y-3 rounded-lg border border-slate-700 bg-slate-900 p-5 shadow-2xl"
		role="dialog"
		aria-label={t('share.title')}
	>
		<h2 class="font-semibold text-white">{t('share.title')}</h2>
		<p class="text-sm text-slate-400">
			{copied ? t('share.copied') : t('share.copy')}
			{t('share.explain')}
		</p>
		<input
			class="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5 font-mono text-xs text-slate-200"
			readonly
			value={url}
			aria-label={t('share.link')}
			onfocus={(e) => e.currentTarget.select()}
		/>
		<div class="text-right">
			<button
				class="rounded-md bg-slate-700 px-3 py-1.5 text-sm hover:bg-slate-600"
				onclick={onClose}
			>
				{t('common.close')}
			</button>
		</div>
	</div>
</div>
