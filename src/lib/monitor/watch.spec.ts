import { describe, expect, it } from 'vitest';
import { parseAddress } from '#lib/engine/index.js';
import {
	bitWidth,
	canForce,
	canModify,
	fixWatchFormats,
	formatValue,
	traceSignal,
	watchEntry
} from './watch.js';

describe('watch table helpers', () => {
	it('formats values as IEC literals', () => {
		expect(formatValue(true, 'BOOL')).toBe('TRUE');
		expect(formatValue(0, 'BOOL')).toBe('FALSE');
		expect(formatValue(-5, 'DEC')).toBe('-5');
		expect(formatValue(42, 'HEX', 16)).toBe('16#002A');
		expect(formatValue(-1, 'HEX', 16)).toBe('16#FFFF');
		expect(formatValue(-1, 'HEX', 32)).toBe('16#FFFFFFFF');
		expect(formatValue(42, 'BIN', 8)).toBe('2#0010_1010');
		expect(formatValue(3.5, 'REAL')).toBe('3.5');
		expect(formatValue(2, 'REAL')).toBe('2.0');
		expect(formatValue(null, 'DEC')).toBe('—');
		expect(formatValue(NaN, 'DEC')).toBe('—');
	});

	it('guesses formats and knows what can be forced or modified', () => {
		expect(watchEntry('I0.0').format).toBe('BOOL');
		expect(watchEntry('MW4').format).toBe('DEC');
		expect(watchEntry('T1').format).toBe('BOOL');
		const a = (t: string) => parseAddress(t);
		expect([
			canForce(a('I0.0')),
			canForce(a('M1.1')),
			canForce(a('MW0')),
			canForce(a('T1'))
		]).toEqual([true, true, false, false]);
		expect([canModify(a('I0.0')), canModify(a('QB0')), canModify(a('MD4'))]).toEqual([
			false,
			true,
			true
		]);
		expect([bitWidth(a('MB0')), bitWidth(a('MD0')), bitWidth(a('C1'))]).toEqual([8, 32, 16]);
	});

	it('maps rows to trace signals', () => {
		expect(traceSignal(watchEntry('T0', 'BOOL'), 'T0')).toEqual({ address: 'T0', kind: 'bit' });
		expect(traceSignal(watchEntry('T0', 'DEC'), 'T0')).toEqual({
			address: 'T0',
			kind: 'number',
			type: undefined
		});
		expect(traceSignal(watchEntry('MD0', 'REAL'), 'MD0')).toMatchObject({ type: 'REAL' });
	});
});

describe('fixWatchFormats', () => {
	it('gives words named by symbol a decimal format', () => {
		const rows = [watchEntry('Temperature', undefined, true), watchEntry('Start')];
		fixWatchFormats(rows, [
			{ name: 'Temperature', address: 'IW4' },
			{ name: 'Start', address: 'I0.0' }
		]);
		expect(rows.map((r) => r.format)).toEqual(['DEC', 'BOOL']);
	});
});
