import {
	contact,
	newId,
	series,
	type Coil,
	type Element,
	type LadderProgram,
	type Rung,
	type Series
} from './model.js';

/*
 * Editing operations on the ladder tree. They mutate in place (which works directly on Svelte
 * $state proxies) and keep the tree normalised: no empty branches, no single-branch parallels.
 */

export interface ElementLocation {
	parent: Series;
	index: number;
	element: Element;
}

export function findElement(root: Series, id: string): ElementLocation | null {
	for (let index = 0; index < root.items.length; index++) {
		const element = root.items[index];
		if (element.id === id) return { parent: root, index, element };
		if (element.kind === 'parallel') {
			for (const branch of element.branches) {
				const found = findElement(branch, id);
				if (found) return found;
			}
		}
	}
	return null;
}

export function findSeries(root: Series, id: string): Series | null {
	if (root.id === id) return root;
	for (const element of root.items) {
		if (element.kind !== 'parallel') continue;
		for (const branch of element.branches) {
			const found = findSeries(branch, id);
			if (found) return found;
		}
	}
	return null;
}

export function findCoil(rung: Rung, id: string): Coil | null {
	return rung.coils.find((c) => c.id === id) ?? null;
}

/** The rung containing a node with this id (the rung itself, an element, a branch or a coil). */
export function findRung(program: LadderProgram, id: string): Rung | null {
	return (
		program.rungs.find(
			(r) =>
				r.id === id ||
				findCoil(r, id) !== null ||
				findSeries(r.logic, id) !== null ||
				findElement(r.logic, id) !== null
		) ?? null
	);
}

/** Any node by id: rung, series, element or coil. */
export function findNode(
	program: LadderProgram,
	id: string
): Rung | Series | Element | Coil | null {
	for (const r of program.rungs) {
		if (r.id === id) return r;
		const node = findCoil(r, id) ?? findSeries(r.logic, id) ?? findElement(r.logic, id)?.element;
		if (node) return node;
	}
	return null;
}

/**
 * Inserts an element in series after `targetId`. If the target is a branch (series), the element
 * is appended to it; if it is missing, the element goes to the end of the rung.
 */
export function insertAfter(rung: Rung, targetId: string | null, element: Element): void {
	if (targetId) {
		const found = findElement(rung.logic, targetId);
		if (found) {
			found.parent.items.splice(found.index + 1, 0, element);
			return;
		}
		const branch = findSeries(rung.logic, targetId);
		if (branch) {
			branch.items.push(element);
			return;
		}
	}
	rung.logic.items.push(element);
}

/** Puts `element` on a new branch parallel to the target element. */
export function addBranch(rung: Rung, targetId: string, element: Element = contact()): boolean {
	const found = findElement(rung.logic, targetId);
	if (!found) return false;
	if (found.element.kind === 'parallel') {
		found.element.branches.push(series([element]));
	} else {
		found.parent.items[found.index] = {
			id: newId('p'),
			kind: 'parallel',
			branches: [series([found.element]), series([element])]
		};
	}
	return true;
}

/** Removes an element, branch or coil. Returns false if nothing was found. */
export function removeNode(rung: Rung, id: string): boolean {
	const coilIndex = rung.coils.findIndex((c) => c.id === id);
	if (coilIndex >= 0) {
		rung.coils.splice(coilIndex, 1);
		return true;
	}
	const found = findElement(rung.logic, id);
	if (found) {
		found.parent.items.splice(found.index, 1);
		normalize(rung.logic);
		return true;
	}
	if (removeBranch(rung.logic, id)) {
		normalize(rung.logic);
		return true;
	}
	return false;
}

function removeBranch(root: Series, id: string): boolean {
	for (const element of root.items) {
		if (element.kind !== 'parallel') continue;
		const index = element.branches.findIndex((b) => b.id === id);
		if (index >= 0) {
			element.branches.splice(index, 1);
			return true;
		}
		if (element.branches.some((b) => removeBranch(b, id))) return true;
	}
	return false;
}

/** Drops empty branches and unwraps parallels with a single branch. */
export function normalize(root: Series): void {
	for (let i = 0; i < root.items.length; i++) {
		const element = root.items[i];
		if (element.kind !== 'parallel') continue;
		element.branches.forEach(normalize);
		element.branches = element.branches.filter((b) => b.items.length > 0);
		if (element.branches.length === 0) {
			root.items.splice(i, 1);
			i--;
		} else if (element.branches.length === 1) {
			const items = element.branches[0].items;
			root.items.splice(i, 1, ...items);
			i += items.length - 1;
		}
	}
}

/** Moves a rung up (-1) or down (+1). */
export function moveRung(program: LadderProgram, id: string, delta: -1 | 1): void {
	const from = program.rungs.findIndex((r) => r.id === id);
	const to = from + delta;
	if (from < 0 || to < 0 || to >= program.rungs.length) return;
	const [r] = program.rungs.splice(from, 1);
	program.rungs.splice(to, 0, r);
}
