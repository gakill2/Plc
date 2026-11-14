<script lang="ts">
	import { topicMatches, validFilter } from '#lib/net/it.js';

	type Client = { name: string; filter: string; got: string[] };
	let clients = $state<Client[]>([
		{ name: 'Dashboard linii 1', filter: 'plant/line1/#', got: [] },
		{ name: 'Historian temperatur', filter: 'plant/+/+/temp', got: [] },
		{ name: 'Alarm prędkości taśmy', filter: 'plant/line1/conveyor/speed', got: [] }
	]);
	const MESSAGES = [
		{ topic: 'plant/line1/conveyor/speed', payload: '0.8' },
		{ topic: 'plant/line1/oven/temp', payload: '181.4' },
		{ topic: 'plant/line2/oven/temp', payload: '176.0' },
		{ topic: 'plant/line2/press/count', payload: '1207' }
	];
	let topic = $state(MESSAGES[0].topic);
	let payload = $state(MESSAGES[0].payload);
	let delivered = $state<string[]>([]);

	function publish() {
		delivered = [];
		for (const c of clients)
			if (validFilter(c.filter) && topicMatches(c.filter, topic)) {
				c.got = [`${topic} = ${payload}`, ...c.got].slice(0, 4);
				delivered.push(c.name);
			}
	}
</script>

<figure class="space-y-3 rounded-xl border border-slate-800 bg-slate-900/60 p-4 text-xs" lang="pl">
	<figcaption class="text-sm font-semibold text-white">
		MQTT: publikuj i subskrybuj przez brokera
	</figcaption>
	<div class="flex flex-wrap items-end gap-2">
		<label class="block"
			><span class="text-slate-400">Temat (topic)</span>
			<input
				class="mt-0.5 block w-64 rounded border border-slate-700 bg-slate-900 px-2 py-1 font-mono"
				bind:value={topic}
				aria-label="Temat"
			/></label
		>
		<label class="block"
			><span class="text-slate-400">Wartość</span>
			<input
				class="mt-0.5 block w-20 rounded border border-slate-700 bg-slate-900 px-2 py-1 font-mono"
				bind:value={payload}
				aria-label="Wartość"
			/></label
		>
		<button class="rounded bg-sky-500 px-3 py-1.5 font-semibold text-slate-950" onclick={publish}
			>Publikuj</button
		>
		<span class="text-slate-500">gotowe:</span>
		{#each MESSAGES as m (m.topic)}
			<button
				class="rounded border border-slate-700 px-1.5 py-0.5 font-mono text-[10px] text-slate-300 hover:bg-slate-800"
				onclick={() => ((topic = m.topic), (payload = m.payload))}>{m.topic}</button
			>
		{/each}
	</div>
	<p class="text-slate-400" role="status">
		{delivered.length
			? `Broker dostarczył do: ${delivered.join(', ')}`
			: 'Nikt nie subskrybuje tego tematu — wiadomość przepada (chyba że ma flagę retain).'}
	</p>
	<div class="grid gap-2 sm:grid-cols-3">
		{#each clients as c (c.name)}
			<div
				class="rounded border p-2 {delivered.includes(c.name)
					? 'border-emerald-500/60 bg-emerald-500/10'
					: 'border-slate-700 bg-slate-950'}"
			>
				<p class="font-semibold text-slate-200">{c.name}</p>
				<input
					class="mt-1 w-full rounded border bg-slate-900 px-1.5 py-0.5 font-mono {validFilter(
						c.filter
					)
						? 'border-slate-700'
						: 'border-red-500'}"
					bind:value={c.filter}
					aria-label="Subskrypcja: {c.name}"
				/>
				<ul class="mt-1 space-y-0.5 font-mono text-[10px] text-slate-400">
					{#each c.got as g, i (i)}<li>{g}</li>{/each}
				</ul>
			</div>
		{/each}
	</div>
	<p class="text-slate-500">
		<code>+</code> zastępuje jeden poziom tematu, <code>#</code> — wszystkie dalsze (tylko na końcu).
	</p>
</figure>
