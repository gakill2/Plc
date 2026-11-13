import { DEFAULT_MEMORY_CONFIG } from '#lib/engine/index.js';
import { checkCircuit, deviceSymbols, type Circuit } from '#lib/circuit/model.js';
import { LadderDocument } from '#lib/ladder/document.svelte.js';
import { checkSymbols, type SymbolEntry } from '#lib/symbols/symbols.js';
import type { WatchEntry } from '#lib/monitor/watch.js';
import type { Project } from './project.js';

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
	readonly ladder: LadderDocument;

	/** Device symbols first — they are what the user sees on the circuit. */
	readonly deviceSymbols: SymbolEntry[] = $derived(deviceSymbols(this.circuit));
	readonly symbols = $derived(checkSymbols([...this.deviceSymbols, ...this.userSymbols]));

	readonly problems: Problem[];

	constructor(project: Project) {
		this.circuit = project.circuit;
		this.userSymbols = project.symbols;
		this.watch = project.watch;
		this.ladder = new LadderDocument(project.ladder, () => this.symbols);
		this.problems = $derived([
			...this.ladder.compiled.diagnostics.map((d) => ({ ...d, source: 'program' as const })),
			...this.symbols.issues.map((d) => ({ ...d, source: 'symbols' as const })),
			...checkCircuit(this.circuit, DEFAULT_MEMORY_CONFIG).map((d) => ({
				...d,
				source: 'circuit' as const
			}))
		]);
	}

	toJSON(): Project {
		return {
			version: 2,
			ladder: $state.snapshot(this.ladder.program),
			circuit: $state.snapshot(this.circuit),
			symbols: $state.snapshot(this.userSymbols),
			watch: $state.snapshot(this.watch)
		};
	}
}
