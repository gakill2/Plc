import { parseAddress, type Address } from '#lib/engine/index.js';
import { newId } from '#lib/ladder/model.js';
import type { TraceSignal } from '#lib/runtime/protocol.js';

export type WatchFormat = 'BOOL' | 'DEC' | 'HEX' | 'BIN' | 'REAL';
export const WATCH_FORMATS: WatchFormat[] = ['BOOL', 'DEC', 'HEX', 'BIN', 'REAL'];

/** One row of the watch table. `trend` adds the signal to the timing diagram. */
export interface WatchEntry {
	id: string;
	operand: string;
	format: WatchFormat;
	trend: boolean;
}

export const watchEntry = (operand: string, format?: WatchFormat, trend = false): WatchEntry => ({
	id: newId('w'),
	operand,
	format: format ?? guessFormat(operand),
	trend
});

export function tryParse(text: string): Address | null {
	try {
		return parseAddress(text);
	} catch {
		return null;
	}
}

/** Bits, timers and counters show as BOOL; bytes and words as decimal. */
export function defaultFormat(a: Address): WatchFormat {
	if (a.area === 'T' || a.area === 'C' || a.size === 'X') return 'BOOL';
	return 'DEC';
}

function guessFormat(operand: string): WatchFormat {
	const a = tryParse(operand);
	return a ? defaultFormat(a) : 'BOOL';
}

/**
 * Rows added by symbol name before the symbol table was known default to BOOL;
 * give words their decimal format (e.g. `Temperature` → IW4).
 */
export function fixWatchFormats(
	watch: WatchEntry[],
	symbols: readonly { name: string; address: string }[]
): WatchEntry[] {
	for (const e of watch) {
		if (e.format !== 'BOOL' || tryParse(e.operand)) continue;
		const s = symbols.find((x) => x.name.toUpperCase() === e.operand.trim().toUpperCase());
		const a = s ? tryParse(s.address) : null;
		if (a) e.format = defaultFormat(a);
	}
	return watch;
}

/** Width in bits, for HEX / BIN padding. */
export function bitWidth(a: Address): number {
	if (a.area === 'T' || a.area === 'C') return 16;
	return a.size === 'D' ? 32 : a.size === 'W' ? 16 : a.size === 'B' ? 8 : 1;
}

/** IEC-style literals: TRUE, 42, 16#002A, 2#0010_1010, 3.14 */
export function formatValue(
	value: number | boolean | null,
	format: WatchFormat,
	bits = 16
): string {
	if (value === null || (typeof value === 'number' && Number.isNaN(value))) return '—';
	if (format === 'BOOL') return value === true || value === 1 ? 'TRUE' : 'FALSE';
	const n = Number(value);
	if (format === 'REAL')
		return Number.isInteger(n) ? n.toFixed(1) : String(Number(n.toPrecision(7)));
	const unsigned = bits >= 32 ? n >>> 0 : n & ((1 << bits) - 1);
	if (format === 'HEX')
		return `16#${unsigned
			.toString(16)
			.toUpperCase()
			.padStart(Math.ceil(bits / 4), '0')}`;
	if (format === 'BIN') {
		const digits = unsigned.toString(2).padStart(bits, '0');
		return `2#${digits.replace(/(\d{4})(?=\d)/g, '$1_')}`;
	}
	return String(Math.trunc(n));
}

/** One lane of the timing diagram, in the same order as the trace signals sent to the worker. */
export interface TrendLane {
	label: string;
	format: WatchFormat;
}

/** Only bits of I, Q and M can be forced. */
export const canForce = (a: Address) =>
	(a.area === 'I' || a.area === 'Q' || a.area === 'M') && a.size === 'X';
/** Only Q and M can be written ("modify"). */
export const canModify = (a: Address) => a.area === 'Q' || a.area === 'M';

export function traceSignal(entry: WatchEntry, address: string): TraceSignal {
	return entry.format === 'BOOL'
		? { address, kind: 'bit' }
		: { address, kind: 'number', type: entry.format === 'REAL' ? 'REAL' : undefined };
}

export const demoWatch = (): WatchEntry[] => [
	watchEntry('Start', 'BOOL', true),
	watchEntry('Stop', 'BOOL', true),
	watchEntry('Motor', 'BOOL', true),
	watchEntry('RunDelay', 'DEC', true),
	watchEntry('Running', 'BOOL', true),
	watchEntry('MotorStarts', 'DEC', false)
];
