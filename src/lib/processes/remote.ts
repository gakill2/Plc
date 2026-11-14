import type { ProcessIO, ProcessModel, RemoteState } from './types.js';

/**
 * A remote I/O station on a fieldbus (think Profinet device or Modbus TCP slave) driving a pump
 * far away in the plant. Its data appears in the PLC's process image:
 *
 * - Q2.0 RunCmd, Q2.1 ResetCmd: command bits sent to the station every bus cycle
 * - I2.0 PumpRunning, I2.1 PumpFault, I2.2 StationOk: status bits from the station
 * - IW6 Heartbeat: a counter the station increments every 100 ms — if it stops, the data is stale
 *
 * Break the cable and the PLC keeps the last values it received: everything looks fine, but it
 * is not. The station's own watchdog stops the pump after 1 s without telegrams (fail-safe).
 */
export class RemoteProcess implements ProcessModel {
	static readonly BUS_CYCLE = 20;
	static readonly HEARTBEAT = 100;
	static readonly STATION_WATCHDOG = 1000;
	static readonly START_DELAY = 300;

	readonly kind = 'remote';
	readonly sensors = ['I2.0', 'I2.1', 'I2.2', 'IW6'] as const;

	link = true;
	pumpRunning = false;
	pumpFault = false;
	heartbeat = 0;
	telegrams = 0;
	/** what the station last received */
	#cmd = { run: false, reset: false };
	/** what the PLC last received (stale while the link is down) */
	#image = { running: false, fault: false, ok: true, heartbeat: 0 };
	#sinceTelegram = 0;
	#sinceBus = 0;
	#sinceBeat = 0;
	#runFor = 0;
	stationTripped = false;

	step(dtMs: number, io: ProcessIO): void {
		this.#sinceBus += dtMs;
		this.#sinceBeat += dtMs;
		if (this.link) {
			while (this.#sinceBus >= RemoteProcess.BUS_CYCLE) {
				this.#sinceBus -= RemoteProcess.BUS_CYCLE;
				this.telegrams++;
				this.#cmd = { run: io.output('Q2.0'), reset: io.output('Q2.1') };
				this.#sinceTelegram = 0;
			}
		} else {
			this.#sinceBus = 0;
			this.#sinceTelegram += dtMs;
		}

		// the station's own watchdog: no telegrams for 1 s → outputs to the safe state
		this.stationTripped = this.#sinceTelegram >= RemoteProcess.STATION_WATCHDOG;
		const run = this.#cmd.run && !this.stationTripped && !this.pumpFault;
		if (this.#cmd.reset) this.pumpFault = false;
		this.#runFor = run ? this.#runFor + dtMs : 0;
		this.pumpRunning = run && this.#runFor >= RemoteProcess.START_DELAY;

		while (this.#sinceBeat >= RemoteProcess.HEARTBEAT) {
			this.#sinceBeat -= RemoteProcess.HEARTBEAT;
			this.heartbeat = (this.heartbeat + 1) % 32768;
		}

		if (this.link)
			this.#image = {
				running: this.pumpRunning,
				fault: this.pumpFault,
				ok: !this.stationTripped,
				heartbeat: this.heartbeat
			};
		io.input('I2.0', this.#image.running);
		io.input('I2.1', this.#image.fault);
		io.input('I2.2', this.#image.ok);
		io.setWord('IW6', this.#image.heartbeat);
	}

	command(name: string, value?: unknown): void {
		if (name === 'link') this.link = Boolean(value);
		if (name === 'fault') this.pumpFault = true;
	}

	state(): RemoteState {
		return {
			kind: 'remote',
			link: this.link,
			pumpRunning: this.pumpRunning,
			pumpFault: this.pumpFault,
			stationTripped: this.stationTripped,
			heartbeat: this.heartbeat,
			plcHeartbeat: this.#image.heartbeat,
			telegrams: this.telegrams,
			runCmd: this.#cmd.run
		};
	}
}
