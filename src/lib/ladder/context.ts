import { getContext, setContext } from 'svelte';
import type { LadderDocument } from './document.svelte.js';
import type { Monitor } from './monitor.js';

export interface LadderView {
	readonly doc: LadderDocument;
	/** Live values, null while the PLC is offline. */
	readonly monitor: Monitor | null;
	/** Editing is disabled while the program is online. */
	readonly locked: boolean;
	/** id of the <datalist> with symbol names for operand inputs. */
	readonly listId: string;
	/** Non-blocking analysis warnings for one node. */
	warningsFor(id: string): string[];
}

const KEY = Symbol('ladder-view');

export const setLadderView = (view: LadderView) => setContext(KEY, view);
export const getLadderView = () => getContext<LadderView>(KEY);
