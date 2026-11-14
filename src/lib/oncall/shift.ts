import { MACHINES, getMachine, type Incident, type Machine } from './machines.js';

/** One on-call call-out: which machine, which fault, and how the diagnosis went. */
export type Shift = {
	machine: string;
	incident: string;
	startedAt: number;
	/** Wrong diagnoses (needless repairs). */
	wrong: number;
	/** Wrong guesses so far, as fault texts. */
	tried: string[];
	solvedAt?: number;
	stars?: number;
};

export type ShiftLog = {
	current: Shift | null;
	/** Finished call-outs, newest first (kept short). */
	history: Shift[];
};

const KEY = 'plcsim:oncall';
/** Every wrong repair costs time: parts, an electrician on the night shift… */
export const PENALTY_MIN = 5;

type Store = Pick<Storage, 'getItem' | 'setItem'>;

export function loadLog(storage: Pick<Storage, 'getItem'> = localStorage): ShiftLog {
	try {
		const data = JSON.parse(storage.getItem(KEY) ?? 'null');
		if (data && typeof data === 'object' && Array.isArray(data.history))
			return { current: data.current ?? null, history: data.history };
	} catch {
		/* fall through */
	}
	return { current: null, history: [] };
}

const save = (log: ShiftLog, storage: Store) => storage.setItem(KEY, JSON.stringify(log));

/** Picks a machine (or the given one) and an incident not seen recently. */
export function pickIncident(
	log: ShiftLog,
	machineId?: string,
	random: () => number = Math.random
): { machine: Machine; incident: Incident } {
	const machines = machineId ? MACHINES.filter((m) => m.id === machineId) : MACHINES;
	const recent = log.history.slice(0, 8).map((s) => s.incident);
	const all = machines.flatMap((machine) =>
		machine.incidents.map((incident) => ({ machine, incident }))
	);
	const fresh = all.filter((x) => !recent.includes(x.incident.id));
	const pool = fresh.length ? fresh : all;
	return pool[Math.floor(random() * pool.length)];
}

export function startShift(
	machine: Machine,
	incident: Incident,
	storage: Store = localStorage,
	now = Date.now()
): Shift {
	const log = loadLog(storage);
	const shift: Shift = {
		machine: machine.id,
		incident: incident.id,
		startedAt: now,
		wrong: 0,
		tried: []
	};
	save({ ...log, current: shift }, storage);
	return shift;
}

/** Minutes the machine stood still, including penalties for wrong repairs. */
export function downtimeMin(s: Shift, now = Date.now()): number {
	const end = s.solvedAt ?? now;
	return Math.max(0, Math.round((end - s.startedAt) / 60_000)) + s.wrong * PENALTY_MIN;
}

export function shiftStars(s: Shift): number {
	const min = downtimeMin(s);
	if (s.wrong === 0 && min <= 5) return 3;
	if (s.wrong <= 1 && min <= 15) return 2;
	return 1;
}

/** Records a diagnosis; returns the updated shift. */
export function diagnose(
	correct: boolean,
	text: string,
	storage: Store = localStorage,
	now = Date.now()
): Shift | null {
	const log = loadLog(storage);
	const s = log.current;
	if (!s || s.solvedAt !== undefined) return s;
	if (!correct) {
		s.wrong++;
		s.tried.push(text);
		save(log, storage);
		return s;
	}
	s.solvedAt = now;
	s.stars = shiftStars(s);
	save({ current: s, history: [s, ...log.history].slice(0, 50) }, storage);
	return s;
}

export const incidentOf = (s: Shift) =>
	getMachine(s.machine)?.incidents.find((i) => i.id === s.incident) ?? null;
