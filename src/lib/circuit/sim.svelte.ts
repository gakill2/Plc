import { DEVICES, type Device } from './model.js';

/** Which devices are physically actuated right now (button held, switch flipped …). */
export class CircuitSim {
	actuated: Record<string, boolean> = $state({});
	/** 3-position selectors: -1 = HAND, 0 = OFF, 1 = AUTO */
	positions: Record<string, number> = $state({});

	reset() {
		this.actuated = {};
		this.positions = {};
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
