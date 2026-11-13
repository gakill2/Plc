<script lang="ts">
	import type { PlcRuntime } from '#lib/runtime/runtime.svelte.js';

	/** `labels`: device names per terminal; wired inputs are driven by their device. */
	type Props = { runtime: PlcRuntime; bytes?: number; labels?: ReadonlyMap<string, string> };
	let { runtime, bytes = 2, labels = new Map() }: Props = $props();

	const terminals = (area: 'I' | 'Q') =>
		Array.from({ length: bytes * 8 }, (_, i) => ({
			address: `${area}${Math.floor(i / 8)}.${i % 8}`,
			byte: Math.floor(i / 8),
			bit: i % 8
		}));
	const inputs = terminals('I');
	const outputs = terminals('Q');

	const read = (data: Uint8Array | undefined, byte: number, bit: number) =>
		data ? ((data[byte] >> bit) & 1) === 1 : false;

	const isOn = (byte: number, bit: number) => read(runtime.snapshot?.inputs, byte, bit);
	const isLit = (byte: number, bit: number) => read(runtime.snapshot?.outputs, byte, bit);
</script>

<section aria-labelledby="io-title" class="space-y-3">
	<h2 id="io-title" class="text-xs font-semibold tracking-wider text-slate-400 uppercase">
		I/O terminals
	</h2>

	<div>
		<h3 class="mb-1.5 text-[11px] text-slate-500">
			Inputs — click to toggle, hold ● for a push button
		</h3>
		<div class="grid grid-cols-2 gap-1">
			{#each inputs as t (t.address)}
				{@const on = isOn(t.byte, t.bit)}
				<div class="flex items-center gap-1">
					<button
						class="flex flex-1 items-center gap-2 rounded border px-2 py-1 font-mono text-xs transition-colors {on
							? 'border-emerald-500/60 bg-emerald-500/15 text-emerald-200'
							: 'border-slate-800 bg-slate-900 text-slate-300 hover:border-slate-600'}"
						aria-pressed={on}
						disabled={labels.has(t.address)}
						title={labels.has(t.address)
							? `Driven by ${labels.get(t.address)} (circuit)`
							: undefined}
						onclick={() => runtime.setInput(t.address, !on)}
					>
						<span
							class="h-3 w-5 rounded-full p-px transition-colors {on
								? 'bg-emerald-400'
								: 'bg-slate-700'}"
						>
							<span
								class="block size-2.5 rounded-full bg-white transition-transform {on
									? 'translate-x-2'
									: ''}"
							></span>
						</span>
						{t.address}
						<span class="truncate font-sans text-[10px] text-sky-300"
							>{labels.get(t.address) ?? ''}</span
						>
					</button>
					<button
						class="grid size-6 place-items-center rounded-full border border-slate-700 bg-slate-800 text-[10px] text-slate-300 select-none hover:border-slate-500 active:bg-emerald-500 active:text-slate-950"
						title="Push button {t.address} (momentary)"
						aria-label="Push {t.address}"
						disabled={labels.has(t.address)}
						onpointerdown={() => runtime.setInput(t.address, true)}
						onpointerup={() => runtime.setInput(t.address, false)}
						onpointerleave={(e) => {
							if (e.buttons) runtime.setInput(t.address, false);
						}}>●</button
					>
				</div>
			{/each}
		</div>
	</div>

	<div>
		<h3 class="mb-1.5 text-[11px] text-slate-500">Outputs</h3>
		<div class="grid grid-cols-4 gap-1">
			{#each outputs as t (t.address)}
				{@const lit = isLit(t.byte, t.bit)}
				<div
					class="flex flex-col items-center gap-1 rounded border border-slate-800 bg-slate-900 py-1.5"
					aria-label="{t.address} {lit ? 'on' : 'off'}"
				>
					<span
						class="size-3 rounded-full transition-all {lit
							? 'bg-amber-300 shadow-[0_0_10px] shadow-amber-300/80'
							: 'bg-slate-700'}"
					></span>
					<span class="font-mono text-[10px] text-slate-400">{t.address}</span>
					<span class="w-full truncate px-1 text-center text-[9px] text-amber-200/80"
						>{labels.get(t.address) ?? ''}</span
					>
				</div>
			{/each}
		</div>
	</div>
</section>
