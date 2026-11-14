import { blockCatalog, type BlockInfo } from '#lib/st/stdlib.js';
import { aliasOf, type SymbolMap } from '#lib/symbols/symbols.js';
import { compileLadder, type CompiledLadder, type Diagnostic } from './compiler.js';
import {
	coil,
	contact,
	rung,
	type Coil,
	type Element,
	type LadderProgram,
	type Node,
	type Rung
} from './model.js';
import {
	addBranch,
	cloneWithNewIds,
	findNode,
	findRung,
	insertAfter,
	insertBefore,
	moveRung,
	removeNode
} from './ops.js';

type SymbolsGetter = () => { map: SymbolMap; reverse: SymbolMap };
const NO_SYMBOLS: { map: SymbolMap; reverse: SymbolMap } = Object.freeze({
	map: new Map<string, string>() as SymbolMap,
	reverse: new Map<string, string>() as SymbolMap
});

/** Reactive editing state of one ladder program. */
export class LadderDocument {
	program: LadderProgram = $state({ version: 1, rungs: [] });
	selectedId: string | null = $state(null);
	/** Where palette elements and pasted elements go relative to the selection. */
	insertMode: 'after' | 'before' = $state('after');
	/** Internal clipboard: a plain copy of a rung, element or coil. */
	clipboard: Node | null = $state.raw(null);

	#symbols: SymbolsGetter = () => NO_SYMBOLS;
	#library: () => string = () => '';

	readonly compiled: CompiledLadder = $derived(
		compileLadder(this.program, { symbols: this.#symbols().map, library: this.#library() })
	);
	readonly diagnostics: Map<string, Diagnostic[]> = $derived.by(() => {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- local, rebuilt on every change
		const map = new Map<string, Diagnostic[]>();
		for (const d of this.compiled.diagnostics) map.set(d.id, [...(map.get(d.id) ?? []), d]);
		return map;
	});
	readonly selectedRung: Rung | null = $derived(
		this.selectedId ? findRung(this.program, this.selectedId) : null
	);
	readonly selected: Node | null = $derived(
		this.selectedId ? findNode(this.program, this.selectedId) : null
	);

	/** Function blocks a box can call: the standard library and the project's own. */
	readonly catalog: BlockInfo[] = $derived(blockCatalog(this.#library()));

	constructor(program: LadderProgram, symbols?: SymbolsGetter, library?: () => string) {
		this.program = program;
		if (symbols) this.#symbols = symbols;
		if (library) this.#library = library;
	}

	/** A free instance name for a new box, e.g. PID_2. */
	freeInstance(type: string): string {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- local, rebuilt on every call
		const used = new Set<string>();
		const walk = (items: Element[]) => {
			for (const e of items) {
				if (e.kind === 'block') used.add(e.instance.toUpperCase());
				if (e.kind === 'parallel') for (const b of e.branches) walk(b.items);
			}
		};
		for (const r of this.program.rungs) walk(r.logic.items);
		let n = 1;
		while (used.has(`${type}_${n}`.toUpperCase())) n++;
		return `${type}_${n}`;
	}

	/** [address, name] pairs of all symbols — for operand autocomplete. */
	get symbolList(): [string, string][] {
		return [...this.#symbols().reverse];
	}

	/** Address of a symbol name, or symbol name of an address — shown under operands. */
	alias(operand: string): string | null {
		const { map, reverse } = this.#symbols();
		return aliasOf(map, reverse, operand);
	}

	select(id: string | null) {
		this.selectedId = id;
	}

	addRung() {
		const r = rung([contact()], [coil()]);
		const index = this.selectedRung
			? this.program.rungs.indexOf(this.selectedRung) + 1
			: this.program.rungs.length;
		this.program.rungs.splice(index, 0, r);
		this.selectedId = r.id;
	}

	/**
	 * Inserts in series after (or before, see `insertMode`) the selection. With a whole rung
	 * selected, the element goes to the end (or the start) of that rung.
	 */
	insert(element: Element, mode = this.insertMode) {
		const target = this.#targetRung();
		const anchor = this.selectedId && this.selectedId !== target.id ? this.selectedId : null;
		if (mode === 'before') insertBefore(target, anchor, element);
		else insertAfter(target, anchor, element);
		this.selectedId = element.id;
	}

	/** Changes the variant of the selected contact, coil, timer or counter (e.g. NO → NC). */
	setType(type: string) {
		const node = this.selected;
		if (
			node &&
			(node.kind === 'contact' ||
				node.kind === 'coil' ||
				node.kind === 'timer' ||
				node.kind === 'counter')
		) {
			Object.assign(node, { type });
		}
	}

	get canCopy(): boolean {
		const k = this.selected?.kind;
		return !!k && k !== 'series';
	}

	copy(): boolean {
		if (!this.canCopy) return false;
		this.clipboard = $state.snapshot(this.selected) as Node;
		return true;
	}

	paste(): boolean {
		const clip = this.clipboard;
		if (!clip || clip.kind === 'series') return false;
		const copy = cloneWithNewIds(clip);
		if (copy.kind === 'rung') {
			const index = this.selectedRung
				? this.program.rungs.indexOf(this.selectedRung) + 1
				: this.program.rungs.length;
			this.program.rungs.splice(index, 0, copy);
			this.selectedId = copy.id;
		} else if (copy.kind === 'coil') {
			this.addCoil(copy);
		} else {
			this.insert(copy);
		}
		return true;
	}

	/** Copy + paste right after the original. */
	duplicate(): boolean {
		if (!this.copy()) return false;
		const mode = this.insertMode;
		this.insertMode = 'after';
		const ok = this.paste();
		this.insertMode = mode;
		return ok;
	}

	addCoil(c: Coil) {
		this.#targetRung().coils.push(c);
		this.selectedId = c.id;
	}

	/** Adds a parallel branch (with a new NO contact) around the selected element. */
	branch(): boolean {
		const r = this.selectedRung;
		if (!r || !this.selectedId) return false;
		const element = contact('NO', 'I0.0');
		if (!addBranch(r, this.selectedId, element)) return false;
		this.selectedId = element.id;
		return true;
	}

	removeSelected() {
		const id = this.selectedId;
		const r = this.selectedRung;
		if (!id || !r) return;
		if (r.id === id) {
			this.program.rungs.splice(this.program.rungs.indexOf(r), 1);
			this.selectedId = null;
		} else if (removeNode(r, id)) {
			this.selectedId = r.id;
		}
	}

	moveSelectedRung(delta: -1 | 1) {
		if (this.selectedRung) moveRung(this.program, this.selectedRung.id, delta);
	}

	/** Changes fields of a node (operands, types, comment). */
	update<T extends Node>(node: T, patch: Partial<T>) {
		Object.assign(node, patch);
	}

	diagnosticsFor(id: string): Diagnostic[] {
		return this.diagnostics.get(id) ?? [];
	}

	#targetRung(): Rung {
		if (this.selectedRung) return this.selectedRung;
		if (this.program.rungs.length === 0) this.program.rungs.push(rung([], []));
		return this.program.rungs[this.program.rungs.length - 1];
	}
}
