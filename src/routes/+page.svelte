<script lang="ts">
	import { t } from '#lib/i18n/i18n.svelte.js';
	import { resolve } from '$app/paths';
	import ContinueCard from '#lib/learn/ContinueCard.svelte';
	import HeroPlc from '#lib/components/HeroPlc.svelte';
	import { LESSONS } from '#lib/lessons/lessons.js';
	import { CHAPTERS } from '#lib/tutorial/chapters.js';
	import '@fontsource/barlow-condensed/600.css';
	import '@fontsource/barlow-condensed/700.css';

	const inside = $derived([
		{
			title: t('home.lang.title'),
			body: t('home.lang.body'),
			href: resolve('/editor/[id]', { id: 'demo' }),
			link: t('home.lang.link')
		},
		{
			title: t('home.learn.title', { chapters: CHAPTERS.length, lessons: LESSONS.length }),
			body: t('home.learn.body'),
			href: resolve('/learn'),
			link: t('home.learn.link')
		},
		{
			title: t('home.break.title'),
			body: t('home.break.body'),
			href: resolve('/oncall'),
			link: t('home.break.link')
		},
		{
			title: t('home.tools.title'),
			body: t('home.tools.body'),
			href: resolve('/projects'),
			link: t('home.tools.link')
		}
	]);
</script>

<section
	class="hero mx-auto grid max-w-6xl items-center gap-12 px-4 pt-16 pb-20 lg:grid-cols-[1fr_1.15fr]"
>
	<div>
		<h1 class="display text-5xl leading-[0.95] text-white sm:text-7xl">
			{t('home.headline')}
		</h1>
		<p class="mt-6 max-w-lg text-lg leading-relaxed text-slate-300">
			{t('home.lead')}
		</p>
		<div class="mt-8 flex flex-wrap gap-3">
			<a
				href={resolve('/learn')}
				class="rounded-md bg-emerald-500 px-5 py-2.5 font-medium text-slate-950 hover:bg-emerald-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300"
			>
				{t('home.learn.link')}
			</a>
			<a
				href={resolve('/editor/[id]', { id: 'demo' })}
				class="rounded-md border border-slate-600 px-5 py-2.5 font-medium text-slate-100 hover:border-slate-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-300"
			>
				{t('home.demo')}
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
		<h2 class="display text-3xl text-white">{t('home.inside')}</h2>
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
