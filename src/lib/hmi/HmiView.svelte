<script lang="ts">
	import { parseAddress, type Address } from '#lib/engine/index.js';
	import type { RuntimeSnapshot } from '#lib/runtime/protocol.js';
	import { readBit, readNumber } from '#lib/runtime/read.js';
	import type { SymbolMap } from '#lib/symbols/symbols.js';
	import { activeAlarms, alarmState, formatTime, type AlarmLog } from './alarms.js';
	import {
		alarm,
		HMI_HEIGHT,
		HMI_WIDTH,
		toEng,
		toRaw,
		widget,
		WIDGET_NAMES,
		WRITES,
		type Hmi,
		type HmiColor,
		type HmiWidget,
		type WidgetKind
	} from './model.js';

	type Props = {
		hmi: Hmi;
		symbols: SymbolMap;
		/** symbol names for the tag autocomplete */
		names: string[];
		snapshot: RuntimeSnapshot | null;
		online: boolean;
		log: AlarmLog;
		onWrite: (address: string, value: number) => void;
		onAck: (seqs?: number[]) => void;
	};
	let { hmi, symbols, names, snapshot, online, log, onWrite, onAck }: Props = $props();

	const editing = $derived(!online);
	let selectedId = $state<string | null>(null);
	let panel = $state<'widget' | 'alarms'>('widget');
	const selected = $derived(hmi.widgets.find((w) => w.id === selectedId) ?? null);

	/* ---------- tags ---------- */

	function address(tag: string): Address | null {
		const t = tag.trim();
		if (!t) return null;
		try {
			return parseAddress(symbols.get(t.toUpperCase()) ?? t);
		} catch {
			return null;
		}
	}
	const bit = (tag: string) => {
		const a = address(tag);
		return a && snapshot ? readBit(snapshot, a) : null;
	};
	const num = (tag: string) => {
		const a = address(tag);
		return a && snapshot ? readNumber(snapshot, a) : null;
	};
	const writable = (tag: string) => {
		const a = address(tag);
		return a !== null && (a.area === 'M' || a.area === 'Q');
	};
	function write(tag: string, value: number) {
		const a = address(tag);
		if (a && writable(tag)) onWrite(symbols.get(tag.trim().toUpperCase()) ?? tag.trim(), value);
	}

	/* ---------- editing: add, drag, resize ---------- */

	const KINDS = Object.keys(WIDGET_NAMES) as WidgetKind[];
	const COLORS: HmiColor[] = ['green', 'red', 'amber', 'blue', 'grey'];
	const FILL: Record<HmiColor, string> = {
		green: '#22c55e',
		red: '#ef4444',
		amber: '#f59e0b',
		blue: '#3b82f6',
		grey: '#94a3b8'
	};
	const snap = (v: number) => Math.round(v / 10) * 10;

	function add(kind: WidgetKind) {
		const n = hmi.widgets.length;
		const w = widget(kind, 20 + (n % 5) * 30, 20 + (n % 8) * 30);
		hmi.widgets.push(w);
		selectedId = w.id;
		panel = 'widget';
	}
	function remove() {
		hmi.widgets = hmi.widgets.filter((w) => w.id !== selectedId);
		selectedId = null;
	}

	let screenW = $state(HMI_WIDTH);
	let availH = $state(600);
	let drag: {
		id: string;
		mode: 'move' | 'size';
		sx: number;
		sy: number;
		ox: number;
		oy: number;
	} | null = null;
	const scaleOf = () => screenW / HMI_WIDTH;

	function startDrag(e: PointerEvent, w: HmiWidget, mode: 'move' | 'size') {
		if (!editing) return;
		e.stopPropagation();
		selectedId = w.id;
		panel = 'widget';
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
		drag = {
			id: w.id,
			mode,
			sx: e.clientX,
			sy: e.clientY,
			ox: mode === 'move' ? w.x : w.w,
			oy: mode === 'move' ? w.y : w.h
		};
	}
	function onMove(e: PointerEvent) {
		if (!drag) return;
		const w = hmi.widgets.find((x) => x.id === drag!.id);
		if (!w) return;
		const k = scaleOf();
		const dx = (e.clientX - drag.sx) / k;
		const dy = (e.clientY - drag.sy) / k;
		if (drag.mode === 'move') {
			w.x = Math.max(0, Math.min(HMI_WIDTH - w.w, snap(drag.ox + dx)));
			w.y = Math.max(0, Math.min(HMI_HEIGHT - w.h, snap(drag.oy + dy)));
		} else {
			w.w = Math.max(40, Math.min(HMI_WIDTH - w.x, snap(drag.ox + dx)));
			w.h = Math.max(20, Math.min(HMI_HEIGHT - w.y, snap(drag.oy + dy)));
		}
	}
	const endDrag = () => (drag = null);

	function onKeydown(e: KeyboardEvent) {
		if (!editing || !selected || (e.target as HTMLElement).closest('input, select, textarea'))
			return;
		if (e.key === 'Delete' || e.key === 'Backspace') {
			e.preventDefault();
			remove();
		}
	}

	/* ---------- run mode helpers ---------- */

	const fmt = (w: HmiWidget, raw: number | null) =>
		raw === null ? '—' : toEng(w, raw).toFixed(w.decimals);
	const percent = (w: HmiWidget, raw: number | null) =>
		raw === null ? 0 : Math.max(0, Math.min(1, (toEng(w, raw) - w.min) / (w.max - w.min || 1)));
	const active = $derived(activeAlarms(log));
	const banner = $derived(active.find((e) => e.acked === null) ?? null);

	const field =
		'w-full rounded border border-slate-700 bg-slate-900 px-1.5 py-1 text-xs text-slate-100 outline-none focus:border-sky-400';
	const tagIssue = (w: HmiWidget) =>
		!w.tag.trim()
			? w.kind === 'label' || w.kind === 'alarms'
				? null
				: 'Brak tagu'
			: address(w.tag) === null
				? `Nieznany tag „${w.tag}”`
				: WRITES.has(w.kind) && !writable(w.tag)
					? 'Panel może zapisywać tylko M lub Q (np. M10.0)'
					: null;
</script>

<svelte:window onkeydown={onKeydown} onpointermove={onMove} onpointerup={endDrag} />

<datalist id="hmi-tags">
	{#each names as n (n)}<option value={n}></option>{/each}
</datalist>

<div class="flex h-full min-h-0 gap-4 overflow-auto p-4">
	<div class="flex min-w-0 flex-1 flex-col gap-2" bind:clientHeight={availH}>
		<div class="flex flex-wrap items-center gap-1 text-xs">
			{#if editing}
				<span class="mr-1 font-semibold tracking-wider text-sky-300 uppercase">Dodaj</span>
				{#each KINDS as k (k)}
					<button
						class="rounded bg-slate-800 px-2 py-1 text-slate-200 hover:bg-slate-700"
						onclick={() => add(k)}>+ {WIDGET_NAMES[k]}</button
					>
				{/each}
				<span class="ml-auto text-slate-500"
					>Edycja — uruchom PLC (▶ Run), żeby sterować z panelu.</span
				>
			{:else}
				<span class="rounded bg-emerald-500/15 px-2 py-1 text-emerald-300">● Panel online</span>
				<span class="text-slate-500">Zatrzymaj PLC, żeby edytować panel.</span>
			{/if}
		</div>

		<!-- the screen: fixed 800 × 480, scaled to the available width -->
		<div
			class="w-full"
			style:max-width="{Math.max(320, Math.min(896, ((availH - 80) * HMI_WIDTH) / HMI_HEIGHT))}px"
		>
			<div
				bind:clientWidth={screenW}
				class="relative w-full overflow-hidden rounded-lg border-8 border-slate-700 bg-slate-200 text-slate-900 shadow-xl select-none"
				style:aspect-ratio="{HMI_WIDTH} / {HMI_HEIGHT}"
				role="application"
				aria-label="Panel HMI"
			>
				<div
					class="absolute top-0 left-0 origin-top-left"
					style:width="{HMI_WIDTH}px"
					style:height="{HMI_HEIGHT}px"
					style:transform="scale({screenW / HMI_WIDTH})"
					onpointerdown={() => editing && (selectedId = null)}
					role="presentation"
				>
					{#if editing}
						<div
							class="pointer-events-none absolute inset-0"
							style="background-image: radial-gradient(#94a3b8 1px, transparent 1px); background-size: 20px 20px; opacity: .35"
						></div>
					{/if}
					{#if banner && !editing}
						<button
							class="absolute inset-x-0 top-0 z-20 flex items-center gap-2 px-3 py-1 text-left text-sm font-semibold text-white {banner.kind ===
							'alarm'
								? 'bg-red-600'
								: 'bg-amber-500'}"
							onclick={() => onAck([banner.seq])}
							title="Kliknij, aby potwierdzić"
						>
							⚠ {banner.text}
							<span class="ml-auto text-xs font-normal opacity-80">kliknij = potwierdź (ACK)</span>
						</button>
					{/if}

					{#each hmi.widgets as w (w.id)}
						{@const sel = editing && w.id === selectedId}
						{@const issue = editing ? tagIssue(w) : null}
						<div
							class="absolute {sel
								? 'z-10 outline-2 outline-offset-2 outline-sky-500'
								: ''} {editing ? 'cursor-move' : ''}"
							style:left="{w.x}px"
							style:top="{w.y}px"
							style:width="{w.w}px"
							style:height="{w.h}px"
							onpointerdown={(e) => startDrag(e, w, 'move')}
							role="presentation"
							title={issue ?? undefined}
						>
							{#if w.kind === 'label'}
								<div class="flex h-full items-center text-lg font-semibold">{w.text}</div>
							{:else if w.kind === 'button'}
								{@const on = bit(w.tag)}
								<button
									class="h-full w-full rounded-md border-b-4 text-sm font-semibold text-white shadow active:translate-y-0.5 {on
										? 'brightness-110'
										: ''}"
									style:background-color={FILL[w.color]}
									style:border-color="rgba(0,0,0,.25)"
									disabled={editing}
									aria-label="HMI {w.text}"
									onpointerdown={(e) => {
										if (editing) return;
										(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
										write(w.tag, 1);
									}}
									onpointerup={() => !editing && write(w.tag, 0)}
									onpointercancel={() => !editing && write(w.tag, 0)}>{w.text}</button
								>
							{:else if w.kind === 'switch'}
								{@const on = bit(w.tag) ?? false}
								<button
									class="flex h-full w-full items-center gap-2 rounded-md border border-slate-400 bg-white px-2 text-sm"
									disabled={editing}
									role="switch"
									aria-checked={on}
									aria-label="HMI {w.text}"
									onclick={() => write(w.tag, on ? 0 : 1)}
								>
									<span
										class="relative h-6 w-11 shrink-0 rounded-full transition-colors"
										style:background-color={on ? FILL[w.color] : '#cbd5e1'}
										><span
											class="absolute top-0.5 size-5 rounded-full bg-white shadow transition-all"
											style:left={on ? '22px' : '2px'}
										></span></span
									>
									{w.text}
								</button>
							{:else if w.kind === 'lamp'}
								{@const on = bit(w.tag) ?? false}
								<div
									class="flex h-full items-center gap-2 rounded-md border border-slate-300 bg-white px-2 text-sm"
								>
									<span
										class="size-6 shrink-0 rounded-full border-2 border-slate-400"
										style:background-color={on ? FILL[w.color] : '#e2e8f0'}
										style:box-shadow={on ? `0 0 10px ${FILL[w.color]}` : undefined}
										role="img"
										aria-label="HMI {w.text} {on ? 'on' : 'off'}"
									></span>
									{w.text}
								</div>
							{:else if w.kind === 'value'}
								<div
									class="flex h-full flex-col justify-center rounded-md border border-slate-300 bg-white px-2"
								>
									<span class="text-[11px] text-slate-500">{w.text}</span>
									<span class="font-mono text-xl" aria-label="HMI {w.text} value"
										>{fmt(w, num(w.tag))} <span class="text-sm text-slate-500">{w.unit}</span></span
									>
								</div>
							{:else if w.kind === 'input'}
								<label
									class="flex h-full flex-col justify-center rounded-md border border-sky-300 bg-white px-2"
								>
									<span class="text-[11px] text-slate-500">{w.text}</span>
									<span class="flex items-baseline gap-1">
										<input
											class="w-full min-w-0 rounded border border-slate-300 px-1 font-mono text-lg"
											type="number"
											value={editing ? '' : fmt(w, num(w.tag))}
											disabled={editing}
											aria-label="HMI {w.text}"
											onchange={(e) => write(w.tag, toRaw(w, Number(e.currentTarget.value)))}
										/>
										<span class="text-sm text-slate-500">{w.unit}</span>
									</span>
								</label>
							{:else if w.kind === 'bar'}
								{@const raw = num(w.tag)}
								<div
									class="flex h-full flex-col justify-center rounded-md border border-slate-300 bg-white px-2"
								>
									<span class="flex justify-between text-[11px] text-slate-500"
										><span>{w.text}</span><span class="font-mono">{fmt(w, raw)} {w.unit}</span
										></span
									>
									<span class="mt-1 h-3 overflow-hidden rounded bg-slate-200">
										<span
											class="block h-full transition-all"
											style:width="{percent(w, raw) * 100}%"
											style:background-color={FILL[w.color]}
										></span>
									</span>
								</div>
							{:else if w.kind === 'alarms'}
								<div
									class="flex h-full flex-col overflow-hidden rounded-md border border-slate-400 bg-white text-xs"
								>
									<div class="flex items-center justify-between bg-slate-700 px-2 py-1 text-white">
										<span>Alarmy ({active.length})</span>
										<button
											class="rounded bg-slate-500 px-2 text-[11px] hover:bg-slate-400 disabled:opacity-50"
											disabled={editing || active.every((e) => e.acked !== null)}
											onclick={() => onAck()}>ACK</button
										>
									</div>
									<div class="flex-1 overflow-auto">
										{#each active as e (e.seq)}
											<div
												class="flex gap-2 border-b border-slate-200 px-2 py-0.5 {e.kind === 'alarm'
													? e.gone === null
														? 'bg-red-100 text-red-900'
														: 'text-red-800'
													: 'text-amber-800'} {e.acked === null ? 'font-semibold' : ''}"
											>
												<span class="font-mono">{formatTime(e.came)}</span>
												<span class="w-7 font-mono">{alarmState(e)}</span>
												<span class="flex-1">{e.text}</span>
											</div>
										{:else}
											<div class="px-2 py-1 text-slate-400">Brak aktywnych alarmów</div>
										{/each}
									</div>
								</div>
							{/if}
							{#if issue}
								<span
									class="absolute -top-2 -right-2 grid size-4 place-items-center rounded-full bg-amber-400 text-[10px] font-bold text-slate-900"
									>!</span
								>
							{/if}
							{#if sel}
								<span
									class="absolute -right-1.5 -bottom-1.5 size-3 cursor-nwse-resize rounded-sm bg-sky-500"
									onpointerdown={(e) => startDrag(e, w, 'size')}
									role="presentation"
								></span>
							{/if}
						</div>
					{/each}
				</div>
			</div>
		</div>
		<p class="text-xs text-slate-500">
			Ekran 800 × 480 (jak typowy panel 7"). Przyciski i pola panelu zapisują markery M (np. M10.0),
			a program czyta je tak jak wejścia.
		</p>
	</div>

	<!-- properties -->
	<aside class="w-72 shrink-0 space-y-3 overflow-auto text-xs">
		<div class="flex gap-0.5 rounded-md border border-slate-800 bg-slate-900 p-0.5">
			{#each [['widget', 'Element'], ['alarms', `Alarmy (${hmi.alarms.length})`]] as const as [id, label] (id)}
				<button
					class="flex-1 rounded px-2 py-1 {panel === id
						? 'bg-slate-700 text-white'
						: 'text-slate-400'}"
					onclick={() => (panel = id)}>{label}</button
				>
			{/each}
		</div>

		{#if panel === 'widget'}
			{#if selected}
				<div class="space-y-2">
					<p class="font-semibold text-slate-200">{WIDGET_NAMES[selected.kind]}</p>
					{#if selected.kind !== 'alarms'}
						<label class="block text-slate-400"
							>Tekst<input class={field} bind:value={selected.text} disabled={!editing} /></label
						>
					{/if}
					{#if selected.kind !== 'label' && selected.kind !== 'alarms'}
						<label class="block text-slate-400"
							>Tag (symbol lub adres)
							<input
								class="{field} font-mono"
								list="hmi-tags"
								bind:value={selected.tag}
								disabled={!editing}
								placeholder={WRITES.has(selected.kind) ? 'np. M10.0' : 'np. Motor'}
							/>
						</label>
						{#if tagIssue(selected)}<p class="text-amber-300">{tagIssue(selected)}</p>{/if}
					{/if}
					{#if ['button', 'switch', 'lamp', 'bar'].includes(selected.kind)}
						<div class="flex gap-1" role="group" aria-label="Kolor">
							{#each COLORS as c (c)}
								<button
									class="size-6 rounded-full border-2 {selected.color === c
										? 'border-white'
										: 'border-transparent'}"
									style:background-color={FILL[c]}
									aria-label={c}
									disabled={!editing}
									onclick={() => (selected.color = c)}
								></button>
							{/each}
						</div>
					{/if}
					{#if ['value', 'input', 'bar'].includes(selected.kind)}
						<div class="grid grid-cols-2 gap-2">
							<label class="text-slate-400"
								>Jednostka<input
									class={field}
									bind:value={selected.unit}
									disabled={!editing}
								/></label
							>
							<label class="text-slate-400"
								>Miejsca po przecinku<input
									class={field}
									type="number"
									min="0"
									max="3"
									bind:value={selected.decimals}
									disabled={!editing}
								/></label
							>
							<label class="col-span-2 text-slate-400"
								>Skalowanie: 27648 = … (0 = wartość surowa)
								<input
									class={field}
									type="number"
									bind:value={selected.scale}
									disabled={!editing}
								/>
							</label>
							{#if selected.kind === 'bar'}
								<label class="text-slate-400"
									>Min<input
										class={field}
										type="number"
										bind:value={selected.min}
										disabled={!editing}
									/></label
								>
								<label class="text-slate-400"
									>Max<input
										class={field}
										type="number"
										bind:value={selected.max}
										disabled={!editing}
									/></label
								>
							{/if}
						</div>
					{/if}
					<p class="text-slate-500">
						Pozycja {selected.x}, {selected.y} · rozmiar {selected.w} × {selected.h} — przeciągnij element
						albo niebieski róg.
					</p>
					{#if editing}
						<button
							class="rounded border border-red-500/50 px-2 py-1 text-red-300 hover:bg-red-500/10"
							onclick={remove}>Usuń element (Del)</button
						>
					{/if}
				</div>
			{:else}
				<p class="text-slate-500">
					{editing
						? 'Kliknij element na ekranie, żeby zmienić jego tag i wygląd, albo dodaj nowy przyciskiem „+”.'
						: 'Panel działa — przyciski i pola zapisują do sterownika, lampki i wartości pokazują stan na żywo.'}
				</p>
			{/if}
		{:else}
			<div class="space-y-2">
				<p class="text-slate-400">
					Alarm pojawia się, gdy jego bit = 1. Operator potwierdza go (ACK); znika z listy, gdy
					ustąpi i jest potwierdzony.
				</p>
				{#each hmi.alarms as a (a.id)}
					<div class="space-y-1 rounded border border-slate-800 p-2">
						<input
							class="{field} font-mono"
							list="hmi-tags"
							placeholder="bit, np. Fault"
							bind:value={a.tag}
							disabled={!editing}
							aria-label="Bit alarmu"
						/>
						<input
							class={field}
							placeholder="tekst alarmu"
							bind:value={a.text}
							disabled={!editing}
							aria-label="Tekst alarmu"
						/>
						<div class="flex items-center gap-2">
							<select
								class="{field} w-auto"
								bind:value={a.kind}
								disabled={!editing}
								aria-label="Klasa alarmu"
							>
								<option value="alarm">alarm (czerwony)</option>
								<option value="warning">ostrzeżenie (żółte)</option>
							</select>
							{#if editing}
								<button
									class="ml-auto text-red-300 hover:underline"
									onclick={() => (hmi.alarms = hmi.alarms.filter((x) => x.id !== a.id))}
									>usuń</button
								>
							{/if}
						</div>
					</div>
				{/each}
				{#if editing}
					<button
						class="rounded bg-slate-800 px-2 py-1 text-slate-200 hover:bg-slate-700"
						onclick={() => hmi.alarms.push(alarm('', 'Nowy alarm'))}>+ Alarm</button
					>
				{/if}
				<label class="block text-slate-400"
					>Bit potwierdzenia (ACK) — impuls przy potwierdzeniu
					<input
						class="{field} font-mono"
						list="hmi-tags"
						placeholder="np. M20.0"
						bind:value={hmi.ackTag}
						disabled={!editing}
					/>
				</label>
				<h3 class="pt-2 font-semibold text-slate-300">Historia</h3>
				<div class="max-h-60 space-y-0.5 overflow-auto font-mono text-[11px]">
					{#each log.entries as e (e.seq)}
						<div class={e.kind === 'alarm' ? 'text-red-300' : 'text-amber-300'}>
							{formatTime(e.came)}
							{alarmState(e).padEnd(3)}
							{e.text}
						</div>
					{:else}
						<div class="text-slate-500">pusto</div>
					{/each}
				</div>
			</div>
		{/if}
	</aside>
</div>
