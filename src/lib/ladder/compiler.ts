import {
	DEFAULT_MEMORY_CONFIG,
	formatAddress,
	parseAddress,
	parseOperand,
	validateProgram,
	type Address,
	type Instr,
	type MemoryConfig,
	type Operand
} from '#lib/engine/index.js';
import { resolveSymbol, type SymbolMap } from '#lib/symbols/symbols.js';
import type { Element, LadderProgram, Rung, Series } from './model.js';

export interface Diagnostic {
	/** Id of the element, coil or rung the problem belongs to. */
	id: string;
	message: string;
}

export interface CompiledLadder {
	program: Instr[];
	/** Node id → probe slot. Probes hold the power on the right side of a node. */
	taps: Map<string, number>;
	/** Instruction index → id of the node that produced it. */
	sourceMap: (string | null)[];
	diagnostics: Diagnostic[];
}

/** Probe key for the power entering a parallel block. */
export const inputTap = (parallelId: string) => `${parallelId}:in`;

/**
 * Compiles a ladder program to IR.
 *
 * Every element is followed by `TAP n`, so the runtime records the power flowing out of it —
 * that is what the editor paints green. A parallel block stores its input power, and each
 * branch starts from it with `LDT`, so boxes inside branches (e.g. a timer) see the real power
 * coming from the left rail:
 *
 *   -| I0.0 |-+-| I0.1 |-------+-( Q0.0 )      LD I0.0 · TAP a · TAP p:in · POP
 *             +-| I0.2 |-[TON]-+               LDT p:in · AND I0.1 · TAP b · TAP br1
 *                                              LDT p:in · AND I0.2 · TON … · TAP br2 · OR …
 */
export interface CompileOptions {
	config?: MemoryConfig;
	/** Symbol name (upper case) → address. Operands may use these names instead of addresses. */
	symbols?: SymbolMap;
}

export function compileLadder(ladder: LadderProgram, options: CompileOptions = {}): CompiledLadder {
	const config = options.config ?? DEFAULT_MEMORY_CONFIG;
	const symbols = options.symbols ?? new Map<string, string>();
	const program: Instr[] = [];
	const sourceMap: (string | null)[] = [];
	const taps = new Map<string, number>();
	const diagnostics: Diagnostic[] = [];
	let owner: string | null = null;

	const emit = (ins: Instr) => {
		program.push(ins);
		sourceMap.push(owner);
	};
	const slot = (id: string): number => {
		let s = taps.get(id);
		if (s === undefined) {
			s = taps.size;
			taps.set(id, s);
		}
		return s;
	};
	const tap = (id: string) => emit({ op: 'TAP', slot: slot(id) });
	const report = (id: string, message: string) => diagnostics.push({ id, message });

	const address = (id: string, text: string, what: string): Address | null => {
		if (!text.trim()) {
			report(id, `${what}: operand is empty`);
			return null;
		}
		try {
			return parseAddress(resolveSymbol(symbols, text));
		} catch (e) {
			report(id, `${what}: ${(e as Error).message}`);
			return null;
		}
	};
	const operand = (id: string, text: string, what: string): Operand => {
		if (!text.trim()) {
			report(id, `${what}: value is empty`);
			return { kind: 'const', value: 0 };
		}
		try {
			return parseOperand(resolveSymbol(symbols, text).trim());
		} catch (e) {
			report(id, `${what}: ${(e as Error).message}`);
			return { kind: 'const', value: 0 };
		}
	};
	const instance = (id: string, text: string, area: 'T' | 'C'): number => {
		const a = address(id, text, area === 'T' ? 'Timer' : 'Counter');
		if (!a) return 0;
		if (a.area !== area) {
			report(
				id,
				`${formatAddress(a)} is not a ${area === 'T' ? 'timer (T0, T1 …)' : 'counter (C0, C1 …)'}`
			);
			return 0;
		}
		return a.index;
	};

	/** Pushes a boolean value, AND-ing it with the power on the stack if there is any. */
	const value = (started: boolean, push: () => void) => {
		push();
		if (started) emit({ op: 'AND' });
	};
	const powered = (started: boolean) => {
		if (!started) emit({ op: 'LDC', value: true });
	};

	/** Returns true: after an element there is always a power value on the stack. */
	function element(el: Element, started: boolean): boolean {
		switch (el.kind) {
			case 'contact': {
				const addr = address(el.id, el.operand, 'Contact');
				if (!addr) {
					value(started, () => emit({ op: 'LDC', value: false }));
					return true;
				}
				if (el.type === 'NO') emit(started ? { op: 'AND', addr } : { op: 'LD', addr });
				else if (el.type === 'NC') emit(started ? { op: 'ANDN', addr } : { op: 'LDN', addr });
				else {
					value(started, () => {
						emit({ op: 'LD', addr });
						emit({ op: el.type === 'P' ? 'EDGE_P' : 'EDGE_N' });
					});
				}
				return true;
			}
			case 'compare': {
				const a = operand(el.id, el.a, 'Compare');
				const b = operand(el.id, el.b, 'Compare');
				value(started, () => emit({ op: 'CMP', cmp: el.cmp, a, b }));
				return true;
			}
			case 'timer': {
				powered(started);
				const t = instance(el.id, el.timer, 'T');
				emit({ op: el.type, timer: t, pt: operand(el.id, el.pt, 'Preset time') });
				return true;
			}
			case 'counter': {
				powered(started);
				const c = instance(el.id, el.counter, 'C');
				const pv = operand(el.id, el.pv, 'Preset value');
				const reset = el.reset.trim()
					? address(el.id, el.reset, el.type === 'CTU' ? 'Reset' : 'Load')
					: null;
				emit(reset ? { op: 'LD', addr: reset } : { op: 'LDC', value: false });
				emit({ op: el.type, counter: c, pv });
				return true;
			}
			case 'parallel': {
				powered(started);
				const input = inputTap(el.id);
				tap(input);
				emit({ op: 'POP' });
				el.branches.forEach((branch, i) => {
					owner = branch.id;
					emit({ op: 'LDT', slot: slot(input) });
					seriesBody(branch, true);
					owner = branch.id;
					tap(branch.id);
					if (i > 0) emit({ op: 'OR' });
				});
				owner = el.id;
				return true;
			}
		}
	}

	function seriesBody(s: Series, started: boolean): void {
		for (const el of s.items) {
			owner = el.id;
			started = element(el, started);
			owner = el.id;
			tap(el.id);
		}
		if (!started) emit({ op: 'LDC', value: true });
	}

	function rung(r: Rung): void {
		owner = r.id;
		seriesBody(r.logic, false);
		owner = r.id;
		tap(r.id);
		if (r.coils.length === 0) report(r.id, 'Rung has no output — add a coil');
		for (const c of r.coils) {
			owner = c.id;
			const addr = address(c.id, c.operand, 'Coil');
			if (!addr) continue;
			const op =
				c.type === 'COIL' ? 'ST' : c.type === 'NCOIL' ? 'STN' : c.type === 'SET' ? 'S' : 'R';
			emit({ op, addr });
		}
		owner = r.id;
		emit({ op: 'POP' });
	}

	ladder.rungs.forEach(rung);

	// Engine-level checks (ranges, writable areas …), mapped back to the node that caused them.
	for (const issue of validateProgram(program, config)) {
		report(sourceMap[issue.pc] ?? ladder.rungs[0]?.id ?? '', issue.message);
	}

	return { program, taps, sourceMap, diagnostics: dedupe(diagnostics) };
}

function dedupe(diagnostics: Diagnostic[]): Diagnostic[] {
	const seen = new Set<string>();
	return diagnostics.filter((d) => {
		const key = `${d.id}\u0000${d.message}`;
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}
