import { describe, expect, it } from 'vitest';
import { aliasOf, checkSymbols, resolveSymbol, type SymbolEntry } from './symbols.js';

const sym = (id: string, name: string, address: string): SymbolEntry => ({
	id,
	name,
	address,
	comment: ''
});

describe('symbols', () => {
	it('resolves names case-insensitively and normalises addresses', () => {
		const { map, issues } = checkSymbols([sym('a', 'Start', 'i0.0'), sym('b', 'Speed', 'mw10')]);
		expect(issues).toEqual([]);
		expect(resolveSymbol(map, 'start')).toBe('I0.0');
		expect(resolveSymbol(map, ' SPEED ')).toBe('MW10');
		expect(resolveSymbol(map, 'Q0.0')).toBe('Q0.0');
	});

	it('gives the other name of an operand', () => {
		const { map, reverse } = checkSymbols([sym('a', 'Start', 'I0.0')]);
		expect(aliasOf(map, reverse, 'Start')).toBe('I0.0');
		expect(aliasOf(map, reverse, 'i0.0')).toBe('Start');
		expect(aliasOf(map, reverse, 'I0.1')).toBeNull();
		expect(aliasOf(map, reverse, 'garbage')).toBeNull();
	});

	it('reports bad names, address-like names, bad addresses and duplicates', () => {
		const { map, issues } = checkSymbols([
			sym('1', 'my lamp', 'Q0.0'),
			sym('2', 'T1', 'M0.0'),
			sym('3', 'Lamp', 'Q9'),
			sym('4', 'Motor', 'Q0.0'),
			sym('5', 'motor', 'Q0.1')
		]);
		expect(issues.map((i) => i.id)).toEqual(['1', '2', '3', '5']);
		expect(map.size).toBe(1);
	});
});
