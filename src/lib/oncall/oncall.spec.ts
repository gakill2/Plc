import { describe, expect, it } from 'vitest';
import { deviceSymbols } from '#lib/circuit/model.js';
import { compileLadder } from '#lib/ladder/compiler.js';
import { getLesson } from '#lib/lessons/lessons.js';
import { runLessonTests } from '#lib/lessons/runner.js';
import { checkSymbols } from '#lib/symbols/symbols.js';
import { faultOptions, MACHINES, machineProject, sameFault, type Machine } from './machines.js';
import { diagnose, downtimeMin, loadLog, pickIncident, startShift } from './shift.js';

function run(m: Machine, faults = m.incidents.slice(0, 0).map((i) => i.fault)) {
	const project = machineProject(m);
	const { map } = checkSymbols([...deviceSymbols(project.circuit), ...project.symbols]);
	const { program, diagnostics } = compileLadder(project.ladder, { symbols: map });
	expect(diagnostics).toEqual([]);
	const lesson = getLesson(m.lesson)!;
	return runLessonTests(
		{ ...lesson, fieldTests: true, tests: [...lesson.tests, ...m.tests] },
		program,
		project.circuit,
		faults
	);
}

describe.each(MACHINES.map((m) => [m.name, m] as const))('%s', (_name, machine) => {
	it('works when healthy', () => {
		expect(run(machine).filter((r) => !r.passed)).toEqual([]);
	});

	it.each(machine.incidents.map((i) => [i.id, i] as const))(
		'%s shows a symptom',
		(_id, incident) => {
			expect(run(machine, [incident.fault]).some((r) => !r.passed)).toBe(true);
		}
	);

	it('every fault is one of the choices for its device', () => {
		const devices = machineProject(machine).circuit.devices;
		for (const i of machine.incidents) {
			const d = devices.find((x) => x.label === i.fault.device);
			expect(d, i.id).toBeTruthy();
			expect(
				faultOptions(d!.type, d!.label).some((o) => sameFault(o.fault, i.fault)),
				i.id
			).toBe(true);
		}
	});
});

describe('shift log', () => {
	const memory = () => {
		const data = new Map<string, string>();
		return {
			getItem: (k: string) => data.get(k) ?? null,
			setItem: (k: string, v: string) => void data.set(k, v)
		};
	};

	it('scores a call-out with penalties for wrong repairs', () => {
		const s = memory();
		const { machine, incident } = pickIncident(loadLog(s), 'p7', () => 0);
		startShift(machine, incident, s, 0);
		diagnose(false, 'H1: spalona żarówka', s, 60_000);
		const done = diagnose(true, 'ok', s, 4 * 60_000)!;
		expect(downtimeMin(done)).toBe(9);
		expect(done.stars).toBe(2);
		expect(loadLog(s).history).toHaveLength(1);
		expect(pickIncident(loadLog(s), 'p7', () => 0).incident.id).not.toBe(incident.id);
	});
});
