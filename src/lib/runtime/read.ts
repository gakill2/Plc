import type { Address, NumType } from '#lib/engine/index.js';
import type { RuntimeSnapshot } from './protocol.js';

/** Reads a bit from a snapshot. Timers and counters read as Q. Null when out of range. */
export function readBit(s: RuntimeSnapshot, a: Address): boolean | null {
	if (a.area === 'T') return s.timers[a.index]?.q ?? null;
	if (a.area === 'C') return s.counters[a.index]?.q ?? null;
	const byte = s[a.area][a.byte];
	if (byte === undefined) return null;
	if (a.size !== 'X') return null;
	return ((byte >> a.bit) & 1) === 1;
}

/** Reads a number from a snapshot. Timers read ET (ms), counters CV. Null when out of range. */
export function readNumber(s: RuntimeSnapshot, a: Address, type?: NumType): number | null {
	if (a.area === 'T') return s.timers[a.index]?.et ?? null;
	if (a.area === 'C') return s.counters[a.index]?.cv ?? null;
	const bytes = s[a.area];
	const width = a.size === 'D' ? 4 : a.size === 'W' ? 2 : 1;
	if (a.byte + width > bytes.length) return null;
	if (a.size === 'X') return (bytes[a.byte] >> a.bit) & 1;
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	if (a.size === 'B') return view.getUint8(a.byte);
	if (a.size === 'W') return view.getInt16(a.byte);
	return type === 'REAL' ? view.getFloat32(a.byte) : view.getInt32(a.byte);
}
