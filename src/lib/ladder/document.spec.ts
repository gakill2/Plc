import { describe, expect, it } from 'vitest';
import { LadderDocument } from './document.svelte.js';
import { coil, contact, rung, type Contact } from './model.js';

const setup = () => {
	const a = contact('NO', 'I0.0');
	const out = coil('COIL', 'Q0.0');
	const doc = new LadderDocument({ version: 1, rungs: [rung([a], [out])] });
	return { doc, a, out };
};
const operands = (doc: LadderDocument, i = 0) =>
	doc.program.rungs[i].logic.items.map((e) => (e as Contact).operand);

describe('LadderDocument editing tools', () => {
	it('inserts before the selection in "before" mode', () => {
		const { doc, a } = setup();
		doc.select(a.id);
		doc.insertMode = 'before';
		doc.insert(contact('NC', 'I0.1'));
		expect(operands(doc)).toEqual(['I0.1', 'I0.0']);
		doc.select(doc.program.rungs[0].id);
		doc.insert(contact('NO', 'I0.2'));
		expect(operands(doc)).toEqual(['I0.2', 'I0.1', 'I0.0']);
	});

	it('changes the type of the selected element', () => {
		const { doc, a, out } = setup();
		doc.select(a.id);
		doc.setType('NC');
		doc.select(out.id);
		doc.setType('SET');
		expect(doc.program.rungs[0].logic.items[0]).toMatchObject({ type: 'NC' });
		expect(doc.program.rungs[0].coils[0]).toMatchObject({ type: 'SET' });
	});

	it('copies and pastes elements, coils and whole networks with new ids', () => {
		const { doc, a, out } = setup();
		expect(doc.paste()).toBe(false);
		doc.select(a.id);
		expect(doc.duplicate()).toBe(true);
		expect(operands(doc)).toEqual(['I0.0', 'I0.0']);
		expect(doc.selectedId).not.toBe(a.id);

		doc.select(out.id);
		doc.duplicate();
		expect(doc.program.rungs[0].coils).toHaveLength(2);

		doc.select(doc.program.rungs[0].id);
		doc.copy();
		doc.paste();
		expect(doc.program.rungs).toHaveLength(2);
		expect(doc.program.rungs[1].id).not.toBe(doc.program.rungs[0].id);
		expect(doc.selectedId).toBe(doc.program.rungs[1].id);
		doc.program.rungs[1].logic.items.pop();
		expect(doc.program.rungs[0].logic.items).toHaveLength(2); // the clipboard is a copy

		doc.select(doc.program.rungs[0].logic.id); // a series cannot be copied
		expect(doc.canCopy).toBe(false);
		expect(doc.copy()).toBe(false);
	});
});
