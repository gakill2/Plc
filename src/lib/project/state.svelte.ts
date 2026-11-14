import { DEFAULT_MEMORY_CONFIG } from '#lib/engine/index.js';
import {
	checkCircuit,
	deviceSymbols,
	normalizeTerminal,
	type Circuit
} from '#lib/circuit/model.js';
import { analyze, crossReference, type Warning, type XrefEntry } from '#lib/analysis/analysis.js';
import { LadderDocument } from '#lib/ladder/document.svelte.js';
import { checkSymbols, type SymbolEntry } from '#lib/symbols/symbols.js';
import type { WatchEntry } from '#lib/monitor/watch.js';
import type { ProcessKind } from '#lib/processes/types.js';
import type { CompiledLadder } from '#lib/ladder/compiler.js';
import { compileSt, type StCompileResult } from '#lib/st/compiler.js';
import type { Project, ProgramLanguage } from './project.js';

export type ProblemSource = 'program' | 'circuit' | 'symbols';

export interface Problem {
	id: string;
	message: string;
	source: ProblemSource;
}

/** Reactive state of a whole project: ladder program, circuit and symbol table. */
export class ProjectState {
	circuit: Circuit = $state({ plc: { x: 0, y: 0 }, devices: [], wires: [] });
	userSymbols: SymbolEntry[] = $state([]);
	watch: WatchEntry[] = $state([]);
	readonly scenario: ProcessKind | undefined;
	readonly lesson: string | undefined;
	readonly ladder: LadderDocument;

	/** Device symbols first — they are what the user sees on the circuit. */
	readonly deviceSymbols: SymbolEntry[] = $derived(deviceSymbols(this.circuit));
	readonly symbols = $derived(checkSymbols([...this.deviceSymbols, ...this.userSymbols]));
	name: string = $state('');
	language: ProgramLanguage = $state('ladder');
	st: string = $state('');

	/** Structured Text compile result, while ST is the active language. */
	readonly stResult: StCompileResult | null = $derived(
		this.language === 'st' ? compileSt(this.st, { symbols: this.symbols.map }) : null
	);
	/** The active program in a common shape — this is what gets downloaded and graded. */
	readonly compiled: CompiledLadder;

	readonly problems: Problem[];
	/** Where every address is read and written. */
	readonly xref: XrefEntry[];
	/** Non-blocking hints: double coils, unused wiring, typos… */
	readonly warnings: Warning[];

	constructor(project: Project) {
		this.circuit = project.circuit;
		this.userSymbols = project.symbols;
		this.watch = project.watch;
		this.scenario = project.scenario;
		this.lesson = project.lesson;
		this.ladder = new LadderDocument(project.ladder, () => this.symbols);
		this.name = project.name ?? '';
		this.language = project.language ?? 'ladder';
		this.st = project.st ?? '';
		this.compiled = $derived(this.stResult ? fromSt(this.stResult, this.st) : this.ladder.compiled);
		this.problems = $derived([
			...this.compiled.diagnostics.map((d) => ({ ...d, source: 'program' as const })),
			...this.symbols.issues.map((d) => ({ ...d, source: 'symbols' as const })),
			...checkCircuit(this.circuit, DEFAULT_MEMORY_CONFIG).map((d) => ({
				...d,
				source: 'circuit' as const
			}))
		]);
		this.xref = $derived(crossReference(this.compiled.program, this.compiled.sourceMap));
		this.warnings = $derived(
			this.compiled.diagnostics.length
				? []
				: analyze({
						xref: this.xref,
						language: this.language,
						names: this.symbols.reverse,
						wired: this.wiredTerminals
					})
		);
	}

	/** Terminals that have a device connected in the circuit. */
	get wiredTerminals(): string[] {
		const devices = this.circuit.devices.map((d) => d.id);
		const out: string[] = [];
		for (const w of this.circuit.wires) {
			const t = devices.includes(w.device) ? normalizeTerminal(w.terminal) : null;
			if (t && !out.includes(t)) out.push(t);
		}
		return out;
	}

	/** Puts the editable parts of a snapshot back (undo / redo). Scenario and lesson never change. */
	restore(p: Project) {
		this.name = p.name ?? '';
		this.ladder.program = p.ladder;
		this.circuit = p.circuit;
		this.userSymbols = p.symbols;
		this.watch = p.watch;
		this.language = p.language ?? 'ladder';
		this.st = p.st ?? '';
	}

	toJSON(): Project {
		return {
			version: 2,
			name: this.name || undefined,
			ladder: $state.snapshot(this.ladder.program),
			circuit: $state.snapshot(this.circuit),
			symbols: $state.snapshot(this.userSymbols),
			watch: $state.snapshot(this.watch),
			scenario: this.scenario,
			lesson: this.lesson,
			language: this.language,
			st: this.st
		};
	}
}

/** Adapts an ST compile result to the shape the rest of the app uses for compiled programs. */
function fromSt(result: StCompileResult, src: string): CompiledLadder {
	const lineOf = (offset: number) => src.slice(0, offset).split('\n').length;
	return {
		program: result.program,
		taps: new Map(),
		sourceMap: result.lines.map((l) => (l === null ? null : `L${l}`)),
		diagnostics: result.diagnostics.map((d) => ({
			id: `st:${d.from}`,
			message: `Line ${lineOf(d.from)}: ${d.message}`
		}))
	};
}
