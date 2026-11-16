import { describe, expect, it } from 'vitest';
import { crc32, xlsx } from './xlsx.js';

describe('xlsx', () => {
	it('computes the zip CRC-32', () => {
		expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
	});

	it('writes a zip with the workbook parts and shared strings', () => {
		const bytes = xlsx('PLC Tags', [
			['Name', 'Logical Address'],
			['Start <1>', '%I0.0']
		]);
		expect([...bytes.slice(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04]);
		const text = new TextDecoder().decode(bytes);
		expect(text).toContain('xl/worksheets/sheet1.xml');
		expect(text).toContain('<sheet name="PLC Tags"');
		expect(text).toContain('<t xml:space="preserve">Start &lt;1&gt;</t>');
		expect(text).toContain('<c r="B2" t="s"><v>3</v></c>');
	});
});
