<script lang="ts">
	const columns = [
		{
			title: 'Czujniki',
			items: ['przycisk', 'wyłącznik krańcowy', 'czujnik indukcyjny', 'czujnik poziomu'],
			tone: 'sky'
		},
		{ title: 'Moduł wejść', items: ['I0.0 … I0.7', 'np. 24 V DC', 'stan 0 / 1'], tone: 'sky' },
		{
			title: 'CPU + program',
			items: ['cykl skanowania', 'pamięć M', 'timery, liczniki'],
			tone: 'emerald'
		},
		{
			title: 'Moduł wyjść',
			items: ['Q0.0 … Q0.7', 'przekaźnikowe lub tranzystorowe'],
			tone: 'amber'
		},
		{
			title: 'Elementy wykonawcze',
			items: ['lampka', 'stycznik silnika', 'elektrozawór', 'buczek'],
			tone: 'amber'
		}
	] as const;
	const TONE = {
		sky: 'border-sky-500/40 bg-sky-500/10 text-sky-200',
		emerald: 'border-emerald-500/50 bg-emerald-500/10 text-emerald-200',
		amber: 'border-amber-500/40 bg-amber-500/10 text-amber-200'
	};
</script>

<figure class="rounded-lg border border-slate-700 bg-slate-950 p-4">
	<div class="grid items-stretch gap-2 sm:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr_auto_1fr]">
		{#each columns as c, i (c.title)}
			<div class="rounded-lg border p-3 {TONE[c.tone]}">
				<p class="text-sm font-semibold">{c.title}</p>
				<ul class="mt-1 space-y-0.5 text-xs text-slate-300">
					{#each c.items as item (item)}<li>{item}</li>{/each}
				</ul>
			</div>
			{#if i < columns.length - 1}
				<span class="hidden self-center text-xl text-slate-500 sm:block" aria-hidden="true">→</span>
			{/if}
		{/each}
	</div>
	<figcaption class="mt-3 text-xs text-slate-400">
		Sygnał płynie zawsze w jedną stronę: obiekt → wejścia → program → wyjścia → obiekt. Program nie
		„widzi” obiektu inaczej niż przez wejścia.
	</figcaption>
</figure>
