import type { OvenState, ProcessIO, ProcessModel } from './types.js';

/**
 * Electric oven — a first-order thermal process with dead time, the textbook plant for a PID loop.
 *
 * - Q0.0 Heater: heater contactor (enable)
 * - QW4 HeaterPower: 0 … 27648 = 0 … 100 % (thyristor power controller)
 * - IW4 Temperature: °C × 10 (like a thermocouple module), 200.0 °C = 2000
 * - I0.0 DoorClosed: door switch
 * - I0.1 OverTemp: safety thermostat, opens the heater circuit above 280 °C
 */
export class OvenProcess implements ProcessModel {
	static readonly AMBIENT = 20;
	/** steady-state rise at 100 % power with the door closed, °C */
	static readonly GAIN = 280;
	/** time constant, s */
	static readonly TAU = 25;
	/** dead time between power and temperature, s */
	static readonly DEAD = 1.5;
	static readonly TRIP = 280;
	static readonly TRIP_RESET = 260;
	/** an open door loses this many times more heat */
	static readonly DOOR_LOSS = 2.5;

	readonly kind = 'oven';
	readonly sensors = ['I0.0', 'I0.1', 'IW4'] as const;

	temp = OvenProcess.AMBIENT;
	maxTemp = OvenProcess.AMBIENT;
	doorClosed = true;
	overTemp = false;
	heater = false;
	/** power requested by the PLC, 0 … 1 */
	demand = 0;
	/** power that reaches the heating elements, 0 … 1 */
	power = 0;
	#delay: { t: number; p: number }[] = [];
	#time = 0;

	step(dtMs: number, io: ProcessIO): void {
		const s = dtMs / 1000;
		this.#time += s;
		this.heater = io.output('Q0.0');
		this.demand = Math.min(1, Math.max(0, io.word('QW4') / 27648));
		this.power = this.heater && this.doorClosed && !this.overTemp ? this.demand : 0;

		// dead time: the elements and the oven walls need a moment
		this.#delay.push({ t: this.#time, p: this.power });
		while (this.#delay.length > 1 && this.#delay[1].t <= this.#time - OvenProcess.DEAD)
			this.#delay.shift();
		const delayed = this.#delay[0].t <= this.#time - OvenProcess.DEAD ? this.#delay[0].p : 0;

		const loss = this.doorClosed ? 1 : OvenProcess.DOOR_LOSS;
		this.temp +=
			((OvenProcess.GAIN * delayed - loss * (this.temp - OvenProcess.AMBIENT)) / OvenProcess.TAU) *
			s;
		this.maxTemp = Math.max(this.maxTemp, this.temp);

		if (this.temp > OvenProcess.TRIP) this.overTemp = true;
		else if (this.temp < OvenProcess.TRIP_RESET) this.overTemp = false;

		io.input('I0.0', this.doorClosed);
		io.input('I0.1', this.overTemp);
		io.setWord('IW4', Math.round(this.temp * 10));
	}

	command(name: string, value?: unknown): void {
		if (name === 'door') this.doorClosed = !value;
		// a cold batch goes in: the temperature drops
		if (name === 'load') this.temp = Math.max(OvenProcess.AMBIENT, this.temp - 25);
		if (name === 'temp' && typeof value === 'number') this.temp = this.maxTemp = value;
	}

	state(): OvenState {
		return {
			kind: 'oven',
			temp: this.temp,
			maxTemp: this.maxTemp,
			doorClosed: this.doorClosed,
			overTemp: this.overTemp,
			heater: this.heater,
			demand: this.demand,
			power: this.power
		};
	}
}
