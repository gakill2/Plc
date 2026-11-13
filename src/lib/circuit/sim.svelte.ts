import { DEVICES, type Device } from './model.js';

/** Which devices are physically actuated right now (button held, switch flipped …). */
export class CircuitSim {
	actuated: Record<string, boolean> = $state({});

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
