import { resolve } from '$app/paths';
import { projectKey } from '#lib/project/project.js';
import { getMachine, machineProjectId } from './machines.js';
import { loadLog, pickIncident, startShift } from './shift.js';

/** Starts a new call-out (random machine unless given) and opens the machine in the editor. */
export function beginShift(machineId?: string) {
	const { machine, incident } = pickIncident(loadLog(), machineId);
	startShift(machine, incident);
	// every call-out starts from the healthy machine
	localStorage.removeItem(projectKey(machineProjectId(machine)));
	location.assign(resolve('/editor/[id]', { id: machineProjectId(machine) }));
}

/** Back to the call-out in progress. */
export function resumeHref(machineId: string) {
	const m = getMachine(machineId);
	return m ? resolve('/editor/[id]', { id: machineProjectId(m) }) : resolve('/oncall');
}
