import { describe, expect, it } from 'vitest';
import { hex, request, respond, type Slave } from './modbus.js';

const flat = (parts: { bytes: number[] }[]) => hex(parts.flatMap((p) => p.bytes));
const slave = (): Slave => ({ coils: [true, false, true, false], registers: [215, 1800, 0, 42] });

describe('Modbus TCP', () => {
	it('builds a read holding registers request', () => {
		expect(flat(request(3, 0, 2, 1, 1))).toBe('00 01 00 00 00 06 01 03 00 00 00 02');
	});

	it('answers with big-endian register values', () => {
		const r = respond(slave(), 3, 0, 2);
		expect(flat(r.parts)).toBe('00 01 00 00 00 07 01 03 04 00 D7 07 08');
	});

	it('packs coils LSB first', () => {
		expect(flat(respond(slave(), 1, 0, 4).parts)).toBe('00 01 00 00 00 04 01 01 01 05');
	});

	it('writes and echoes', () => {
		const r = respond(slave(), 6, 2, 1234);
		expect(r.slave.registers[2]).toBe(1234);
		expect(flat(r.parts)).toBe(flat(request(6, 2, 1234)));
		expect(respond(slave(), 5, 1, 1).slave.coils[1]).toBe(true);
		expect(flat(request(5, 1, 1))).toMatch(/05 00 01 FF 00$/);
	});

	it('reports an illegal address', () => {
		const r = respond(slave(), 3, 3, 2);
		expect(flat(r.parts)).toMatch(/83 02$/);
		expect(r.text).toMatch(/Illegal Data Address/);
	});
});
