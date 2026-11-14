import {
	DEFAULT_MEMORY_CONFIG,
	formatAddress,
	parseAddress,
	parseOperand,
	validateProgram,
	type Address,
	type Instr,
	type LoadOptions,
	type MemoryConfig,
	type AddrOperand,
	type Operand
} from '#lib/engine/index.js';
import { resolveSymbol, type SymbolMap } from '#lib/symbols/symbols.js';
import { compileSt } from '#lib/st/compiler.js';
import { STDLIB } from '#lib/st/stdlib.js';
import type { BlockBox, Element, LadderProgram, Rung, Series } from './model.js';

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
	/** retentive memory and cyclic interrupt (ST programs) */
	load?: LoadOptions;
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
	/** The user's library of function blocks (ST source), next to the standard one. */
	library?: string;
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

	const destination = (id: string, text: string, what: string): AddrOperand | null => {
		const o = operand(id, text, what);
		if (o.kind === 'addr') return o;
		if (text.trim()) report(id, `${what}: needs an address such as MW10, not a constant`);
		return null;
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
			case 'move': {
				powered(started);
				const src = operand(el.id, el.src, 'MOVE input');
				const dst = destination(el.id, el.dst, 'MOVE output');
				if (dst) emit({ op: 'MOVE', src, dst });
				return true;
			}
			case 'math': {
				powered(started);
				const a = operand(el.id, el.a, `${el.fn} input 1`);
				const b = operand(el.id, el.b, `${el.fn} input 2`);
				const dst = destination(el.id, el.dst, `${el.fn} output`);
				if (dst) emit({ op: 'MATH', fn: el.fn, a, b, dst });
				return true;
			}
			case 'block': {
				powered(started);
				const seg = blocks.segments.get(el.id);
				if (!seg) return true;
				emit({ op: 'ST', addr: seg.en });
				const base = program.length;
				for (const ins of seg.code)
					emit(
						'target' in ins && ins.op.startsWith('JMP')
							? { ...ins, target: ins.target + base }
							: ins
					);
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

	const blocks = compileBlocks(ladder, options, report);
	if (blocks.prologue.length) {
		owner = ladder.rungs[0]?.id ?? null;
		for (const ins of blocks.prologue) emit(ins);
	}
	ladder.rungs.forEach(rung);

	// Engine-level checks (ranges, writable areas …), mapped back to the node that caused them.
	for (const issue of validateProgram(program, config)) {
		report(sourceMap[issue.pc] ?? ladder.rungs[0]?.id ?? '', issue.message);
	}

	return { program, taps, sourceMap, diagnostics: dedupe(diagnostics) };
}

/* ---------- function blocks ---------- */

function allBlocks(ladder: LadderProgram): BlockBox[] {
	const out: BlockBox[] = [];
	const walk = (items: Element[]) => {
		for (const e of items) {
			if (e.kind === 'block') out.push(e);
			if (e.kind === 'parallel') for (const b of e.branches) walk(b.items);
		}
	};
	for (const r of ladder.rungs) walk(r.logic.items);
	return out;
}

const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Function blocks are written in ST, so the ladder's block calls are compiled by the ST compiler
 * as one program — one `IF enable THEN instance(...); END_IF;` per box, separated by marker
 * assignments — and the code between the markers is spliced into the rung where the box sits.
 * Jump targets inside a piece are made relative to it.
 */
function compileBlocks(
	ladder: LadderProgram,
	options: CompileOptions,
	report: (id: string, message: string) => void
): { prologue: Instr[]; segments: Map<string, { en: Address; code: Instr[] }> } {
	const empty = { prologue: [], segments: new Map() };
	const blocks = allBlocks(ladder);
	if (!blocks.length) return empty;

	const instances = new Map<string, string>();
	const valid: BlockBox[] = [];
	for (const b of blocks) {
		let addressLike = false;
		try {
			parseAddress(b.instance);
			addressLike = true;
		} catch {
			/* a proper name */
		}
		if (!IDENT.test(b.instance) || addressLike) {
			report(b.id, `Instance name "${b.instance}" must be a name like PID_1 (not an address)`);
			continue;
		}
		const prev = instances.get(b.instance.toUpperCase());
		if (prev && prev !== b.type.toUpperCase()) {
			report(b.id, `Instance ${b.instance} is already a ${prev}`);
			continue;
		}
		instances.set(b.instance.toUpperCase(), b.type.toUpperCase());
		valid.push(b);
	}
	if (!valid.length) return empty;

	// the source, remembering where each box's text is
	let src = 'VAR\n';
	const declAt = new Map<string, [number, number]>();
	const seen = new Set<string>();
	for (const b of valid) {
		if (seen.has(b.instance.toUpperCase())) continue;
		seen.add(b.instance.toUpperCase());
		const from = src.length;
		src += `  ${b.instance} : ${b.type};\n`;
		declAt.set(b.id, [from, src.length]);
	}
	valid.forEach((_, k) => (src += `  LAD_EN${k} : BOOL;\n  LAD_M${k} : BOOL;\n`));
	src += '  LAD_MEND : BOOL;\nEND_VAR\n';
	const callAt: [number, number][] = [];
	valid.forEach((b, k) => {
		const args = Object.entries(b.pins)
			.filter(([, v]) => v.trim())
			.map(([pin, v]) =>
				pin.startsWith('>') ? `${pin.slice(1)} => ${v.trim()}` : `${pin} := ${v.trim()}`
			);
		src += `LAD_M${k} := TRUE;\n`;
		const from = src.length;
		src += `IF LAD_EN${k} THEN\n  ${b.instance}(${args.join(', ')});\nEND_IF;\n`;
		callAt.push([from, src.length]);
	});
	src += 'LAD_MEND := TRUE;\n';

	const r = compileSt(src, {
		symbols: options.symbols,
		config: options.config,
		prelude: options.library ? `${STDLIB}\n${options.library}` : STDLIB
	});
	for (const d of r.diagnostics) {
		const k = callAt.findIndex(([a, b]) => d.from >= a && d.from < b);
		const decl = [...declAt.entries()].find(([, [a, b]]) => d.from >= a && d.from < b);
		const id = k >= 0 ? valid[k].id : decl ? decl[0] : valid[0].id;
		report(id, d.message.replace(/LAD_\w+/g, 'EN'));
	}
	if (r.diagnostics.length) return empty;

	const addrOf = (name: string): Address | null => {
		const v = r.variables.find((x) => x.name === name);
		return v ? parseAddress(v.reads[0].address) : null;
	};
	const markerAt = (name: string) => {
		const a = addrOf(name);
		const i = r.program.findIndex(
			(ins) => ins.op === 'ST' && a && formatAddress(ins.addr) === formatAddress(a)
		);
		// LDC TRUE · ST marker · POP
		return { start: i - 1, end: i + 2 };
	};
	const marks = valid.map((_, k) => markerAt(`LAD_M${k}`));
	const endMark = markerAt('LAD_MEND');
	const piece = (from: number, to: number): Instr[] =>
		r.program
			.slice(from, to)
			.map((ins) =>
				'target' in ins && ins.op.startsWith('JMP') ? { ...ins, target: ins.target - from } : ins
			);

	const segments = new Map<string, { en: Address; code: Instr[] }>();
	valid.forEach((b, k) => {
		const from = marks[k].end;
		const to = k + 1 < marks.length ? marks[k + 1].start : endMark.start;
		segments.set(b.id, { en: addrOf(`LAD_EN${k}`)!, code: piece(from, to) });
	});
	return { prologue: piece(0, marks[0].start), segments };
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
