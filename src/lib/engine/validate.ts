import { formatAddress, isBitAddress } from './address.js';
import type { Program } from './ir.js';
import { checkAddress, MemoryError, type MemoryConfig } from './memory.js';
import type { Address, Operand } from './types.js';

export const MAX_TAPS = 65535;

export interface ProgramIssue {
	pc: number;
	message: string;
}

/** Static checks done when a program is loaded, so that most mistakes never reach RUN. */
export function validateProgram(program: Program, config: MemoryConfig): ProgramIssue[] {
	const issues: ProgramIssue[] = [];

	program.forEach((ins, pc) => {
		const report = (message: string) => issues.push({ pc, message });

		const exists = (addr: Address): boolean => {
			try {
				checkAddress(addr, config);
				return true;
			} catch (e) {
				if (e instanceof MemoryError) {
					report(e.message);
					return false;
				}
				throw e;
			}
		};

		const readableBit = (addr: Address) => {
			if (!exists(addr)) return;
			if (!isBitAddress(addr)) report(`${formatAddress(addr)} is not a bit address`);
		};

		const writableBit = (addr: Address) => {
			if (!exists(addr)) return;
			if (addr.area !== 'Q' && addr.area !== 'M') {
				report(`${formatAddress(addr)} cannot be written — use an output (Q) or marker (M)`);
			} else if (addr.size !== 'X') {
				report(`${formatAddress(addr)} is not a bit address`);
			}
		};

		const operand = (o: Operand) => {
			if (o.kind === 'const') {
				if (!Number.isFinite(o.value)) report(`Invalid constant ${o.value}`);
				return;
			}
			if (!exists(o.addr)) return;
			if (
				o.type === 'REAL' &&
				(o.addr.area === 'T' || o.addr.area === 'C' || o.addr.size !== 'D')
			) {
				report(`${formatAddress(o.addr)} cannot hold a REAL — use a double word, e.g. MD0`);
			}
		};

		const writableNumber = (o: Operand) => {
			if (o.kind !== 'addr') return report('Destination must be an address');
			operand(o);
			const addr = o.addr;
			if (addr.area !== 'Q' && addr.area !== 'M') {
				report(`${formatAddress(addr)} cannot be written — use an output (Q) or marker (M)`);
			}
		};

		switch (ins.op) {
			case 'LD':
			case 'LDN':
				return readableBit(ins.addr);
			case 'AND':
			case 'OR':
			case 'XOR':
			case 'ANDN':
			case 'ORN':
				if (ins.addr) readableBit(ins.addr);
				return;
			case 'ST':
			case 'STN':
			case 'S':
			case 'R':
				return writableBit(ins.addr);
			case 'CMP':
				operand(ins.a);
				return operand(ins.b);
			case 'TON':
			case 'TOF':
			case 'TP':
				exists({ area: 'T', index: ins.timer });
				return operand(ins.pt);
			case 'CTU':
			case 'CTD':
			case 'CTUD':
				exists({ area: 'C', index: ins.counter });
				return operand(ins.pv);
			case 'MOVE':
				operand(ins.src);
				return writableNumber(ins.dst);
			case 'MATH':
				operand(ins.a);
				operand(ins.b);
				return writableNumber(ins.dst);
			case 'JMP':
			case 'JMPC':
			case 'JMPCN':
				if (!Number.isInteger(ins.target) || ins.target < 0 || ins.target > program.length) {
					report(`Jump target ${ins.target} is outside the program`);
				}
				return;
			case 'TAP':
			case 'LDT':
				if (!Number.isInteger(ins.slot) || ins.slot < 0 || ins.slot > MAX_TAPS) {
					report(`Probe slot ${ins.slot} is invalid (0–${MAX_TAPS})`);
				}
				return;
		}
	});

	return issues;
}
