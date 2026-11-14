/**
 * A tiny Modbus TCP server and request builder for the communication chapter: shows exactly
 * which bytes travel on the wire for the four most common function codes.
 */

export type FunctionCode = 1 | 3 | 5 | 6;

export const FUNCTIONS: Record<FunctionCode, { name: string; table: string; write: boolean }> = {
	1: { name: '01 Read Coils', table: 'cewki (0x, bity R/W)', write: false },
	3: { name: '03 Read Holding Registers', table: 'rejestry (4x, słowa R/W)', write: false },
	5: { name: '05 Write Single Coil', table: 'cewki (0x, bity R/W)', write: true },
	6: { name: '06 Write Single Register', table: 'rejestry (4x, słowa R/W)', write: true }
};

export interface Slave {
	coils: boolean[];
	registers: number[];
}

export interface Part {
	label: string;
	bytes: number[];
}

const word = (n: number) => [(n >> 8) & 0xff, n & 0xff];

/** MBAP header + PDU, split into labelled parts. */
export function request(
	fc: FunctionCode,
	address: number,
	qtyOrValue: number,
	transaction = 1,
	unit = 1
): Part[] {
	const value = fc === 5 ? (qtyOrValue ? 0xff00 : 0x0000) : qtyOrValue & 0xffff;
	const pdu: Part[] = [
		{ label: 'kod funkcji', bytes: [fc] },
		{ label: 'adres (od 0)', bytes: word(address) },
		{ label: FUNCTIONS[fc].write ? 'wartość' : 'ilość', bytes: word(value) }
	];
	return mbap(transaction, unit, pdu);
}

function mbap(transaction: number, unit: number, pdu: Part[]): Part[] {
	const length = 1 + pdu.reduce((n, p) => n + p.bytes.length, 0);
	return [
		{ label: 'ID transakcji', bytes: word(transaction) },
		{ label: 'protokół (0 = Modbus)', bytes: [0, 0] },
		{ label: 'długość', bytes: word(length) },
		{ label: 'ID jednostki', bytes: [unit] },
		...pdu
	];
}

export interface Reply {
	parts: Part[];
	/** what the slave did, in words */
	text: string;
	slave: Slave;
}

/** The slave's answer (and its new state) to a request. */
export function respond(
	slave: Slave,
	fc: FunctionCode,
	address: number,
	qtyOrValue: number,
	transaction = 1,
	unit = 1
): Reply {
	const size = fc === 1 || fc === 5 ? slave.coils.length : slave.registers.length;
	const count = FUNCTIONS[fc].write ? 1 : qtyOrValue;
	if (count < 1 || count > 125)
		return exception(slave, fc, 3, 'Niedozwolona ilość (Illegal Data Value)', transaction, unit);
	if (address < 0 || address + count > size)
		return exception(
			slave,
			fc,
			2,
			`Adres poza zakresem: stacja ma ${size} pozycji (Illegal Data Address)`,
			transaction,
			unit
		);

	if (fc === 1) {
		const bits = slave.coils.slice(address, address + count);
		const bytes: number[] = [];
		bits.forEach((b, i) => {
			if (i % 8 === 0) bytes.push(0);
			if (b) bytes[bytes.length - 1] |= 1 << (i % 8);
		});
		return {
			parts: mbap(transaction, unit, [
				{ label: 'kod funkcji', bytes: [fc] },
				{ label: 'liczba bajtów', bytes: [bytes.length] },
				{ label: 'bity (najmłodszy = pierwsza cewka)', bytes }
			]),
			text: `Stacja odesłała ${count} bitów: ${bits.map((b) => (b ? 1 : 0)).join(' ')}.`,
			slave
		};
	}
	if (fc === 3) {
		const values = slave.registers.slice(address, address + count);
		return {
			parts: mbap(transaction, unit, [
				{ label: 'kod funkcji', bytes: [fc] },
				{ label: 'liczba bajtów', bytes: [values.length * 2] },
				{ label: 'wartości (big-endian)', bytes: values.flatMap(word) }
			]),
			text: `Stacja odesłała ${count} rejestrów: ${values.join(', ')}.`,
			slave
		};
	}
	// writes echo the request
	const next: Slave = { coils: [...slave.coils], registers: [...slave.registers] };
	if (fc === 5) next.coils[address] = !!qtyOrValue;
	else next.registers[address] = qtyOrValue & 0xffff;
	return {
		parts: request(fc, address, qtyOrValue, transaction, unit),
		text: `Zapisano. Odpowiedź to echo zapytania — tak stacja potwierdza zapis.`,
		slave: next
	};
}

function exception(
	slave: Slave,
	fc: FunctionCode,
	code: number,
	text: string,
	transaction: number,
	unit: number
): Reply {
	return {
		parts: mbap(transaction, unit, [
			{ label: 'kod funkcji + 0x80 (błąd)', bytes: [fc | 0x80] },
			{ label: 'kod wyjątku', bytes: [code] }
		]),
		text,
		slave
	};
}

export const hex = (bytes: number[]) =>
	bytes.map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
