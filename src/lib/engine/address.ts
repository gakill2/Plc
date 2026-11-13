import type { Address, ByteArea, MemAddress, Size } from './types.js';

export class AddressError extends Error {
	override name = 'AddressError';
}

const MEM_RE = /^([IQM])([BWD])?(\d+)(?:\.(\d+))?$/;
const TC_RE = /^([TC])(\d+)$/;

/**
 * Parses a Siemens S7-style address: `I0.0`, `Q1.7`, `M10.3`, `MB2`, `MW10`, `MD4`, `T1`, `C5`.
 * Case-insensitive, surrounding whitespace ignored.
 */
export function parseAddress(text: string): Address {
	const s = text.trim().toUpperCase();

	const tc = TC_RE.exec(s);
	if (tc) {
		const index = Number(tc[2]);
		return tc[1] === 'T' ? { area: 'T', index } : { area: 'C', index };
	}

	const m = MEM_RE.exec(s);
	if (!m) throw new AddressError(`Invalid address "${text}"`);

	const [, area, sizeLetter, byteText, bitText] = m;
	const byte = Number(byteText);

	if (sizeLetter) {
		if (bitText !== undefined) {
			throw new AddressError(`"${text}": ${area}${sizeLetter} addresses have no bit number`);
		}
		return { area: area as ByteArea, size: sizeLetter as Size, byte, bit: 0 };
	}

	if (bitText === undefined) {
		throw new AddressError(`"${text}": a bit address needs a bit number, e.g. ${area}${byte}.0`);
	}
	const bit = Number(bitText);
	if (bit > 7) throw new AddressError(`"${text}": bit number must be 0–7`);

	return { area: area as ByteArea, size: 'X', byte, bit };
}

export function formatAddress(addr: Address): string {
	if (addr.area === 'T' || addr.area === 'C') return `${addr.area}${addr.index}`;
	if (addr.size === 'X') return `${addr.area}${addr.byte}.${addr.bit}`;
	return `${addr.area}${addr.size}${addr.byte}`;
}

/** True for addresses that can be read as a single bit (I0.0, M1.2, T3, C4). */
export function isBitAddress(addr: Address): boolean {
	return addr.area === 'T' || addr.area === 'C' || addr.size === 'X';
}

export function isMemAddress(addr: Address): addr is MemAddress {
	return addr.area !== 'T' && addr.area !== 'C';
}

export function byteWidth(size: Size): number {
	return size === 'D' ? 4 : size === 'W' ? 2 : 1;
}
