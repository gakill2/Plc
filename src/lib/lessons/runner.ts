import {
	parseAddress,
	Plc,
	ProgramError,
	type Instr,
	type LoadOptions
} from '#lib/engine/index.js';
import { DeviceBank } from '#lib/circuit/devices.js';
import {
	hasFault,
	inputDrive,
	normalizeTerminal,
	outputReaches,
	type Circuit,
	type Fault
} from '#lib/circuit/model.js';
import { createProcess } from '#lib/processes/models.js';
import { FieldLayer } from '#lib/processes/field.js';
import { plantInfo } from '#lib/processes/plants.js';
import type { Lesson, TestContext, TestResult } from './types.js';

const SCAN_MS = 10;

/**
 * Runs a lesson's tests against a compiled program, headless and deterministic:
 * a fresh PLC (and process model) per test, fixed 10 ms scans.
 */
export function runLessonTests(
	lesson: Lesson,
	program: Instr[],
	circuit?: Circuit,
	faults: Fault[] = [],
	load?: LoadOptions
): TestResult[] {
	const field = (lesson.kind === 'commissioning' || lesson.fieldTests) && circuit ? circuit : null;
	return lesson.tests.map((test) => {
		const plc = new Plc();
		try {
			plc.load(program, load);
		} catch (e) {
			const message = e instanceof ProgramError ? e.message : String(e);
			return { name: test.name, passed: false, message: `Program się nie ładuje: ${message}` };
		}
		plc.run();

		const process = lesson.scenario ? createProcess(lesson.scenario) : null;
		const sensors = new FieldLayer(1);
		sensors.realism = !!lesson.realism;
		sensors.noise = Object.fromEntries(
			(plantInfo(lesson.scenario)?.io ?? [])
				.filter((x) => x.noise)
				.map((x) => [x.address, x.noise!])
		);
		const io = sensors.wrap({
			output: (t: string) => plc.getOutput(t),
			input: (t: string, v: boolean) => plc.setInput(t, v),
			word: (a: string) => plc.memory.readNumber(parseAddress(a)),
			setWord: (a: string, v: number) => plc.setInputNumber(a, v)
		});
		process?.step(0, io); // initial sensor values
		const devices = field ? new FieldSim(field, plc) : null;
		if (devices) devices.faults = faults;
		const ctx: TestContext = {
			plc,
			process,
			out: (t) => plc.getOutput(t),
			device: (label) => devices?.device(label) ?? null
		};
		const fail = (message: string): TestResult => ({
			name: test.name,
			passed: false,
			message,
			atMs: plc.timeMs
		});

		for (const step of test.steps) {
			if (step.restart) {
				plc.load(program, load);
				plc.run();
			}
			for (const [terminal, value] of Object.entries(step.set ?? {})) plc.setInput(terminal, value);
			for (const [name, value] of step.commands ?? []) process?.command(name, value);
			for (const [address, fault] of Object.entries(step.fieldFaults ?? {}))
				sensors.setFault(address, fault);
			for (const [id, on] of Object.entries(step.plantFaults ?? {}))
				sensors.setPlantFault(process, id, on);
			for (const [address, value] of Object.entries(step.hmi ?? {})) plc.modify(address, value);
			devices?.actuate(step.actuate ?? {});
			devices?.apply();

			for (let t = 0; t < step.wait;) {
				const before = plc.timeMs;
				plc.scan(SCAN_MS);
				const dt = Math.max(SCAN_MS, plc.timeMs - before);
				t += dt;
				devices?.step(dt);
				if (plc.mode === 'FAULT') return fail(`Błąd PLC: ${plc.fault?.message}`);
				sensors.tick(dt);
				process?.step(dt, io);
				const problem = test.always?.(ctx);
				if (problem) return fail(problem);
			}

			for (const [terminal, expected] of Object.entries(step.expect ?? {})) {
				const actual = plc.getOutput(terminal);
				if (actual !== expected) {
					return fail(
						`Po kroku „${step.label}”: ${terminal} powinno być ${expected ? 1 : 0}, a jest ${actual ? 1 : 0}`
					);
				}
			}
			for (const [label, expected] of Object.entries(step.expectDevices ?? {})) {
				const d = devices?.device(label);
				if (!d) return fail(`Brak urządzenia ${label} w obwodzie`);
				if (d.on !== expected) {
					return fail(
						`Po kroku „${step.label}”: ${label} powinno być ${expected ? 'załączone' : 'wyłączone'}, a jest ${d.on ? 'załączone' : 'wyłączone'}`
					);
				}
			}
			const problem = step.check?.(ctx);
			if (problem) return fail(`Po kroku „${step.label}”: ${problem}`);
		}
		return { name: test.name, passed: true };
	});
}

/**
 * The circuit in a headless test: devices are operated by label, their signals reach the PLC's
 * input terminals through the wiring (so wrong wiring fails the test), outputs drive the devices.
 */
export class FieldSim {
	readonly #actuated: Record<string, boolean> = {};
	readonly #bank = new DeviceBank();
	#sent = new Set<string>();
	/** Faults to simulate (on-call mode tests). */
	faults: Fault[] = [];

	constructor(
		readonly circuit: Circuit,
		readonly plc: Plc
	) {}

	#byLabel = (label: string) =>
		this.circuit.devices.find((d) => d.label.toUpperCase() === label.toUpperCase());

	actuate(changes: Record<string, boolean>) {
		for (const [label, value] of Object.entries(changes)) {
			const d = this.#byLabel(label);
			if (!d) continue;
			if (d.type === 'vfd') {
				if (value) this.#bank.trip(d.id);
				continue;
			}
			this.#actuated[d.id] = value;
		}
	}

	/** Pushes device signals to the input terminals. */
	apply() {
		const drive = inputDrive(this.circuit, this.#actuated, {
			faults: this.faults,
			output: (t) => this.plc.getOutput(t),
			vfd: (id) => this.#bank.out.get(id)
		});
		for (const t of this.#sent) if (!drive.has(t)) this.plc.setInput(t, false);
		for (const [t, v] of drive) this.plc.setInput(t, v);
		this.#sent = new Set(drive.keys());
	}

	step(dtMs: number) {
		const words = this.#bank.step(
			this.circuit,
			dtMs,
			{
				bit: (t) => this.plc.getOutput(t),
				word: (a) => this.plc.memory.readNumber(parseAddress(a))
			},
			this.faults
		);
		for (const [a, v] of words) this.plc.setInputNumber(a, v);
		this.apply();
	}

	device(label: string): { on: boolean; hz: number } | null {
		const d = this.#byLabel(label);
		if (!d) return null;
		if (d.type === 'vfd') {
			const hz = this.#bank.vfd.get(d.id)?.hz ?? 0;
			return { on: Math.abs(hz) > 0.5, hz };
		}
		const wire = this.circuit.wires.find((w) => w.device === d.id && (w.port ?? 'main') === 'main');
		const t = wire ? normalizeTerminal(wire.terminal) : null;
		if (!t || !t.startsWith('Q')) return { on: this.#actuated[d.id] ?? false, hz: 0 };
		if (
			d.type === 'contactor' &&
			(this.#actuated[d.id] || hasFault(this.faults, d.label, 'overload'))
		)
			return { on: false, hz: 0 };
		return { on: this.plc.getOutput(t) && outputReaches(d, 'main', this.faults), hz: 0 };
	}
}
