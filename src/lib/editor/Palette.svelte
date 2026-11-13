<script lang="ts">
	import type { LadderDocument } from '#lib/ladder/document.svelte.js';
	import { coil, compare, contact, counterBox, timer } from '#lib/ladder/model.js';

	type Props = { doc: LadderDocument; disabled: boolean };
	let { doc, disabled }: Props = $props();

	const canBranch = $derived(
		!disabled &&
			doc.selected !== null &&
			doc.selected.kind !== 'rung' &&
			doc.selected.kind !== 'coil' &&
			doc.selected.kind !== 'series'
	);

	const groups = [
		{
			label: 'Contacts',
			items: [
				{ text: '┤ ├', title: 'Normally open contact', add: () => doc.insert(contact('NO')) },
				{ text: '┤/├', title: 'Normally closed contact', add: () => doc.insert(contact('NC')) },
				{ text: '┤P├', title: 'Rising edge contact', add: () => doc.insert(contact('P')) },
				{ text: '┤N├', title: 'Falling edge contact', add: () => doc.insert(contact('N')) }
			]
		},
		{
			label: 'Coils',
			items: [
				{ text: '( )', title: 'Coil', add: () => doc.addCoil(coil('COIL')) },
				{ text: '(/)', title: 'Negated coil', add: () => doc.addCoil(coil('NCOIL')) },
				{ text: '(S)', title: 'Set coil', add: () => doc.addCoil(coil('SET')) },
				{ text: '(R)', title: 'Reset coil', add: () => doc.addCoil(coil('RESET')) }
			]
		},
		{
			label: 'Boxes',
			items: [
				{ text: 'TON', title: 'On-delay timer', add: () => doc.insert(timer('TON')) },
				{ text: 'TOF', title: 'Off-delay timer', add: () => doc.insert(timer('TOF')) },
				{ text: 'TP', title: 'Pulse timer', add: () => doc.insert(timer('TP')) },
				{ text: 'CTU', title: 'Up counter', add: () => doc.insert(counterBox('CTU')) },
				{ text: 'CTD', title: 'Down counter', add: () => doc.insert(counterBox('CTD', 'C0', '5')) },
				{ text: 'CMP', title: 'Compare', add: () => doc.insert(compare()) }
			]
		}
	];

	const button =
		'rounded px-2 py-1 font-mono text-xs text-slate-200 hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent';
</script>

<div class="flex flex-wrap items-center gap-3" role="toolbar" aria-label="Ladder elements">
	{#each groups as group (group.label)}
		<div class="flex items-center gap-0.5 rounded-md border border-slate-800 bg-slate-900 p-0.5">
			<span class="px-1.5 text-[10px] tracking-wider text-slate-500 uppercase">{group.label}</span>
			{#each group.items as item (item.text)}
				<button class={button} title={item.title} {disabled} onclick={item.add}>{item.text}</button>
			{/each}
		</div>
	{/each}

	<div class="flex items-center gap-0.5 rounded-md border border-slate-800 bg-slate-900 p-0.5">
		<button
			class={button}
			title="Add a parallel branch around the selected element"
			disabled={!canBranch}
			onclick={() => doc.branch()}
		>
			⑂ Branch
		</button>
		<button
			class={button}
			title="Add a network below the selected one"
			{disabled}
			onclick={() => doc.addRung()}
		>
			+ Network
		</button>
		<button
			class={button}
			title="Move network up"
			disabled={disabled || !doc.selectedRung}
			onclick={() => doc.moveSelectedRung(-1)}>↑</button
		>
		<button
			class={button}
			title="Move network down"
			disabled={disabled || !doc.selectedRung}
			onclick={() => doc.moveSelectedRung(1)}>↓</button
		>
		<button
			class="{button} text-red-300"
			title="Delete selection (Del)"
			disabled={disabled || !doc.selectedId}
			onclick={() => doc.removeSelected()}
		>
			Delete
		</button>
	</div>
</div>
