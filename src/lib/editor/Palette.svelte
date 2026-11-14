<script lang="ts">
	import { t } from '#lib/i18n/i18n.svelte.js';
	import type { LadderDocument } from '#lib/ladder/document.svelte.js';
	import {
		coil,
		compare,
		contact,
		counterBox,
		blockBox,
		mathBox,
		moveBox,
		timer
	} from '#lib/ladder/model.js';

	type Props = { doc: LadderDocument; disabled: boolean };
	let { doc, disabled }: Props = $props();

	const canBranch = $derived(
		!disabled &&
			doc.selected !== null &&
			doc.selected.kind !== 'rung' &&
			doc.selected.kind !== 'coil' &&
			doc.selected.kind !== 'series'
	);

	/** Variants the selected element can be switched between. */
	const VARIANTS: Record<string, { value: string; text: string }[]> = {
		contact: [
			{ value: 'NO', text: '┤ ├ NO' },
			{ value: 'NC', text: '┤/├ NC' },
			{ value: 'P', text: '┤P├ rising' },
			{ value: 'N', text: '┤N├ falling' }
		],
		coil: [
			{ value: 'COIL', text: '( ) coil' },
			{ value: 'NCOIL', text: '(/) negated' },
			{ value: 'SET', text: '(S) set' },
			{ value: 'RESET', text: '(R) reset' }
		],
		timer: [
			{ value: 'TON', text: 'TON on-delay' },
			{ value: 'TOF', text: 'TOF off-delay' },
			{ value: 'TP', text: 'TP pulse' }
		],
		counter: [
			{ value: 'CTU', text: 'CTU up' },
			{ value: 'CTD', text: 'CTD down' }
		]
	};
	const selectedType = $derived.by(() => {
		const n = doc.selected;
		if (!n || !(n.kind in VARIANTS) || !('type' in n)) return null;
		return { kind: n.kind, type: n.type as string };
	});

	const groups = [
		{
			label: 'pal.contacts' as const,
			items: [
				{ text: '┤ ├', title: 'Normally open contact', add: () => doc.insert(contact('NO')) },
				{ text: '┤/├', title: 'Normally closed contact', add: () => doc.insert(contact('NC')) },
				{ text: '┤P├', title: 'Rising edge contact', add: () => doc.insert(contact('P')) },
				{ text: '┤N├', title: 'Falling edge contact', add: () => doc.insert(contact('N')) }
			]
		},
		{
			label: 'pal.coils' as const,
			items: [
				{ text: '( )', title: 'Coil', add: () => doc.addCoil(coil('COIL')) },
				{ text: '(/)', title: 'Negated coil', add: () => doc.addCoil(coil('NCOIL')) },
				{ text: '(S)', title: 'Set coil', add: () => doc.addCoil(coil('SET')) },
				{ text: '(R)', title: 'Reset coil', add: () => doc.addCoil(coil('RESET')) }
			]
		},
		{
			label: 'pal.boxes' as const,
			items: [
				{ text: 'TON', title: 'On-delay timer', add: () => doc.insert(timer('TON')) },
				{ text: 'TOF', title: 'Off-delay timer', add: () => doc.insert(timer('TOF')) },
				{ text: 'TP', title: 'Pulse timer', add: () => doc.insert(timer('TP')) },
				{ text: 'CTU', title: 'Up counter', add: () => doc.insert(counterBox('CTU')) },
				{ text: 'CTD', title: 'Down counter', add: () => doc.insert(counterBox('CTD', 'C0', '5')) },
				{ text: 'CMP', title: 'Compare', add: () => doc.insert(compare()) },
				{ text: 'MOVE', title: 'Move a value (OUT := IN)', add: () => doc.insert(moveBox()) },
				{
					text: 'MATH',
					title: 'Arithmetic (ADD, SUB, MUL, DIV, MOD)',
					add: () => doc.insert(mathBox())
				}
			]
		}
	];

	const button =
		'rounded px-2 py-1 font-mono text-xs text-slate-200 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent';
</script>

<div class="flex flex-wrap items-center gap-3" role="toolbar" aria-label={t('pal.elements')}>
	<div class="flex items-center gap-0.5 rounded-md border border-slate-800 bg-slate-900 p-0.5">
		<span class="px-1.5 text-[10px] tracking-wider text-slate-500 uppercase">{t('pal.insert')}</span
		>
		{#each ['before', 'after'] as const as mode (mode)}
			<button
				class="{button} {doc.insertMode === mode ? 'bg-slate-700 text-emerald-300' : ''}"
				title="Insert new elements {mode} the selection"
				aria-pressed={doc.insertMode === mode}
				{disabled}
				onclick={() => (doc.insertMode = mode)}
				>{mode === 'before' ? t('pal.before') : t('pal.after')}</button
			>
		{/each}
	</div>

	{#each groups as group (group.label)}
		<div class="flex items-center gap-0.5 rounded-md border border-slate-800 bg-slate-900 p-0.5">
			<span class="px-1.5 text-[10px] tracking-wider text-slate-500 uppercase"
				>{t(group.label)}</span
			>
			{#each group.items as item (item.text)}
				<button class={button} title={item.title} {disabled} onclick={item.add}>{item.text}</button>
			{/each}
		</div>
	{/each}

	<label class="flex items-center gap-1 rounded-md border border-slate-800 bg-slate-900 p-0.5">
		<span class="px-1.5 text-[10px] tracking-wider text-slate-500 uppercase">{t('pal.blocks')}</span
		>
		<select
			class="rounded bg-slate-900 px-1 py-1 font-mono text-xs text-violet-200 disabled:opacity-40"
			aria-label={t('pal.insertFb')}
			{disabled}
			value=""
			onchange={(e) => {
				const type = e.currentTarget.value;
				e.currentTarget.value = '';
				if (type) doc.insert(blockBox(type, doc.freeInstance(type)));
			}}
		>
			<option value="">FB…</option>
			{#each doc.catalog as b (b.name)}<option value={b.name}
					>{b.name}{b.standard ? '' : ' (own)'}</option
				>{/each}
		</select>
	</label>

	<div class="flex items-center gap-0.5 rounded-md border border-slate-800 bg-slate-900 p-0.5">
		<button
			class={button}
			title={t('pal.branchTitle')}
			disabled={!canBranch}
			onclick={() => doc.branch()}
		>
			{t('pal.branch')}
		</button>
		<button class={button} title={t('pal.networkTitle')} {disabled} onclick={() => doc.addRung()}>
			{t('pal.network')}
		</button>
		<button
			class={button}
			title={t('pal.up')}
			disabled={disabled || !doc.selectedRung}
			onclick={() => doc.moveSelectedRung(-1)}>↑</button
		>
		<button
			class={button}
			title={t('pal.down')}
			disabled={disabled || !doc.selectedRung}
			onclick={() => doc.moveSelectedRung(1)}>↓</button
		>
		<button
			class={button}
			title={t('pal.copyTitle')}
			disabled={disabled || !doc.canCopy}
			onclick={() => doc.copy()}>{t('pal.copy')}</button
		>
		<button
			class={button}
			title={t('pal.pasteTitle')}
			disabled={disabled || !doc.clipboard}
			onclick={() => doc.paste()}>{t('pal.paste')}</button
		>
		<button
			class={button}
			title={t('pal.duplicateTitle')}
			disabled={disabled || !doc.canCopy}
			onclick={() => doc.duplicate()}>{t('pal.duplicate')}</button
		>
		<button
			class="{button} text-red-300"
			title={t('pal.deleteTitle')}
			disabled={disabled || !doc.selectedId}
			onclick={() => doc.removeSelected()}
		>
			{t('pal.delete')}
		</button>
	</div>
</div>

{#if selectedType}
	<label class="mt-2 flex items-center gap-2 text-xs text-slate-400">
		Type
		<select
			class="rounded border border-slate-700 bg-slate-900 px-1.5 py-0.5 font-mono text-xs text-slate-100 disabled:opacity-50"
			aria-label={t('pal.elementType')}
			value={selectedType.type}
			{disabled}
			onchange={(e) => doc.setType(e.currentTarget.value)}
		>
			{#each VARIANTS[selectedType.kind] as v (v.value)}
				<option value={v.value}>{v.text}</option>
			{/each}
		</select>
	</label>
{/if}
