<script lang="ts">
	import type { ProgramLanguage } from '#lib/project/project.js';
	import { t } from '#lib/i18n/i18n.svelte.js';

	type Props = {
		value: ProgramLanguage;
		disabled: boolean;
		onChange: (l: ProgramLanguage) => void;
	};
	let { value, disabled, onChange }: Props = $props();

	const LANGUAGES: { id: ProgramLanguage; label: string }[] = [
		{ id: 'ladder', label: 'Ladder (LAD)' },
		{ id: 'fbd', label: 'FBD' },
		{ id: 'st', label: 'Structured Text' },
		{ id: 'sfc', label: 'SFC' },
		{ id: 'stl', label: 'STL' }
	];
</script>

<div
	class="flex shrink-0 gap-0.5 rounded-md border border-slate-800 bg-slate-900 p-0.5"
	role="group"
	aria-label={t('editor.language')}
>
	{#each LANGUAGES as l (l.id)}
		<button
			class="rounded px-2.5 py-1 text-xs font-medium disabled:cursor-not-allowed {value === l.id
				? 'bg-sky-600 text-white'
				: 'text-slate-400 hover:text-white'}"
			aria-pressed={value === l.id}
			{disabled}
			onclick={() => onChange(l.id)}
		>
			{l.label}
		</button>
	{/each}
</div>
