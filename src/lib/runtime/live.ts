import { parseAddress } from '#lib/engine/index.js';
import type { StVariable } from '#lib/st/compiler.js';
import { resolveSymbol, type SymbolMap } from '#lib/symbols/symbols.js';
import type { RuntimeSnapshot } from './protocol.js';
import { readBit, readNumber } from './read.js';

/**
 * Online value of an operand as written in a diagram: a variable of the program, an instance
 * output (`Timer1.Q`), a symbol or an address. Null when unknown.
 */
export function liveValue(
	snapshot: RuntimeSnapshot | null,
	variables: StVariable[],
	symbols: SymbolMap,
	text: string
): boolean | number | null {
	const t = text.trim();
	if (!snapshot || !t) return null;
	const read = (r: StVariable['reads'][number]) => {
		const a = parseAddress(r.address);
		return r.kind === 'bool' ? readBit(snapshot, a) : readNumber(snapshot, a, r.numType);
	};
	const v = variables.find((x) => x.name.toUpperCase() === t.toUpperCase());
	if (v?.reads[0]) return read(v.reads[0]);
	const dot = t.lastIndexOf('.');
	if (dot > 0) {
		const inst = variables.find((x) => x.name.toUpperCase() === t.slice(0, dot).toUpperCase());
		const r = inst?.reads.find((x) => x.label.toUpperCase() === t.slice(dot + 1).toUpperCase());
		if (r) return read(r);
	}
	try {
		const a = parseAddress(resolveSymbol(symbols, t));
		const bit = a.area === 'T' || a.area === 'C' || a.size === 'X';
		return bit ? readBit(snapshot, a) : readNumber(snapshot, a);
	} catch {
		return null;
	}
}
