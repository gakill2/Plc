<script lang="ts">
	import {
		allShapes,
		column,
		PAGES,
		STRIP_X1,
		TASKS,
		VOLTS,
		where,
		type Shape,
		type TestPoint
	} from './schematic.js';

	let pageNo = $state(1);
	const page = $derived(PAGES.find((p) => p.no === pageNo)!);
	let selected = $state<string | null>(null);
	let meter = $state(false);
	let reading = $state<TestPoint | null>(null);
	let side = $state<'devices' | 'strip'>('devices');

	/* tasks */
	let task = $state(0);
	let solved = $state<boolean[]>(TASKS.map(() => false));
	let feedback = $state<{ ok: boolean; text: string } | null>(null);
	let hint = $state(false);
	const current = $derived(TASKS[task]);

	const shapeById = (id: string) => allShapes.find((s) => s.id === id);
	const sel = $derived(selected ? shapeById(selected) : undefined);
	const wireSel = $derived(selected ? page.wires.find((w) => w.id === selected) : undefined);

	function go(id: string) {
		const s = shapeById(id);
		if (!s) return;
		pageNo = s.page;
		selected = id;
	}

	function answer(id: string, label: string) {
		if (!current || solved[task]) return;
		if (id === current.answer) {
			solved[task] = true;
			feedback = { ok: true, text: current.explanation };
		} else feedback = { ok: false, text: `To ${label} — nie to. Spróbuj jeszcze raz.` };
	}

	function pick(s: Shape) {
		selected = s.id;
		answer(s.id, `${s.tag}${s.part ? `:${s.part}` : ''} (${s.text})`);
	}

	function next() {
		if (task < TASKS.length - 1) task++;
		feedback = null;
		hint = false;
	}

	// the device list never changes: a plain map is fine
	const devices = (() => {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- built once
		const map = new Map<
			string,
			{ tag: string; text: string; places: { id: string; part?: string }[] }
		>();
		for (const s of allShapes) {
			const d = map.get(s.tag) ?? { tag: s.tag, text: s.text, places: [] };
			d.places.push({ id: s.id, part: s.part });
			map.set(s.tag, d);
		}
		return [...map.values()].sort((a, b) => a.tag.localeCompare(b.tag));
	})();

	const sameDevice = (s: Shape) => !!sel && sel.tag === s.tag && sel.id !== s.id;
	const stroke = (s: Shape) =>
		selected === s.id ? '#fbbf24' : sameDevice(s) ? '#fcd34d99' : '#cbd5e1';
	const volts = (p: TestPoint) => {
		const v = VOLTS[p.net] ?? 0;
		return p.net.startsWith('L') && !p.net.includes('+')
			? `${v} V AC (między fazami)`
			: `${v.toFixed(1)} V DC`;
	};
</script>

<figure class="space-y-3 rounded-xl border border-slate-800 bg-slate-900/60 p-4 text-xs" lang="pl">
	<figcaption class="text-sm font-semibold text-white">
		Schemat elektryczny taśmy T1 (jak w EPLAN): =T1 +S1
	</figcaption>

	<!-- tasks -->
	{#if current}
		<div class="rounded-lg border border-sky-500/30 bg-sky-500/5 p-3" aria-live="polite">
			<div class="mb-1 flex items-center gap-2 text-[11px] text-sky-300">
				<span>Zadanie {task + 1} / {TASKS.length}</span>
				<span class="ml-auto">{solved.filter(Boolean).length} rozwiązane</span>
			</div>
			<p class="text-sm text-slate-100">{current.question}</p>
			{#if feedback}
				<p class="mt-2 {feedback.ok ? 'text-emerald-300' : 'text-amber-300'}">
					{feedback.ok ? '✓ ' : ''}{feedback.text}
				</p>
			{/if}
			<div class="mt-2 flex gap-2">
				{#if !solved[task]}
					<button class="text-sky-300 underline" onclick={() => (hint = !hint)}>podpowiedź</button>
				{:else if task < TASKS.length - 1}
					<button class="rounded bg-sky-600 px-2 py-0.5 text-white hover:bg-sky-500" onclick={next}
						>Następne zadanie →</button
					>
				{:else}
					<span class="text-emerald-300">Wszystkie zadania rozwiązane.</span>
				{/if}
			</div>
			{#if hint && !solved[task]}<p class="mt-1 text-slate-400">{current.hint}</p>{/if}
		</div>
	{/if}

	<div class="flex flex-wrap items-center gap-1">
		{#each PAGES as p (p.no)}
			<button
				class="rounded px-2 py-1 {p.no === pageNo
					? 'bg-slate-700 text-white'
					: 'text-slate-400 hover:bg-slate-800'}"
				aria-pressed={p.no === pageNo}
				onclick={() => (pageNo = p.no)}>Strona {p.no}: {p.title}</button
			>
		{/each}
		<label class="ml-auto flex items-center gap-1 text-slate-300">
			<input type="checkbox" bind:checked={meter} onchange={() => (reading = null)} />
			🔌 multimetr
		</label>
	</div>

	<div class="grid gap-3 lg:grid-cols-[minmax(0,1fr)_15rem]">
		<svg
			viewBox="0 0 800 530"
			class="w-full rounded bg-slate-950"
			role="img"
			aria-label="Strona {page.no}: {page.title}"
		>
			<!-- frame: columns and title block -->
			<rect x="2" y="2" width="796" height="526" fill="none" stroke="#334155" />
			{#each [1, 2, 3, 4, 5, 6, 7, 8] as c (c)}
				<text x={c * 100 - 50} y="14" text-anchor="middle" font-size="10.5" fill="#64748b">{c}</text
				>
				{#if c < 8}<line x1={c * 100} x2={c * 100} y1="2" y2="20" stroke="#334155" />{/if}
			{/each}
			<rect x="520" y="490" width="278" height="38" fill="#0f172a" stroke="#334155" />
			<text x="530" y="506" font-size="12" fill="#cbd5e1">=T1 +S1 · {page.title}</text>
			<text x="530" y="521" font-size="10.5" fill="#64748b">Strona {page.no} / {PAGES.length}</text>

			<!-- rails -->
			{#each page.rails as r (r.name + r.y)}
				<line x1={r.x1} x2={r.x2} y1={r.y} y2={r.y} stroke="#94a3b8" stroke-width="1.5" />
				<text x={r.x1} y={r.y - 3} font-size="10.5" fill="#94a3b8">{r.name}</text>
				{#if r.ref && r.refTo}
					{@const to = r.refTo}
					<text
						x={r.x2}
						y={r.y - 3}
						text-anchor="end"
						font-size="10.5"
						fill="#38bdf8"
						class="cursor-pointer underline"
						role="link"
						tabindex="0"
						onclick={() => go(to)}
						onkeydown={(e) => e.key === 'Enter' && go(to)}>{r.ref}</text
					>
				{:else if r.ref}
					<text x={r.x2} y={r.y - 3} text-anchor="end" font-size="10.5" fill="#64748b">{r.ref}</text
					>
				{/if}
			{/each}

			<!-- wires -->
			{#each page.wires as w (w.id)}
				<polyline
					points={w.points.map((p) => p.join(',')).join(' ')}
					fill="none"
					stroke={selected === w.id ? '#fbbf24' : '#94a3b8'}
					stroke-width="1.5"
				/>
				<polyline
					points={w.points.map((p) => p.join(',')).join(' ')}
					fill="none"
					stroke="transparent"
					stroke-width="10"
					class="cursor-pointer"
					role="button"
					tabindex="-1"
					aria-label="przewód {w.id}"
					onclick={() => {
						selected = w.id;
						answer(w.id, 'ten przewód');
					}}
					onkeydown={() => {}}
				/>
			{/each}

			<!-- devices -->
			{#each page.shapes as s (s.id)}
				{@const c = stroke(s)}
				<g
					class="cursor-pointer"
					role="button"
					tabindex="0"
					aria-label="{s.tag}{s.part ? ` ${s.part}` : ''}"
					onclick={() => pick(s)}
					onkeydown={(e) => e.key === 'Enter' && pick(s)}
				>
					<rect x={s.x - 40} y={s.y - 32} width="80" height="64" fill="transparent" />
					{#if s.kind === 'contactNO' || s.kind === 'button'}
						<line x1={s.x} x2={s.x} y1={s.y - 25} y2={s.y - 12} stroke={c} stroke-width="1.5" />
						<line x1={s.x} x2={s.x} y1={s.y + 12} y2={s.y + 25} stroke={c} stroke-width="1.5" />
						<line
							x1={s.x}
							x2={s.x - 12}
							y1={s.y + 12}
							y2={s.y - 14}
							stroke={c}
							stroke-width="1.5"
						/>
						{#if s.kind === 'button'}
							<line
								x1={s.x - 6}
								x2={s.x - 24}
								y1={s.y}
								y2={s.y}
								stroke={c}
								stroke-dasharray="3 2"
							/>
							<line x1={s.x - 24} x2={s.x - 24} y1={s.y - 6} y2={s.y + 6} stroke={c} />
						{/if}
					{:else if s.kind === 'buttonNC'}
						<line x1={s.x} x2={s.x} y1={s.y - 25} y2={s.y - 12} stroke={c} stroke-width="1.5" />
						<line x1={s.x} x2={s.x + 8} y1={s.y - 12} y2={s.y - 12} stroke={c} stroke-width="1.5" />
						<line x1={s.x} x2={s.x} y1={s.y + 12} y2={s.y + 25} stroke={c} stroke-width="1.5" />
						<line x1={s.x} x2={s.x + 9} y1={s.y + 12} y2={s.y - 14} stroke={c} stroke-width="1.5" />
						<line x1={s.x + 4} x2={s.x - 24} y1={s.y} y2={s.y} stroke={c} stroke-dasharray="3 2" />
						<line x1={s.x - 24} x2={s.x - 24} y1={s.y - 6} y2={s.y + 6} stroke={c} />
					{:else if s.kind === 'coil'}
						<rect
							x={s.x - 16}
							y={s.y - 18}
							width="32"
							height="36"
							fill="none"
							stroke={c}
							stroke-width="1.5"
						/>
						<text x={s.x + 20} y={s.y - 14} font-size="9.5" fill="#64748b">A1</text>
						<text x={s.x + 20} y={s.y + 20} font-size="9.5" fill="#64748b">A2</text>
					{:else if s.kind === 'fuse'}
						<rect
							x={s.x - 7}
							y={s.y - 25}
							width="14"
							height="50"
							fill="none"
							stroke={c}
							stroke-width="1.5"
						/>
						<line x1={s.x} x2={s.x} y1={s.y - 25} y2={s.y + 25} stroke={c} />
					{:else if s.kind === 'breaker3' || s.kind === 'contacts3'}
						{#each [-20, 0, 20] as dx (dx)}
							<line
								x1={s.x + dx}
								x2={s.x + dx}
								y1={s.y - 25}
								y2={s.y - 12}
								stroke={c}
								stroke-width="1.5"
							/>
							<line
								x1={s.x + dx}
								x2={s.x + dx}
								y1={s.y + 12}
								y2={s.y + 25}
								stroke={c}
								stroke-width="1.5"
							/>
							<line
								x1={s.x + dx}
								x2={s.x + dx - 10}
								y1={s.y + 12}
								y2={s.y - 14}
								stroke={c}
								stroke-width="1.5"
							/>
							{#if s.kind === 'breaker3'}
								<text x={s.x + dx - 3} y={s.y - 12} font-size="9.5" fill={c}>×</text>
							{/if}
						{/each}
						<line x1={s.x - 25} x2={s.x + 15} y1={s.y} y2={s.y} stroke={c} stroke-dasharray="3 2" />
						{#if s.kind === 'breaker3'}
							<rect x={s.x + 28} y={s.y - 8} width="12" height="16" fill="none" stroke={c} />
							<text x={s.x + 30} y={s.y + 4} font-size="10.5" fill={c}>I&gt;</text>
						{/if}
					{:else if s.kind === 'motor'}
						<circle cx={s.x} cy={s.y} r="25" fill="none" stroke={c} stroke-width="1.5" />
						<text x={s.x} y={s.y - 2} text-anchor="middle" font-size="14" fill={c}>M</text>
						<text x={s.x} y={s.y + 12} text-anchor="middle" font-size="10.5" fill={c}>3~</text>
					{:else if s.kind === 'psu'}
						<rect
							x={s.x - 40}
							y={s.y - 35}
							width="80"
							height="70"
							fill="none"
							stroke={c}
							stroke-width="1.5"
						/>
						<text x={s.x} y={s.y + 4} text-anchor="middle" font-size="10.5" fill={c}
							>{s.tag === '-T1' ? 'AC / DC' : 'CPU'}</text
						>
					{:else if s.kind === 'terminal'}
						<circle cx={s.x} cy={s.y} r="7" fill="#0f172a" stroke={c} stroke-width="1.5" />
						<text x={s.x + 10} y={s.y + 3} font-size="9.5" fill="#94a3b8">{s.part}</text>
					{:else if s.kind === 'plcIn' || s.kind === 'plcOut'}
						<rect
							x={s.x - 34}
							y={s.y - 18}
							width="68"
							height="36"
							fill="#0f172a"
							stroke={c}
							stroke-width="1.5"
						/>
						<text
							x={s.x}
							y={s.y + 4}
							text-anchor="middle"
							font-size="12.5"
							font-family="monospace"
							fill={c}>{s.part}</text
						>
					{:else if s.kind === 'lamp'}
						<circle cx={s.x} cy={s.y} r="15" fill="none" stroke={c} stroke-width="1.5" />
						<line x1={s.x - 10} x2={s.x + 10} y1={s.y - 10} y2={s.y + 10} stroke={c} />
						<line x1={s.x - 10} x2={s.x + 10} y1={s.y + 10} y2={s.y - 10} stroke={c} />
					{:else if s.kind === 'sensor'}
						<rect
							x={s.x - 22}
							y={s.y - 28}
							width="44"
							height="56"
							fill="none"
							stroke={c}
							stroke-width="1.5"
						/>
						<text x={s.x} y={s.y + 2} text-anchor="middle" font-size="10.5" fill={c}>PNP</text>
						<text x={s.x - 12} y={s.y + 25} text-anchor="middle" font-size="8.5" fill="#64748b"
							>BN</text
						>
						<text x={s.x} y={s.y + 25} text-anchor="middle" font-size="8.5" fill="#64748b">BK</text>
						<text x={s.x + 12} y={s.y + 25} text-anchor="middle" font-size="8.5" fill="#64748b"
							>BU</text
						>
					{/if}
					{#if s.kind !== 'terminal'}
						<text
							x={s.x - (s.kind === 'psu' || s.kind === 'plcIn' || s.kind === 'plcOut' ? 38 : 28)}
							y={s.y - (s.kind === 'plcIn' || s.kind === 'plcOut' ? 22 : 4)}
							text-anchor="end"
							font-size="12"
							font-weight="bold"
							fill={selected === s.id ? '#fbbf24' : '#e2e8f0'}>{s.tag}</text
						>
					{/if}
					{#if s.refs?.length}
						{#each s.refs as r, i (r)}
							<text
								x={s.x + 26}
								y={s.y + 34 + i * 10}
								font-size="9.5"
								fill="#38bdf8"
								class="underline"
								role="link"
								tabindex="0"
								onclick={(e) => {
									e.stopPropagation();
									go(r);
								}}
								onkeydown={(e) => e.key === 'Enter' && go(r)}>{where(r)}</text
							>
						{/each}
					{/if}
				</g>
				{#if s.mirror}
					<!-- contact mirror: where the contacts of this coil are drawn -->
					<g>
						<line x1={s.x + 14} x2={s.x + 84} y1={s.y + 46} y2={s.y + 46} stroke="#475569" />
						{#each s.mirror as [part, id], i (part)}
							<text x={s.x + 16} y={s.y + 60 + i * 13} font-size="9.5" fill="#94a3b8">{part}</text>
							<text
								x={s.x + 54}
								y={s.y + 60 + i * 13}
								font-size="9.5"
								fill="#38bdf8"
								class="cursor-pointer underline"
								role="link"
								tabindex="0"
								onclick={() => go(id)}
								onkeydown={(e) => e.key === 'Enter' && go(id)}>{where(id)}</text
							>
						{/each}
					</g>
				{/if}
			{/each}

			{#each page.notes ?? [] as n (n.text)}
				<text
					x={n.x}
					y={n.y}
					text-anchor="middle"
					font-size="10.5"
					fill="#38bdf8"
					class="cursor-pointer underline"
					role="link"
					tabindex="0"
					onclick={() => n.refTo && go(n.refTo)}
					onkeydown={(e) => e.key === 'Enter' && n.refTo && go(n.refTo)}>{n.text}</text
				>
			{/each}

			<!-- multimeter test points -->
			{#if meter}
				{#each page.points as p (p.id)}
					<circle
						cx={p.x}
						cy={p.y}
						r="6"
						fill={reading?.id === p.id ? '#fbbf24' : '#f43f5e'}
						class="cursor-pointer"
						role="button"
						tabindex="0"
						aria-label="punkt pomiarowy {p.label}"
						onclick={() => (reading = p)}
						onkeydown={(e) => e.key === 'Enter' && (reading = p)}
					/>
				{/each}
			{/if}
		</svg>

		<aside class="space-y-2">
			{#if meter && reading}
				<div class="rounded border border-rose-500/40 bg-rose-500/10 p-2" role="status">
					<p class="text-slate-300">{reading.label}</p>
					<p class="font-mono text-lg text-white">{volts(reading)}</p>
				</div>
			{:else if meter}
				<p class="text-slate-400">Kliknij czerwony punkt pomiarowy (napięcie względem M).</p>
			{/if}
			{#if sel}
				<div class="rounded border border-amber-500/30 bg-amber-500/5 p-2">
					<p class="font-semibold text-amber-200">
						{sel.tag}{sel.part ? ` : ${sel.part}` : ''}
						<span class="font-normal text-slate-500">/{sel.page}.{column(sel.x)}</span>
					</p>
					<p class="text-slate-300">{sel.text}</p>
				</div>
			{:else if wireSel}
				<p class="rounded border border-amber-500/30 bg-amber-500/5 p-2 text-slate-300">
					Przewód, potencjał {wireSel.net}
				</p>
			{/if}
			<div class="flex gap-1">
				<button
					class="rounded px-2 py-0.5 {side === 'devices'
						? 'bg-slate-700 text-white'
						: 'text-slate-400'}"
					onclick={() => (side = 'devices')}>Lista aparatów</button
				>
				<button
					class="rounded px-2 py-0.5 {side === 'strip'
						? 'bg-slate-700 text-white'
						: 'text-slate-400'}"
					onclick={() => (side = 'strip')}>Listwa -X1</button
				>
			</div>
			{#if side === 'devices'}
				<ul class="max-h-72 space-y-1 overflow-auto" aria-label="Lista aparatów">
					{#each devices as d (d.tag)}
						<li>
							<span class="font-mono font-semibold text-slate-200">{d.tag}</span>
							{#each d.places as p (p.id)}
								<button class="ml-1 text-sky-300 underline" onclick={() => go(p.id)}
									>{p.part ?? ''} {where(p.id)}</button
								>
							{/each}
						</li>
					{/each}
				</ul>
			{:else}
				<table class="w-full" aria-label="Listwa -X1">
					<thead class="text-left text-slate-500">
						<tr><th>zacisk</th><th>szafa</th><th>pole</th></tr>
					</thead>
					<tbody>
						{#each STRIP_X1 as [t, inside, outside] (t)}
							<tr class="border-t border-slate-800 font-mono text-slate-300">
								<td>{t}</td><td>{inside}</td><td>{outside}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			{/if}
		</aside>
	</div>
</figure>
