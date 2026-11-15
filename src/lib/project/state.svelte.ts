import { STDLIB } from '#lib/st/stdlib.js';
import { checkSfc, emptySfc, sfcToSt, type GeneratedSt, type Sfc } from '#lib/sfc/sfc.js';
import {
	boxTypes,
	checkFbd,
	emptyFbd,
	fbdToSt,
	type BoxType,
	type Fbd,
	type GeneratedFbd
} from '#lib/fbd/fbd.js';
import { blockCatalog } from '#lib/st/stdlib.js';
import { emptyHmi, WRITES, type Hmi } from '#lib/hmi/model.js';
import { formatAddress, parseAddress } from '#lib/engine/index.js';
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
import { fixWatchFormats, type WatchEntry } from '#lib/monitor/watch.js';
import type { ProcessKind } from '#lib/processes/types.js';
import { plantInfo } from '#lib/processes/plants.js';
import { newId } from '#lib/ladder/model.js';
import type { CompiledLadder } from '#lib/ladder/compiler.js';
import { compileSt, type StCompileResult } from '#lib/st/compiler.js';
import { stlToSt, type GeneratedStl } from '#lib/stl/stl.js';
import { checkHardware, type Hardware } from '#lib/hw/hw.js';
import type { SafetyConfig } from '#lib/safety/safety.js';
import type { Project, ProgramLanguage } from './project.js';

export type ProblemSource = 'program' | 'circuit' | 'symbols' | 'hardware' | 'safety';

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
	/** Simulated plant connected to the PLC (fixed in lessons, free choice in own projects). */
	scenario: ProcessKind | undefined = $state(undefined);
	readonly lesson: string | undefined;
	readonly ladder: LadderDocument;

	/** Device symbols first — they are what the user sees on the circuit. */
	readonly deviceSymbols: SymbolEntry[] = $derived(deviceSymbols(this.circuit));
	readonly symbols = $derived(checkSymbols([...this.deviceSymbols, ...this.userSymbols]));
	name: string = $state('');
	language: ProgramLanguage = $state('ladder');
	/** Operator panel and alarm definitions. */
	hmi: Hmi = $state(emptyHmi());
	st: string = $state('');
	sfc: Sfc = $state(emptySfc());
	/** The project's own function blocks, in ST. */
	library: string = $state('');
	readonly prelude: string = $derived(this.library.trim() ? `${STDLIB}\n${this.library}` : STDLIB);
	fbd: Fbd = $state(emptyFbd());
	/** FBD boxes: the built-in ones and every function block of the library. */
	readonly boxTypes: BoxType[] = $derived(boxTypes(blockCatalog(this.library)));
	/** The diagram translated to ST, while FBD is the active language. */
	readonly fbdSt: GeneratedFbd | null = $derived(
		this.language === 'fbd' ? fbdToSt(this.fbd, this.boxTypes) : null
	);
	/** The rack (hardware-configuration lessons); null: terminals are addresses. */
	hw: Hardware | null = $state(null);
	/** F-CPU: safety program and fail-safe I/O (safety lessons); null: a standard CPU. */
	safety: SafetyConfig | null = $state(null);
	/** Statement List source. */
	stl: string = $state('');
	/** The STL program translated to ST, while STL is the active language. */
	readonly stlSt: GeneratedStl | null = $derived(
		this.language === 'stl' ? stlToSt(this.stl) : null
	);
	/** The chart translated to ST, while SFC is the active language. */
	readonly sfcSt: GeneratedSt | null = $derived(this.language === 'sfc' ? sfcToSt(this.sfc) : null);

	/** Structured Text compile result, while ST is the active language. */
	readonly stResult: StCompileResult | null = $derived.by(() => {
		const options = {
			symbols: this.symbols.map,
			prelude: this.prelude,
			...(this.safety ? { safety: $state.snapshot(this.safety) as SafetyConfig } : {})
		};
		const src =
			this.language === 'st'
				? this.st
				: (this.sfcSt?.source ?? this.fbdSt?.source ?? this.stlSt?.source ?? null);
		return src === null ? null : compileSt(src, options);
	});
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
		this.watch = fixWatchFormats(project.watch, project.symbols);
		this.scenario = project.scenario;
		this.lesson = project.lesson;
		this.library = project.library ?? '';
		this.ladder = new LadderDocument(
			project.ladder,
			() => this.symbols,
			() => this.library
		);
		this.name = project.name ?? '';
		this.language = project.language ?? 'ladder';
		this.st = project.st ?? '';
		this.sfc = project.sfc ?? emptySfc();
		this.fbd = project.fbd ?? emptyFbd();
		this.stl = project.stl ?? '';
		this.hw = project.hw ?? null;
		this.safety = project.safety ?? null;
		this.hmi = project.hmi ?? emptyHmi();
		this.compiled = $derived(
			this.sfcSt && this.stResult
				? fromSfc(this.sfc, this.stResult, this.sfcSt)
				: this.fbdSt && this.stResult
					? fromFbd(this.fbd, this.boxTypes, this.stResult, this.fbdSt)
					: this.stlSt && this.stResult
						? fromStl(this.stResult, this.stlSt)
						: this.stResult
							? fromSt(this.stResult, this.st)
							: this.ladder.compiled
		);
		this.problems = $derived([
			...(this.safety && this.language === 'ladder'
				? [
						{
							id: 'safety:ladder',
							message:
								'The safety program needs a standard program in ST, SFC, FBD or STL — switch the language',
							source: 'safety' as const
						}
					]
				: []),
			...this.compiled.diagnostics.map((d) => ({
				...d,
				source: /^(Safety program|F-I\/O)/.test(d.message)
					? ('safety' as const)
					: ('program' as const)
			})),
			...this.symbols.issues.map((d) => ({ ...d, source: 'symbols' as const })),
			...(this.hw ? checkHardware(this.hw) : []).map((d) => ({
				...d,
				source: 'hardware' as const
			})),
			...checkCircuit(this.circuit, DEFAULT_MEMORY_CONFIG).map((d) => ({
				...d,
				source: 'circuit' as const
			}))
		]);
		this.xref = $derived(crossReference(this.compiled.program, this.compiled.sourceMap));
		this.warnings = $derived([
			...this.plantConflicts(),
			...(this.compiled.diagnostics.length
				? []
				: analyze({
						xref: this.xref,
						language: this.language,
						names: this.symbols.reverse,
						wired: this.wiredTerminals,
						external: this.hmiWrites
					}))
		]);
	}

	/** Plant sensors also driven by a circuit device: the plant wins, the device is ignored. */
	plantConflicts(): Warning[] {
		const sensors = plantInfo(this.scenario)?.io.filter((io) => io.address.startsWith('I')) ?? [];
		return sensors.flatMap((io) => {
			const users = this.deviceSymbols.filter((s) => s.address.toUpperCase() === io.address);
			return users.map((u) => ({
				id: null,
				message: `${io.address} is a plant sensor (${io.name}) but ${u.name} is wired to it too — move ${u.name} to a free input`
			}));
		});
	}

	/** Addresses the operator panel writes (buttons, switches, inputs, the ACK bit). */
	get hmiWrites(): string[] {
		const tags = [
			...this.hmi.widgets.filter((w) => WRITES.has(w.kind)).map((w) => w.tag),
			this.hmi.ackTag
		];
		return tags.flatMap((t) => {
			const text = t.trim();
			if (!text) return [];
			try {
				return [formatAddress(parseAddress(this.symbols.map.get(text.toUpperCase()) ?? text))];
			} catch {
				return [];
			}
		});
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

	/**
	 * Connects a plant (or none). Its I/O gets symbols, unless the address or the name is taken
	 * already — so a fresh project can use `Pump`, `High` … straight away.
	 */
	setScenario(kind: ProcessKind | undefined) {
		if (this.lesson) return;
		this.scenario = kind;
		for (const io of plantInfo(kind)?.io ?? []) {
			const all = [...this.deviceSymbols, ...this.userSymbols];
			const taken = all.some(
				(s) =>
					s.address.trim().toUpperCase() === io.address ||
					s.name.trim().toUpperCase() === io.name.toUpperCase()
			);
			if (!taken) this.userSymbols.push({ id: newId('y'), ...io });
		}
	}

	/** Puts the editable parts of a snapshot back (undo / redo). The lesson never changes. */
	restore(p: Project) {
		if (!this.lesson) this.scenario = p.scenario;
		this.name = p.name ?? '';
		this.ladder.program = p.ladder;
		this.circuit = p.circuit;
		this.userSymbols = p.symbols;
		this.watch = p.watch;
		this.language = p.language ?? 'ladder';
		this.st = p.st ?? '';
		this.hmi = p.hmi ?? emptyHmi();
		this.sfc = p.sfc ?? emptySfc();
		this.fbd = p.fbd ?? emptyFbd();
		this.stl = p.stl ?? '';
		this.hw = p.hw ?? null;
		this.safety = p.safety ?? null;
		this.library = p.library ?? '';
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
			st: this.st,
			library: this.library || undefined,
			sfc:
				this.language === 'sfc' || this.sfc.steps.length > 1
					? $state.snapshot(this.sfc)
					: undefined,
			fbd:
				this.language === 'fbd' || this.fbd.networks.length > 1
					? $state.snapshot(this.fbd)
					: undefined,
			stl: this.language === 'stl' || this.stl.trim() ? this.stl : undefined,
			hw: this.hw ? $state.snapshot(this.hw) : undefined,
			safety: this.safety ? $state.snapshot(this.safety) : undefined,
			hmi: $state.snapshot(this.hmi)
		};
	}
}

/** SFC: chart issues first, then errors of the generated ST — named after the chart element. */
function fromSfc(sfc: Sfc, result: StCompileResult, gen: GeneratedSt): CompiledLadder {
	const lineOf = (offset: number) => gen.source.slice(0, offset).split('\n').length;
	const issues = checkSfc(sfc);
	return {
		program: result.program,
		...(result.load ? { load: result.load } : {}),
		taps: new Map(),
		sourceMap: result.lines.map((l) => (l === null ? null : `L${l}`)),
		diagnostics: [
			...issues.map((i) => ({ id: `sfc:${i.id}`, message: i.message })),
			...(issues.length
				? []
				: result.diagnostics.map((d) => ({
						id: `sfc:st:${d.from}`,
						message: d.library ? d.message : `${gen.origin[lineOf(d.from)] ?? 'SFC'}: ${d.message}`
					})))
		]
	};
}

/** FBD: diagram issues first, then errors of the generated ST — named after the network. */
function fromFbd(
	fbd: Fbd,
	types: BoxType[],
	result: StCompileResult,
	gen: GeneratedFbd
): CompiledLadder {
	const lineOf = (offset: number) => gen.source.slice(0, offset).split('\n').length;
	const issues = checkFbd(fbd, types);
	const label = (line: number) => {
		const i = fbd.networks.findIndex((n) => n.id === gen.origin[line]);
		return i >= 0 ? `Network ${i + 1}` : 'FBD';
	};
	return {
		program: result.program,
		taps: new Map(),
		sourceMap: result.lines.map((l) => (l === null ? null : `L${l}`)),
		diagnostics: [
			...issues.map((i) => ({ id: `fbd:${i.id}`, message: i.message })),
			...(issues.length
				? []
				: result.diagnostics.map((d) => ({
						id: `fbd:${gen.origin[lineOf(d.from)] ?? 'st'}`,
						message: d.library ? d.message : `${label(lineOf(d.from))}: ${d.message}`
					})))
		]
	};
}

/** STL compiled through ST: problems and live lines point back at the STL source. */
function fromStl(result: StCompileResult, gen: GeneratedStl): CompiledLadder {
	const lineOf = (offset: number) => gen.source.slice(0, offset).split('\n').length;
	return {
		program: gen.issues.length ? [] : result.program,
		taps: new Map(),
		sourceMap: result.lines.map((l) => (l === null || !gen.origin[l] ? null : `L${gen.origin[l]}`)),
		diagnostics: gen.issues.length
			? gen.issues.map((i) => ({ id: `stl:${i.line}`, message: `Line ${i.line}: ${i.message}` }))
			: result.diagnostics.map((d) => {
					const line = gen.origin[lineOf(d.from)];
					return {
						id: `stl:${line ?? 'st'}`,
						message: d.library ? d.message : line ? `Line ${line}: ${d.message}` : d.message
					};
				})
	};
}

/** Adapts an ST compile result to the shape the rest of the app uses for compiled programs. */
function fromSt(result: StCompileResult, src: string): CompiledLadder {
	const lineOf = (offset: number) => src.slice(0, offset).split('\n').length;
	return {
		program: result.program,
		...(result.load ? { load: result.load } : {}),
		taps: new Map(),
		sourceMap: result.lines.map((l) => (l === null ? null : `L${l}`)),
		diagnostics: result.diagnostics.map((d) => ({
			id: `st:${d.from}`,
			message: d.library ? d.message : `Line ${lineOf(d.from)}: ${d.message}`
		}))
	};
}
