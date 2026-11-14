import { formatAddress, parseAddress } from '#lib/engine/index.js';
import { hasFault, type Circuit, type Fault } from './model.js';
import { newVfd, stepVfd, tripVfd, type VfdOutputs, type VfdState } from './vfd.js';

/*
 * Devices with their own behaviour over time (frequency inverters). Used by the editor, which
 * steps them with the PLC's simulated time, and by the lesson runner for headless tests.
 */

export interface PlcView {
	/** physical output terminal, e.g. Q0.0 */
	bit(terminal: string): boolean;
	/** output word, e.g. QW4 */
	word(address: string): number;
}

export const normalizeWord = (text: string | undefined, area: 'I' | 'Q'): string | null => {
	if (!text) return null;
	try {
		const a = parseAddress(text);
		return a.area === area && a.size === 'W' ? formatAddress(a) : null;
	} catch {
		return null;
	}
};

export class DeviceBank {
	readonly vfd = new Map<string, VfdState>();
	readonly out = new Map<string, VfdOutputs>();

	/** Advances every inverter of the circuit; returns the input words they drive (IW → value). */
	step(
		circuit: Circuit,
		dtMs: number,
		plc: PlcView,
		faults: readonly Fault[] = []
	): Map<string, number> {
		const words = new Map<string, number>();
		for (const d of circuit.devices) {
			if (d.type !== 'vfd') continue;
			const terminal = (port: string) =>
				circuit.wires.find((w) => w.device === d.id && (w.port ?? 'main') === port)?.terminal;
			const bit = (port: string) => {
				const t = terminal(port);
				if (hasFault(faults, d.label, 'wire-break', port)) return false;
				return t ? plc.bit(t.toUpperCase()) : false;
			};
			const ai = normalizeWord(d.aiWord, 'Q');
			const { state, out } = stepVfd(
				this.vfd.get(d.id) ?? newVfd(),
				{ run: bit('main'), rev: bit('rev'), reset: bit('reset'), setpoint: ai ? plc.word(ai) : 0 },
				dtMs
			);
			// a seized bearing: overcurrent trip as soon as the drive gets going
			const seized =
				hasFault(faults, d.label, 'vfd-trip') && Math.abs(state.hz) > 15 && !state.fault;
			this.vfd.set(d.id, seized ? tripVfd(state) : state);
			this.out.set(d.id, out);
			const ao = normalizeWord(d.aoWord, 'I');
			if (ao) words.set(ao, out.actual);
		}
		return words;
	}

	trip(id: string) {
		this.vfd.set(id, tripVfd(this.vfd.get(id) ?? newVfd()));
	}

	clear() {
		this.vfd.clear();
		this.out.clear();
	}
}
