import { formatAddress, parseAddress } from '#lib/engine/index.js';

/** A named address, e.g. `Start → I0.0`. Names are case-insensitive identifiers. */
export interface SymbolEntry {
	id: string;
	name: string;
	address: string;
	comment: string;
}

export interface SymbolIssue {
	id: string;
	message: string;
}

/** Upper-case name → address text. */
export type SymbolMap = ReadonlyMap<string, string>;

export const SYMBOL_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]{0,31}$/;

function normalizeAddress(text: string): string | null {
	try {
		return formatAddress(parseAddress(text));
	} catch {
		return null;
	}
}

/** Builds the lookup map and reports invalid or duplicate entries (which are left out). */
export function checkSymbols(entries: readonly SymbolEntry[]): {
	map: SymbolMap;
	reverse: SymbolMap;
	issues: SymbolIssue[];
} {
	const map = new Map<string, string>();
	const reverse = new Map<string, string>();
	const issues: SymbolIssue[] = [];

	for (const e of entries) {
		const name = e.name.trim();
		const report = (message: string) =>
			issues.push({ id: e.id, message: `Symbol "${name}": ${message}` });

		if (!SYMBOL_NAME_RE.test(name)) {
			report('use letters, digits and _ (must start with a letter)');
			continue;
		}
		if (normalizeAddress(name) !== null) {
			report('looks like an address — pick another name');
			continue;
		}
		const address = normalizeAddress(e.address);
		if (address === null) {
			report(`"${e.address}" is not a valid address`);
			continue;
		}
		const key = name.toUpperCase();
		if (map.has(key)) {
			report('is defined more than once');
			continue;
		}
		map.set(key, address);
		if (!reverse.has(address)) reverse.set(address, name);
	}

	return { map, reverse, issues };
}

/** Replaces a symbol name with its address; anything else is returned unchanged. */
export function resolveSymbol(map: SymbolMap, text: string): string {
	return map.get(text.trim().toUpperCase()) ?? text;
}

/**
 * The "other name" of an operand, shown under it in the editor:
 * the address of a symbol, or the symbol of an address.
 */
export function aliasOf(map: SymbolMap, reverse: SymbolMap, text: string): string | null {
	const resolved = map.get(text.trim().toUpperCase());
	if (resolved) return resolved;
	const address = normalizeAddress(text);
	return address ? (reverse.get(address) ?? null) : null;
}
