export const POWER = '#34d399'; // emerald-400
const OFFLINE = '#94a3b8'; // slate-400
const UNPOWERED = '#475569'; // slate-600

/** Wire / symbol colour: neutral offline, green when powered, dim when online but unpowered. */
export function wireColor(online: boolean, powered: boolean): string {
	if (!online) return OFFLINE;
	return powered ? POWER : UNPOWERED;
}

/** Shared input styling for operands drawn on the diagram. */
export const operandInput =
	'w-full rounded border border-transparent bg-transparent px-1 text-center font-mono text-xs text-slate-100 outline-none hover:border-slate-700 focus:border-emerald-500 focus:bg-slate-900 disabled:cursor-default disabled:hover:border-transparent';
