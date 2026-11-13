import { describe, expect, it } from 'vitest';
import { coil, contact, parallel, rung, timer, type Parallel } from './model.js';
import { addBranch, findElement, findRung, insertAfter, moveRung, removeNode } from './ops.js';

const ops = (r: ReturnType<typeof rung>) =>
	r.logic.items.map((e) => (e.kind === 'contact' ? e.operand : e.kind));

describe('ladder editing', () => {
	it('inserts after an element, into a branch, or at the end', () => {
		const a = contact('NO', 'I0.0');
		const r = rung([a]);
		insertAfter(r, null, contact('NO', 'I0.2'));
		insertAfter(r, a.id, contact('NO', 'I0.1'));
		expect(ops(r)).toEqual(['I0.0', 'I0.1', 'I0.2']);

		const p = parallel([[contact('NO', 'M0.0')], [contact('NO', 'M0.1')]]);
		r.logic.items.push(p);
		insertAfter(r, p.branches[1].id, contact('NC', 'M0.2'));
		expect(p.branches[1].items).toHaveLength(2);
	});

	it('wraps an element in a parallel block, then adds more branches', () => {
		const a = contact('NO', 'I0.0');
		const r = rung([a, contact('NC', 'I0.1')]);
		expect(addBranch(r, a.id, contact('NO', 'Q0.0'))).toBe(true);
		const p = r.logic.items[0] as Parallel;
		expect(p.kind).toBe('parallel');
		expect(p.branches.map((b) => b.items.length)).toEqual([1, 1]);

		addBranch(r, p.id, contact('NO', 'M0.0'));
		expect(p.branches).toHaveLength(3);
		expect(addBranch(r, 'missing')).toBe(false);
	});

	it('removing an element unwraps a parallel left with one branch', () => {
		const a = contact('NO', 'I0.0');
		const b = contact('NO', 'Q0.0');
		const r = rung([parallel([[a], [b]]), contact('NC', 'I0.1')]);
		removeNode(r, b.id);
		expect(ops(r)).toEqual(['I0.0', 'I0.1']);
	});

	it('removes a whole branch and coils', () => {
		const p = parallel([[contact()], [contact(), timer()], [contact()]]);
		const c = coil();
		const r = rung([p], [c, coil('SET', 'M0.0')]);
		expect(removeNode(r, p.branches[1].id)).toBe(true);
		expect((r.logic.items[0] as Parallel).branches).toHaveLength(2);
		expect(removeNode(r, c.id)).toBe(true);
		expect(r.coils).toHaveLength(1);
		expect(removeNode(r, 'missing')).toBe(false);
	});

	it('finds elements nested in branches and their rung', () => {
		const deep = contact('NO', 'M9.9');
		const r = rung([parallel([[contact()], [parallel([[deep], [contact()]])]])]);
		const program = { version: 1 as const, rungs: [rung(), r] };
		expect(findElement(r.logic, deep.id)?.element).toBe(deep);
		expect(findRung(program, deep.id)).toBe(r);
	});

	it('moves rungs', () => {
		const [a, b] = [rung(), rung()];
		const program = { version: 1 as const, rungs: [a, b] };
		moveRung(program, a.id, 1);
		expect(program.rungs).toEqual([b, a]);
		moveRung(program, a.id, 1); // already last
		expect(program.rungs).toEqual([b, a]);
	});
});
