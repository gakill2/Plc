<script lang="ts">
	import { resolve } from '$app/paths';
	import { lessonProjectId } from '#lib/lessons/lessons.js';
	import { downtime, type TicketRecord } from './progress.js';
	import { nextTicket, PRIORITY_STYLE, type Ticket } from './tickets.js';

	type Props = {
		ticket: Ticket;
		record: TicketRecord | null;
		justSolved: boolean;
		/** brief: the foreman's message; debrief: the result once solved. */
		part: 'brief' | 'debrief';
	};
	let { ticket, record, justSolved, part }: Props = $props();

	const next = $derived(nextTicket(ticket.id));
	const lost = $derived(
		record?.solvedAt !== undefined ? downtime(record, ticket.costPerHour) : null
	);
	const nextHref = (t: Ticket) =>
		`${resolve('/editor/[id]', { id: lessonProjectId(t.lesson) })}?ticket=${t.id}`;
</script>

{#if part === 'brief'}
	<article
		lang="pl"
		class="space-y-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-xs"
		aria-label="Zgłoszenie"
	>
		<div class="flex items-center gap-2">
			<span class="text-[10px] font-semibold tracking-wider text-amber-300 uppercase"
				>📋 Zgłoszenie #{ticket.id.slice(1)}</span
			>
			<span class="rounded px-1.5 py-0.5 text-[10px] uppercase {PRIORITY_STYLE[ticket.priority]}"
				>{ticket.priority}</span
			>
			<a href={resolve('/work')} class="ml-auto text-[11px] text-slate-400 underline">wszystkie</a>
		</div>
		<h3 class="text-sm font-semibold text-white">{ticket.title}</h3>
		<p class="text-slate-400">{ticket.machine} · od: {ticket.from}</p>
		<p class="leading-relaxed text-slate-200 italic">„{ticket.message}”</p>
		{#if ticket.costPerHour > 0}
			<p class="text-slate-500">Przestój kosztuje ok. {ticket.costPerHour} zł/h.</p>
		{/if}
	</article>
{:else}
	{#if record?.solvedAt !== undefined}
		<div
			class="space-y-1.5 rounded border border-emerald-500/40 bg-emerald-500/10 p-2 text-xs"
			aria-live="polite"
			data-testid="debrief"
		>
			<p class="font-semibold text-emerald-200">
				{justSolved ? 'Zgłoszenie zamknięte!' : 'Zamknięte wcześniej'}
				<span class="ml-1 text-amber-300" aria-label="{record.stars} z 3 gwiazdek"
					>{'★'.repeat(record.stars ?? 0)}{'☆'.repeat(3 - (record.stars ?? 0))}</span
				>
			</p>
			{#if lost && ticket.costPerHour > 0}
				<p class="text-slate-300">
					Przestój: {lost.minutes} min · ok. {lost.cost.toLocaleString('pl-PL')} zł
				</p>
			{/if}
			<p class="text-slate-300"><b class="text-white">Co się działo:</b> {ticket.debrief.cause}</p>
			<p class="text-slate-300"><b class="text-white">Zasada:</b> {ticket.debrief.lesson}</p>
			<p class="text-slate-300">
				<b class="text-white">Rada starszego kolegi:</b>
				{ticket.debrief.tip}
			</p>
			{#if next}
				<!-- eslint-disable svelte/no-navigation-without-resolve -- resolve() + ?ticket query -->
				<a
					href={nextHref(next)}
					data-sveltekit-reload
					class="inline-block rounded bg-amber-400 px-2 py-1 font-semibold text-slate-950 hover:bg-amber-300"
					>Następne zgłoszenie: {next.title} →</a
				>
				<!-- eslint-enable svelte/no-navigation-without-resolve -->
			{:else}
				<p class="font-semibold text-amber-200">To było ostatnie zgłoszenie. Brawo!</p>
			{/if}
		</div>
	{/if}
{/if}
