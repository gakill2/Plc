import { describe, expect, it } from 'vitest';
import { deviceSymbols } from '#lib/circuit/model.js';
import { compileLadder } from '#lib/ladder/compiler.js';
import { getLesson } from '#lib/lessons/lessons.js';
import { runLessonTests } from '#lib/lessons/runner.js';
import { checkSymbols } from '#lib/symbols/symbols.js';
import {
	faultOptions,
	fieldSuspects,
	isFieldFault,
	MACHINES,
	machineProject,
	sameFault,
	type IncidentFault,
	type Machine
} from './machines.js';
import type { Fault } from '#lib/circuit/model.js';
import type { LessonTest } from '#lib/lessons/types.js';
import { compileSt } from '#lib/st/compiler.js';
import { STDLIB } from '#lib/st/stdlib.js';
import { sfcToSt } from '#lib/sfc/sfc.js';
import { diagnose, downtimeMin, loadLog, pickIncident, startShift } from './shift.js';

function run(m: Machine, faults: IncidentFault[] = []) {
	const project = machineProject(m);
	const { map } = checkSymbols([...deviceSymbols(project.circuit), ...project.symbols]);
	const source =
		project.language === 'st'
			? project.st
			: project.language === 'sfc'
				? sfcToSt(project.sfc!).source
				: null;
	const compiled =
		source !== null && source !== undefined
			? compileSt(source, { symbols: map, prelude: STDLIB })
			: compileLadder(project.ladder, { symbols: map });
	expect(compiled.diagnostics).toEqual([]);
	const lesson = getLesson(m.lesson)!;
	const field = faults.filter(isFieldFault);
	const circuitFaults = faults.filter((f): f is Fault => !isFieldFault(f));
	// plant and sensor faults are there from the first step of every test
	const inject = (t: LessonTest): LessonTest => ({
		...t,
		steps: t.steps.map((st, i) =>
			i > 0
				? st
				: {
						...st,
						fieldFaults: {
							...st.fieldFaults,
							...Object.fromEntries(
								field.filter((f) => f.kind === 'sensor').map((f) => [f.device, f.fault])
							)
						},
						plantFaults: {
							...st.plantFaults,
							...Object.fromEntries(
								field.filter((f) => f.kind === 'plant').map((f) => [f.device, true])
							)
						}
					}
		)
	});
	return runLessonTests(
		{
			...lesson,
			fieldTests: !lesson.scenario,
			tests: [...lesson.tests, ...m.tests].map(inject)
		},
		compiled.program,
		project.circuit,
		circuitFaults,
		'load' in compiled ? compiled.load : undefined
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
		const project = machineProject(machine);
		const devices = project.circuit.devices;
		const suspects = fieldSuspects(project.scenario);
		for (const i of machine.incidents) {
			if (isFieldFault(i.fault)) {
				const f = i.fault;
				expect(
					suspects.some((s) => s.options.some((o) => sameFault(o.fault, f))),
					i.id
				).toBe(true);
				continue;
			}
			const d = devices.find((x) => x.label === i.fault.device);
			expect(d, i.id).toBeTruthy();
			expect(
				faultOptions(d!.type, d!.label).some((o) => sameFault(o.fault, i.fault as Fault)),
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
