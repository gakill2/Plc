<script lang="ts">
	import { autocompletion } from '@codemirror/autocomplete';
	import { lintGutter, setDiagnostics } from '@codemirror/lint';
	import { Compartment, EditorState, Prec } from '@codemirror/state';
	import { oneDark } from '@codemirror/theme-one-dark';
	import { EditorView } from '@codemirror/view';
	import { basicSetup } from 'codemirror';
	import { onMount } from 'svelte';
	import type { StDiagnostic } from './compiler.js';
	import { stCompletions, stLanguage, type CompletionNames } from './language.js';
	import { stlLanguage } from '#lib/stl/language.js';

	type Props = {
		value: string;
		onChange: (value: string) => void;
		diagnostics: StDiagnostic[];
		readOnly: boolean;
		names: () => CompletionNames;
		/** Statement List instead of Structured Text: other highlighting, no ST completions */
		mode?: 'st' | 'stl';
	};
	let { value, onChange, diagnostics, readOnly, names, mode = 'st' }: Props = $props();

	let host: HTMLDivElement;
	let view = $state.raw<EditorView | null>(null);
	const readOnlyConf = new Compartment();

	onMount(() => {
		const v = new EditorView({
			parent: host,
			state: EditorState.create({
				doc: value,
				extensions: [
					basicSetup,
					mode === 'stl' ? stlLanguage : stLanguage,
					oneDark,
					lintGutter(),
					autocompletion({
						override: mode === 'stl' ? [] : [stCompletions(() => names())]
					}),
					readOnlyConf.of(EditorState.readOnly.of(readOnly)),
					EditorView.updateListener.of((u) => {
						if (u.docChanged) onChange(u.state.doc.toString());
					}),
					Prec.highest(
						EditorView.theme(
							{
								'&': { height: '100%', fontSize: '13px', backgroundColor: '#020617' },
								'.cm-scroller': { fontFamily: "'JetBrains Mono', ui-monospace, monospace" },
								'.cm-gutters': { backgroundColor: '#020617', borderRight: '1px solid #1e293b' },
								'.cm-activeLine, .cm-activeLineGutter': { backgroundColor: '#0f172a' }
							},
							{ dark: true }
						)
					)
				]
			})
		});
		view = v;
		return () => v.destroy();
	});

	// the document was replaced from outside (e.g. "load example")
	$effect(() => {
		const v = view;
		const text = value;
		if (v && text !== v.state.doc.toString()) {
			v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: text } });
		}
	});

	$effect(() => {
		const v = view;
		if (!v) return;
		const length = v.state.doc.length;
		v.dispatch(
			setDiagnostics(
				v.state,
				diagnostics.map((d) => {
					const from = Math.min(d.from, length);
					return {
						from,
						to: Math.min(Math.max(d.to, from), length),
						severity: 'error',
						message: d.message
					};
				})
			)
		);
	});

	$effect(() => {
		view?.dispatch({ effects: readOnlyConf.reconfigure(EditorState.readOnly.of(readOnly)) });
	});
</script>

<div bind:this={host} class="h-full overflow-hidden"></div>
