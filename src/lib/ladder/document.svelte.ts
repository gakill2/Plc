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
import { addBranch, findNode, findRung, insertAfter, moveRung, removeNode } from './ops.js';

/** Reactive editing state of one ladder program. */
export class LadderDocument {
	program: LadderProgram = $state({ version: 1, rungs: [] });
	selectedId: string | null = $state(null);

	readonly compiled: CompiledLadder = $derived(compileLadder(this.program));
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

	constructor(program: LadderProgram) {
		this.program = program;
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

	/** Inserts in series after the selection (or at the end of the selected / last rung). */
	insert(element: Element) {
		const target = this.#targetRung();
		const after = this.selectedId && this.selectedId !== target.id ? this.selectedId : null;
		insertAfter(target, after, element);
		this.selectedId = element.id;
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
