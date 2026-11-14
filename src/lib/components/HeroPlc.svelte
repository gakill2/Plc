<script lang="ts">
	import { t } from '#lib/i18n/i18n.svelte.js';
	import { onMount } from 'svelte';
	import { Plc } from '#lib/engine/index.js';
	import { compileSt } from '#lib/st/compiler.js';

	/**
	 * A working PLC on the landing page: two push buttons, a motor and a lamp wired to a small CPU
	 * module that runs a real program — the same compiler and VM as the editor.
	 */
	const PROGRAM = `VAR ready : TON; END_VAR
Motor := (Start OR Motor) AND NOT Stop;
ready(IN := Motor, PT := T#1s);
Running := ready.Q;`;
	const SYMBOLS = new Map([
		['START', 'I0.0'],
		['STOP', 'I0.1'],
		['MOTOR', 'Q0.0'],
		['RUNNING', 'Q0.1']
	]);

	const EIGHT = [0, 1, 2, 3, 4, 5, 6, 7];
	const FOUR = [0, 1, 2, 3];
	const plc = new Plc();
	let inputs = $state([false, false, false, false, false, false, false, false]);
	let outputs = $state([false, false, false, false, false, false, false, false]);
	let scans = $state(0);
	let start = $state(false);
	let stop = $state(false);

	onMount(() => {
		const r = compileSt(PROGRAM, { symbols: SYMBOLS });
		plc.load(r.program);
		plc.run();
		let last = performance.now();
		let debt = 0;
		let frame = requestAnimationFrame(function loop(now) {
			debt += Math.min(200, now - last);
			last = now;
			plc.setInput('I0.0', start);
			plc.setInput('I0.1', stop);
			while (debt >= 10) {
				plc.scan(10);
				debt -= 10;
			}
			const s = plc.snapshot();
			inputs = Array.from({ length: 8 }, (_, i) => ((s.inputs[0] >> i) & 1) === 1);
			outputs = Array.from({ length: 8 }, (_, i) => ((s.outputs[0] >> i) & 1) === 1);
			scans = s.scanCount;
			frame = requestAnimationFrame(loop);
		});
		return () => cancelAnimationFrame(frame);
	});

	/** a push button: on while held (pointer or keyboard) */
	function hold(set: (v: boolean) => void) {
		return {
			onpointerdown: (e: PointerEvent) => {
				(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
				set(true);
			},
			onpointerup: () => set(false),
			onpointercancel: () => set(false),
			onkeydown: (e: KeyboardEvent) => {
				if (e.key === ' ' || e.key === 'Enter') {
					e.preventDefault();
					set(true);
				}
			},
			onkeyup: () => set(false),
			onblur: () => set(false)
		};
	}
	const startBtn = hold((v) => (start = v));
	const stopBtn = hold((v) => (stop = v));
	const motor = $derived(outputs[0]);
	const lamp = $derived(outputs[1]);
</script>

<figure class="hero-plc" aria-label={t('hero.label')}>
	<svg viewBox="0 0 520 400" role="presentation" class="w-full">
		<!-- DIN rail -->
		<rect x="0" y="150" width="520" height="22" fill="#9aa3a8" />
		<rect x="0" y="156" width="520" height="10" fill="#7d868b" />

		<!-- wires: control voltage in dark blue, like in a cabinet -->
		<g fill="none" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
			<path d="M70 290 V276 H132 V252" stroke={start ? '#60a5fa' : '#1e3a8a'} />
			<path d="M190 290 V284 H152 V252" stroke={stop ? '#60a5fa' : '#1e3a8a'} />
			<path d="M300 252 V276 H400 V300" stroke={motor ? '#60a5fa' : '#1e3a8a'} />
			<path d="M320 252 V268 H470 V302" stroke={lamp ? '#60a5fa' : '#1e3a8a'} />
		</g>

		<!-- the CPU module, light grey housing -->
		<rect x="110" y="70" width="270" height="190" rx="6" fill="#c9cdc8" />
		<rect x="110" y="70" width="270" height="36" rx="6" fill="#aeb3ad" />
		<rect x="110" y="226" width="270" height="34" rx="6" fill="#aeb3ad" />
		<text x="126" y="93" class="print">CPU · PLC Sim</text>
		<circle
			cx="300"
			cy="88"
			r="5"
			fill={scans > 0 ? '#3ddc84' : '#3a4045'}
			class:glow={scans > 0}
		/>
		<text x="310" y="92" class="print small">RUN</text>
		<circle cx="340" cy="88" r="5" fill="#3a4045" />
		<text x="350" y="92" class="print small">ERR</text>

		<!-- I/O status LEDs -->
		<text x="126" y="137" class="print small">DI a</text>
		<text x="126" y="175" class="print small">DQ a</text>
		{#each inputs as on, i (i)}
			<rect
				x={160 + i * 26}
				y="127"
				width="14"
				height="9"
				rx="2"
				fill={on ? '#3ddc84' : '#3a4045'}
				class:glow={on}
			/>
			<text x={167 + i * 26} y="150" text-anchor="middle" class="print tiny">.{i}</text>
		{/each}
		{#each outputs as on, i (i)}
			<rect
				x={160 + i * 26}
				y="165"
				width="14"
				height="9"
				rx="2"
				fill={on ? '#3ddc84' : '#3a4045'}
				class:glow={on}
			/>
			<text x={167 + i * 26} y="188" text-anchor="middle" class="print tiny">.{i}</text>
		{/each}
		<text x="126" y="214" class="print small"
			>scan {scans.toLocaleString('en')} · 10 ms · DI 24 V DC · DQ relay</text
		>

		<!-- terminal blocks at the bottom: inputs left, outputs right -->
		{#each EIGHT as i (i)}
			<circle cx={132 + i * 20} cy="243" r="5" fill="#5b6266" />
			<line
				x1={129 + i * 20}
				y1="243"
				x2={135 + i * 20}
				y2="243"
				stroke="#2b3033"
				stroke-width="1.5"
			/>
		{/each}
		{#each FOUR as i (i)}
			<circle cx={300 + i * 20} cy="243" r="5" fill="#5b6266" />
			<line
				x1={297 + i * 20}
				y1="243"
				x2={303 + i * 20}
				y2="243"
				stroke="#2b3033"
				stroke-width="1.5"
			/>
		{/each}

		<!-- motor M1 -->
		<g transform="translate(400 330)">
			<circle r="30" fill="#1f2a37" stroke={motor ? '#3ddc84' : '#475569'} stroke-width="3" />
			<g class:spin={motor}>
				<path d="M0 -20 L6 0 L0 20 L-6 0 Z" fill="#cbd5e1" />
				<path d="M-20 0 L0 6 L20 0 L0 -6 Z" fill="#94a3b8" />
			</g>
			<text y="50" text-anchor="middle" class="label">Motor · Q0.0</text>
		</g>
		<!-- lamp H1 -->
		<g transform="translate(470 318)">
			<circle r="16" fill={lamp ? '#fde047' : '#334155'} class:lamp-on={lamp} />
			<path d="M-8 -8 L8 8 M8 -8 L-8 8" stroke={lamp ? '#854d0e' : '#64748b'} stroke-width="2" />
			<text y="62" text-anchor="middle" class="label">Running</text>
			<text y="76" text-anchor="middle" class="label">Q0.1</text>
		</g>
	</svg>

	<!-- the push buttons are real buttons -->
	<div class="buttons">
		<button
			style="left: 13.5%"
			class="push green"
			class:pressed={start}
			aria-label={t('hero.start')}
			{...startBtn}
		>
			<span>I</span>
		</button>
		<button
			style="left: 36.5%"
			class="push red"
			class:pressed={stop}
			aria-label={t('hero.stop')}
			{...stopBtn}
		>
			<span>O</span>
		</button>
	</div>
	<figcaption>
		<code>Motor := (Start OR Motor) AND NOT Stop;</code>
		{t('hero.caption')}
	</figcaption>
</figure>

<style>
	.hero-plc {
		position: relative;
		margin: 0;
	}
	.print {
		font-family: 'Barlow Condensed', ui-sans-serif, sans-serif;
		font-weight: 600;
		font-size: 15px;
		fill: #2b3033;
	}
	.print.small {
		font-size: 11px;
		font-weight: 500;
	}
	.print.tiny {
		font-size: 9px;
		font-weight: 500;
	}
	.label {
		font-family: 'Barlow Condensed', ui-sans-serif, sans-serif;
		font-size: 12px;
		fill: #94a3b8;
	}
	.glow {
		filter: drop-shadow(0 0 3px #3ddc84);
	}
	.lamp-on {
		filter: drop-shadow(0 0 10px #fde047);
	}
	.spin {
		animation: spin 0.5s linear infinite;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
	/* the push buttons sit over the SVG, where the drawing leaves room for them */
	.buttons {
		position: absolute;
		inset: 0;
		pointer-events: none;
	}
	.push {
		pointer-events: auto;
		position: absolute;
		top: 78%;
		translate: -50% -50%;
		aspect-ratio: 1;
		width: 15%;
		border-radius: 9999px;
		border: 5px solid #475569;
		background: #1f2a37;
		display: grid;
		place-items: center;
		touch-action: none;
		cursor: pointer;
		transition: scale 60ms;
	}
	.push span {
		display: grid;
		place-items: center;
		width: 72%;
		aspect-ratio: 1;
		border-radius: 9999px;
		font-family: 'Barlow Condensed', ui-sans-serif, sans-serif;
		font-weight: 700;
		font-size: 1.4rem;
		color: #f8fafc;
		box-shadow: inset 0 -5px 0 rgb(0 0 0 / 0.25);
	}
	.push.green span {
		background: #16a34a;
	}
	.push.red span {
		background: #dc2626;
	}
	.push.pressed {
		scale: 0.94;
	}
	.push.pressed span {
		box-shadow: inset 0 3px 0 rgb(0 0 0 / 0.3);
	}
	.push:focus-visible {
		outline: 3px solid #93c5fd;
		outline-offset: 3px;
	}
	figcaption {
		margin-top: 0.75rem;
		font-size: 0.875rem;
		color: #94a3b8;
	}
	figcaption code {
		color: #e2e8f0;
	}
	@media (prefers-reduced-motion: reduce) {
		.spin {
			animation: none;
		}
	}
</style>
