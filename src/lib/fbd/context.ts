import { getContext, setContext } from 'svelte';
import type { BoxType, FbdValue } from './fbd.js';

/** Something that holds a value: an input pin of a box, or the input of a network. */
export interface Slot {
	value: FbdValue;
	negated?: boolean;
}

/** What every part of the FBD editor needs: types, selection, live values. */
export interface FbdEditorContext {
	readonly types: BoxType[];
	readonly readOnly: boolean;
	readonly online: boolean;
	/** ids of boxes / networks / outputs with problems */
	readonly flagged: string[];
	readonly selected: Slot | null;
	select(slot: Slot | null): void;
	/** live value of an operand (symbol, address, constant) — null when unknown or offline */
	valueOf(text: string): boolean | number | null;
	/** live value of a box output */
	signal(boxId: string): boolean | number | null;
}

const KEY = Symbol('fbd-editor');
export const setFbdEditor = (c: FbdEditorContext) => setContext(KEY, c);
export const getFbdEditor = () => getContext<FbdEditorContext>(KEY);
