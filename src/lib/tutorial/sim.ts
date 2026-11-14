import { Plc, type Instr } from '#lib/engine/index.js';
import { compileLadder } from '#lib/ladder/compiler.js';
import { compileSt } from '#lib/st/compiler.js';
import { checkSymbols } from '#lib/symbols/symbols.js';
import type { SimBlock, SimInput } from './types.js';

/** Inputs, outputs and extra symbols of a mini-simulator become its symbol table. */
export function simSymbols(block: SimBlock) {
	const entries = [...block.inputs, ...block.outputs, ...(block.symbols ?? [])];
	return checkSymbols(
		entries.map((e, i) => ({ id: `sym${i}`, name: e.label, address: e.address, comment: '' }))
	);
}

export interface CompiledSim {
	program: Instr[];
	taps: Map<string, number>;
	diagnostics: string[];
}

export function compileSim(block: SimBlock): CompiledSim {
	const symbols = simSymbols(block);
	const issues = symbols.issues.map((i) => i.message);
	if (block.ladder) {
		const c = compileLadder(block.ladder(), { symbols: symbols.map });
		return {
			program: c.program,
			taps: c.taps,
			diagnostics: [...issues, ...c.diagnostics.map((d) => d.message)]
		};
	}
	const c = compileSt(block.st ?? '', { symbols: symbols.map });
	return {
		program: c.program,
		taps: new Map(),
		diagnostics: [...issues, ...c.diagnostics.map((d) => d.message)]
	};
}

/** Electrical signal at the PLC terminal for a physical input. */
export function inputSignal(input: SimInput, pressed: boolean, broken: boolean): boolean {
	if (broken) return false;
	return input.nc ? !pressed : pressed;
}

/** Every combination of input signals with the resulting outputs (for logic without memory). */
export function truthTable(
	block: SimBlock,
	program: Instr[]
): { inputs: boolean[]; outputs: boolean[] }[] {
	const n = block.inputs.length;
	const rows: { inputs: boolean[]; outputs: boolean[] }[] = [];
	for (let combo = 0; combo < 1 << n; combo++) {
		const inputs = block.inputs.map((_, i) => ((combo >> (n - 1 - i)) & 1) === 1);
		const plc = new Plc();
		plc.load(program);
		plc.run();
		block.inputs.forEach((inp, i) => plc.setInput(inp.address, inputs[i]));
		plc.scan(10);
		plc.scan(10);
		rows.push({ inputs, outputs: block.outputs.map((o) => plc.getOutput(o.address)) });
	}
	return rows;
}
