<script lang="ts">
	import { resolve } from '$app/paths';
	import type { Snippet } from 'svelte';
	import { lessonProjectId } from '#lib/lessons/lessons.js';
	import type { PathStep } from './path.js';

	type Props = { step: PathStep; class?: string; children: Snippet };
	let { step, class: className = '', children }: Props = $props();

	const href = $derived(
		step.kind === 'chapter'
			? resolve('/learn/basics/[slug]', { slug: step.slug })
			: resolve('/editor/[id]', { id: lessonProjectId(step.slug) })
	);
</script>

<a {href} class={className}>{@render children()}</a>
