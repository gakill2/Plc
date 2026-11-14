<script lang="ts">
	import { resolve } from '$app/paths';
	import ContinueCard from '#lib/learn/ContinueCard.svelte';
	import HeroPlc from '#lib/components/HeroPlc.svelte';
	import { LESSONS } from '#lib/lessons/lessons.js';
	import { CHAPTERS } from '#lib/tutorial/chapters.js';
	import '@fontsource/barlow-condensed/600.css';
	import '@fontsource/barlow-condensed/700.css';

	const inside = [
		{
			title: 'Four languages, one CPU',
			body: 'Ladder, FBD, Structured Text and SFC compile to the same instruction list and run on the same scan cycle — with function blocks, arrays, RETAIN and interrupts.',
			href: resolve('/editor/[id]', { id: 'demo' }),
			link: 'Open the editor'
		},
		{
			title: `${CHAPTERS.length} chapters, ${LESSONS.length} graded exercises`,
			body: 'From the first contact to PID, drives, fieldbus and machine safety. Every exercise is checked by tests that run your program against a simulated machine.',
			href: resolve('/learn'),
			link: 'Start learning'
		},
		{
			title: 'Machines that break',
			body: 'Night shifts where a sensor dies or a wire comes loose, a broken 4–20 mA loop, a jammed belt, no compressed air. Find the fault with the trend and the diagnostic buffer.',
			href: resolve('/oncall'),
			link: 'Take a shift'
		},
		{
			title: 'Out to real tools',
			body: 'Export any project as SCL with a tag table for TIA Portal, or as PLCopen XML for CODESYS.',
			href: resolve('/projects'),
			link: 'Your projects'
		}
	];
</script>

<section
	class="hero mx-auto grid max-w-6xl items-center gap-12 px-4 pt-16 pb-20 lg:grid-cols-[1fr_1.15fr]"
>
	<div>
		<h1 class="display text-5xl leading-[0.95] text-white sm:text-7xl">
			Learn how a PLC thinks, one scan at a time.
		</h1>
		<p class="mt-6 max-w-lg text-lg leading-relaxed text-slate-300">
			Wire buttons and motors to a virtual controller, program it in ladder or text, and watch it
			read inputs, run your logic and switch outputs — a hundred times a second. Or slow it down and
			step through a single cycle.
		</p>
		<div class="mt-8 flex flex-wrap gap-3">
			<a
				href={resolve('/learn')}
				class="rounded-md bg-emerald-500 px-5 py-2.5 font-medium text-slate-950 hover:bg-emerald-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300"
			>
				Start learning
			</a>
			<a
				href={resolve('/editor/[id]', { id: 'demo' })}
				class="rounded-md border border-slate-600 px-5 py-2.5 font-medium text-slate-100 hover:border-slate-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-300"
			>
				Open the demo project
			</a>
		</div>
		<div class="mt-6 max-w-lg">
			<ContinueCard showWhenFresh={false} />
		</div>
	</div>

	<HeroPlc />
</section>

<section class="border-t border-slate-800/80 bg-slate-900/40">
	<div class="mx-auto max-w-6xl px-4 py-16">
		<h2 class="display text-3xl text-white">What is inside</h2>
		<dl class="mt-8 grid gap-x-12 gap-y-10 md:grid-cols-2">
			{#each inside as item (item.title)}
				<div class="max-w-xl border-l-2 border-slate-700 pl-5">
					<dt class="display text-xl text-white">{item.title}</dt>
					<dd class="mt-2 leading-relaxed text-slate-400">
						{item.body}
						<a
							href={item.href}
							class="mt-2 block font-medium text-emerald-300 underline-offset-4 hover:underline"
							>{item.link}</a
						>
					</dd>
				</div>
			{/each}
		</dl>
	</div>
</section>

<style>
	.display {
		font-family: 'Barlow Condensed', ui-sans-serif, system-ui, sans-serif;
		font-weight: 700;
		letter-spacing: 0.005em;
		text-wrap: balance;
	}
	h2.display,
	dt.display {
		font-weight: 600;
	}
	/* the cabinet behind the module: a faint mounting-plate perforation */
	.hero {
		background-image: radial-gradient(rgb(148 163 184 / 0.09) 1.2px, transparent 1.4px);
		background-size: 22px 22px;
		background-position: right top;
	}
</style>
