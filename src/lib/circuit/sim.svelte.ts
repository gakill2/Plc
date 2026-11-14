import { DeviceBank, type PlcView } from './devices.js';
import { DEVICES, type Circuit, type Device, type Fault } from './model.js';
import type { VfdOutputs } from './vfd.js';

/** Which devices are physically actuated right now (button held, switch flipped …). */
export class CircuitSim {
	actuated: Record<string, boolean> = $state({});
	/** 3-position selectors: -1 = HAND, 0 = OFF, 1 = AUTO */
	positions: Record<string, number> = $state({});

	/** Frequency inverters: their state over time and what they report to the PLC. */
	readonly bank = new DeviceBank();
	/** Faults injected by the on-call mode. */
	faults: Fault[] = $state([]);
	vfd: Record<string, VfdOutputs & { hz: number; code: string | null }> = $state({});

	reset() {
		this.actuated = {};
		this.positions = {};
		this.bank.clear();
		this.vfd = {};
	}

	/** Steps the inverters; returns the input words to send to the PLC. */
	stepDevices(circuit: Circuit, dtMs: number, plc: PlcView): Map<string, number> {
		const words = this.bank.step(circuit, dtMs, plc, this.faults);
		const next: typeof this.vfd = {};
		for (const [id, out] of this.bank.out) {
			const st = this.bank.vfd.get(id)!;
			next[id] = { ...out, hz: st.hz, code: st.fault };
		}
		this.vfd = next;
		return words;
	}

	tripVfd(d: Device) {
		this.bank.trip(d.id);
	}

	position(id: string): number {
		return this.positions[id] ?? 0;
	}

	setPosition(d: Device, position: number) {
		this.positions[d.id] = Math.max(-1, Math.min(1, position));
	}

	isActuated(id: string): boolean {
		return this.actuated[id] ?? false;
	}

	press(d: Device) {
		this.actuated[d.id] = true;
	}

	release(d: Device) {
		if (DEVICES[d.type].momentary) this.actuated[d.id] = false;
	}

	toggle(d: Device) {
		this.actuated[d.id] = !this.isActuated(d.id);
	}
}
