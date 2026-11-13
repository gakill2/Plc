import { describe, expect, it } from 'vitest';
import { AddressError, formatAddress, isBitAddress, parseAddress } from './address.js';

describe('parseAddress', () => {
	it.each([
		['I0.0', { area: 'I', size: 'X', byte: 0, bit: 0 }],
		['q1.7', { area: 'Q', size: 'X', byte: 1, bit: 7 }],
		[' M10.3 ', { area: 'M', size: 'X', byte: 10, bit: 3 }],
		['MB2', { area: 'M', size: 'B', byte: 2, bit: 0 }],
		['MW10', { area: 'M', size: 'W', byte: 10, bit: 0 }],
		['MD4', { area: 'M', size: 'D', byte: 4, bit: 0 }],
		['QW0', { area: 'Q', size: 'W', byte: 0, bit: 0 }],
		['T5', { area: 'T', index: 5 }],
		['c12', { area: 'C', index: 12 }]
	])('parses %s', (text, expected) => {
		expect(parseAddress(text)).toEqual(expected);
	});

	it.each(['I0', 'I0.8', 'MW10.1', 'X1.0', '', 'T', 'M-1.0', 'I0.0.0'])('rejects %j', (text) => {
		expect(() => parseAddress(text)).toThrow(AddressError);
	});

	it('explains a missing bit number', () => {
		expect(() => parseAddress('I0')).toThrow(/I0\.0/);
	});
});

describe('formatAddress', () => {
	it.each(['I0.0', 'Q1.7', 'MB2', 'MW10', 'MD4', 'T5', 'C12'])('round-trips %s', (text) => {
		expect(formatAddress(parseAddress(text))).toBe(text);
	});
});

describe('isBitAddress', () => {
	it('is true for bits, timers and counters only', () => {
		expect(['I0.0', 'T1', 'C1', 'MB0', 'MW0'].map((t) => isBitAddress(parseAddress(t)))).toEqual([
			true,
			true,
			true,
			false,
			false
		]);
	});
});
