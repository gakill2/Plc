import { formatAddress, type Address, type Instr, type Operand } from '#lib/engine/index.js';

/*
 * Static analysis of a compiled program (works for LAD and ST alike, because both compile to
 * the same IR): a cross-reference of every address, and warnings for common mistakes.
 */

export type WriteKind = 'coil' | 'set' | 'reset' | 'move' | 'math' | 'timer' | 'counter';

export interface XrefEntry {
	address: string;
	/** Owners (ladder node ids / ST "L<line>") that read the address, in program order. */
	reads: string[];
	writes: { owner: string; kind: WriteKind }[];
}

export interface Warning {
	/** Node id (ladder), "L<line>" (ST) or null for the whole program. */
	id: string | null;
	message: string;
}

/** Addresses the ST compiler uses for its own variables and temporaries. */
const isReserved = (key: string) => {
	const m = /^M[BWD]?(\d+)/.exec(key);
	return m !== null && Number(m[1]) >= 128;
};

const AREA_ORDER = 'IQMTC';

/** Sorts I0.0 < I0.1 < I1.0 < Q0.0 < MB4 < MW10 < T0 < C0. */
export function compareAddresses(a: string, b: string): number {
	const parse = (s: string) => {
		const m = /^([IQMTC])[BWD]?(\d+)(?:\.(\d))?$/.exec(s);
		return m ? [AREA_ORDER.indexOf(m[1]), Number(m[2]), Number(m[3] ?? -1)] : [9, 0, 0];
	};
	const [x, y] = [parse(a), parse(b)];
	return x[0] - y[0] || x[1] - y[1] || x[2] - y[2] || a.localeCompare(b);
}

export function crossReference(
	program: readonly Instr[],
	sourceMap: readonly (string | null)[]
): XrefEntry[] {
	const table = new Map<string, XrefEntry>();
	const entry = (a: Address) => {
		const key = formatAddress(a);
		let e = table.get(key);
		if (!e) table.set(key, (e = { address: key, reads: [], writes: [] }));
		return e;
	};

	program.forEach((ins, pc) => {
		const owner = sourceMap[pc] ?? '';
		const read = (a: Address) => {
			const e = entry(a);
			if (!e.reads.includes(owner)) e.reads.push(owner);
		};
		const readOperand = (o: Operand) => {
			if (o.kind === 'addr') read(o.addr);
		};
		const write = (a: Address, kind: WriteKind) => entry(a).writes.push({ owner, kind });

		switch (ins.op) {
			case 'LD':
			case 'LDN':
				return read(ins.addr);
			case 'AND':
			case 'OR':
			case 'XOR':
			case 'ANDN':
			case 'ORN':
				if (ins.addr) read(ins.addr);
				return;
			case 'ST':
			case 'STN':
				return write(ins.addr, 'coil');
			case 'S':
				return write(ins.addr, 'set');
			case 'R':
				return write(ins.addr, 'reset');
			case 'CMP':
				readOperand(ins.a);
				return readOperand(ins.b);
			case 'TON':
			case 'TOF':
			case 'TP':
				readOperand(ins.pt);
				return write({ area: 'T', index: ins.timer }, 'timer');
			case 'CTU':
			case 'CTD':
			case 'CTUD':
				readOperand(ins.pv);
				return write({ area: 'C', index: ins.counter }, 'counter');
			case 'MOVE':
				readOperand(ins.src);
				return write(ins.dst.addr, 'move');
			case 'MATH':
				readOperand(ins.a);
				readOperand(ins.b);
				return write(ins.dst.addr, 'math');
		}
	});

	return [...table.values()]
		.filter((e) => !isReserved(e.address))
		.sort((a, b) => compareAddresses(a.address, b.address));
}

export interface AnalysisInput {
	xref: XrefEntry[];
	language: 'ladder' | 'st';
	/** address → symbol name, for readable messages */
	names: ReadonlyMap<string, string>;
	/** Terminals that have a device wired in the circuit. */
	wired: readonly string[];
	/** Addresses written from outside the program, e.g. by the operator panel. */
	external?: readonly string[];
}

export function analyze({ xref, language, names, wired, external = [] }: AnalysisInput): Warning[] {
	const warnings: Warning[] = [];
	const label = (address: string) =>
		names.has(address) ? `${names.get(address)} (${address})` : address;
	const byAddress = new Map(xref.map((e) => [e.address, e]));

	for (const e of xref) {
		const coils = e.writes.filter((w) => w.kind === 'coil');
		const latches = e.writes.filter((w) => w.kind === 'set' || w.kind === 'reset');
		const instances = e.writes.filter((w) => w.kind === 'timer' || w.kind === 'counter');

		// In ladder every coil writes its bit on every scan, so a second coil silently wins.
		// (In ST, assigning a variable in several IF branches is normal — no warning there.)
		if (language === 'ladder' && coils.length > 1) {
			for (const w of coils.slice(0, -1)) {
				warnings.push({
					id: w.owner,
					message: `${label(e.address)} is written by ${coils.length} coils — only the last one counts`
				});
			}
		}
		if (language === 'ladder' && coils.length > 0 && latches.length > 0) {
			warnings.push({
				id: coils[0].owner,
				message: `${label(e.address)} has a normal coil and SET/RESET coils — the normal coil overrides them`
			});
		}
		if (instances.length > 1) {
			const what = instances[0].kind === 'timer' ? 'timer' : 'counter';
			for (const w of instances.slice(1)) {
				warnings.push({
					id: w.owner,
					message: `${label(e.address)} is used by ${instances.length} ${what} boxes — each needs its own ${what}`
				});
			}
		}
		const area = e.address[0];
		if (
			(area === 'M' || (area === 'Q' && !wired.includes(e.address))) &&
			e.reads.length > 0 &&
			e.writes.length === 0 &&
			!external.includes(e.address)
		) {
			warnings.push({
				id: e.reads[0],
				message: `${label(e.address)} is read but never written — a typo?`
			});
		}
		if ((area === 'T' || area === 'C') && e.reads.length > 0 && instances.length === 0) {
			warnings.push({
				id: e.reads[0],
				message: `${label(e.address)} is read but there is no ${area === 'T' ? 'timer' : 'counter'} box for it`
			});
		}
	}

	for (const terminal of wired) {
		const e = byAddress.get(terminal);
		if (terminal.startsWith('I') && !e?.reads.length) {
			warnings.push({
				id: null,
				message: `${label(terminal)} is wired but never used in the program`
			});
		}
		if (terminal.startsWith('Q') && !e?.writes.length) {
			warnings.push({
				id: null,
				message: `${label(terminal)} is wired but the program never switches it`
			});
		}
	}
	return warnings;
}
