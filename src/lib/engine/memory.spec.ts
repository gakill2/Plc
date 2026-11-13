import { describe, expect, it } from 'vitest';
import { parseAddress as a } from './address.js';
import { Memory, MemoryError } from './memory.js';

describe('Memory', () => {
	it('reads and writes single bits without touching neighbours', () => {
		const mem = new Memory();
		mem.writeBit(a('M0.3'), true);
		mem.writeBit(a('M0.5'), true);
		mem.writeBit(a('M0.3'), false);
		expect(mem.readBit(a('M0.3'))).toBe(false);
		expect(mem.readBit(a('M0.5'))).toBe(true);
		expect(mem.M[0]).toBe(0b0010_0000);
	});

	it('stores words big-endian like Siemens S7', () => {
		const mem = new Memory();
		mem.writeNumber(a('MW0'), 0x0102);
		expect(mem.readNumber(a('MB0'))).toBe(1);
		expect(mem.readNumber(a('MB1'))).toBe(2);
		expect(mem.readBit(a('M1.1'))).toBe(true);
	});

	it('handles INT, DINT and REAL', () => {
		const mem = new Memory();
		mem.writeNumber(a('MW0'), -1234);
		mem.writeNumber(a('MD2'), 100_000);
		mem.writeNumber(a('MD6'), 3.5, 'REAL');
		expect(mem.readNumber(a('MW0'))).toBe(-1234);
		expect(mem.readNumber(a('MD2'))).toBe(100_000);
		expect(mem.readNumber(a('MD6'), 'REAL')).toBe(3.5);
	});

	it('truncates and wraps integers', () => {
		const mem = new Memory();
		mem.writeNumber(a('MW0'), 7.9);
		mem.writeNumber(a('MW2'), 32768);
		mem.writeNumber(a('MB4'), 256 + 5);
		expect(mem.readNumber(a('MW0'))).toBe(7);
		expect(mem.readNumber(a('MW2'))).toBe(-32768);
		expect(mem.readNumber(a('MB4'))).toBe(5);
	});

	it('exposes timers and counters as bits and numbers', () => {
		const mem = new Memory();
		Object.assign(mem.timer(1), { q: true, et: 250 });
		Object.assign(mem.counter(2), { q: true, cv: 7 });
		expect(mem.readBit(a('T1'))).toBe(true);
		expect(mem.readNumber(a('T1'))).toBe(250);
		expect(mem.readBit(a('C2'))).toBe(true);
		expect(mem.readNumber(a('C2'))).toBe(7);
		expect(() => mem.writeBit(a('T1'), false)).toThrow(MemoryError);
		expect(() => mem.writeNumber(a('C2'), 1)).toThrow(MemoryError);
	});

	it('rejects out-of-range and non-bit access', () => {
		const mem = new Memory({
			inputBytes: 2,
			outputBytes: 2,
			markerBytes: 4,
			timers: 2,
			counters: 2
		});
		expect(() => mem.readBit(a('I2.0'))).toThrow(MemoryError);
		expect(() => mem.readNumber(a('MD2'))).toThrow(/out of range/);
		expect(() => mem.readBit(a('T2'))).toThrow(MemoryError);
		expect(() => mem.counter(5)).toThrow(MemoryError);
		expect(() => mem.readBit(a('MW0'))).toThrow(/not a bit/);
	});

	it('reset clears everything', () => {
		const mem = new Memory();
		mem.writeBit(a('Q0.0'), true);
		mem.writeNumber(a('MW0'), 5);
		mem.timer(0).et = 10;
		mem.counter(0).cv = 3;
		mem.reset();
		expect([mem.Q[0], mem.readNumber(a('MW0')), mem.timer(0).et, mem.counter(0).cv]).toEqual([
			0, 0, 0, 0
		]);
	});
});
