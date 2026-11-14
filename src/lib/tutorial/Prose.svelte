<script lang="ts">
	/**
	 * A tiny markdown subset for tutorial text: paragraphs (blank line), lists ("- "),
	 * **bold** and `code`.
	 */
	let { text }: { text: string } = $props();

	type Inline = { t: string; kind: 'text' | 'bold' | 'code' };
	type Para = { kind: 'p'; parts: Inline[] } | { kind: 'ul'; items: Inline[][] };

	function inline(s: string): Inline[] {
		const out: Inline[] = [];
		const re = /(\*\*[^*]+\*\*|`[^`]+`)/g;
		let last = 0;
		for (const m of s.matchAll(re)) {
			if (m.index! > last) out.push({ t: s.slice(last, m.index), kind: 'text' });
			const token = m[0];
			out.push(
				token.startsWith('**')
					? { t: token.slice(2, -2), kind: 'bold' }
					: { t: token.slice(1, -1), kind: 'code' }
			);
			last = m.index! + token.length;
		}
		if (last < s.length) out.push({ t: s.slice(last), kind: 'text' });
		return out;
	}

	const paras = $derived<Para[]>(
		text
			.trim()
			.split(/\n\s*\n/)
			.map((block) => {
				const lines = block.split('\n').map((l) => l.trim());
				if (lines.every((l) => l.startsWith('- '))) {
					return { kind: 'ul', items: lines.map((l) => inline(l.slice(2))) };
				}
				return { kind: 'p', parts: inline(lines.join(' ')) };
			})
	);
</script>

{#snippet parts(list: Inline[])}{#each list as p, i (i)}{#if p.kind === 'bold'}<strong
				class="font-semibold text-white">{p.t}</strong
			>{:else if p.kind === 'code'}<code
				class="rounded bg-slate-800 px-1 py-0.5 font-mono text-[0.88em] text-emerald-300"
				>{p.t}</code
			>{:else}{p.t}{/if}{/each}{/snippet}

<div class="space-y-3 leading-relaxed text-slate-300">
	{#each paras as para, i (i)}
		{#if para.kind === 'ul'}
			<ul class="list-disc space-y-1 pl-5">
				{#each para.items as item, j (j)}<li>{@render parts(item)}</li>{/each}
			</ul>
		{:else}
			<p>{@render parts(para.parts)}</p>
		{/if}
	{/each}
</div>
