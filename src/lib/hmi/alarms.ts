import type { AlarmClass, AlarmDef } from './model.js';

/*
 * Alarm handling like on a real HMI. An alarm *comes* when its bit goes to 1 and *goes* when it
 * returns to 0; the operator *acknowledges* it. It leaves the active list only when it is both
 * gone and acknowledged. Everything stays in the history.
 */

export interface AlarmEntry {
	seq: number;
	defId: string;
	text: string;
	kind: AlarmClass;
	/** simulated time (ms) */
	came: number;
	gone: number | null;
	acked: number | null;
}

export interface AlarmLog {
	entries: AlarmEntry[]; // newest first
	/** last value of each alarm bit */
	prev: Record<string, boolean>;
	seq: number;
}

export const HISTORY = 100;
export const newAlarmLog = (): AlarmLog => ({ entries: [], prev: {}, seq: 0 });

/** Applies the current alarm bits. `isOn` returns null for a tag that cannot be read. */
export function updateAlarms(
	log: AlarmLog,
	defs: readonly AlarmDef[],
	isOn: (tag: string) => boolean | null,
	now: number
): AlarmLog {
	let entries = log.entries;
	const prev = { ...log.prev };
	let seq = log.seq;
	let changed = false;
	for (const def of defs) {
		const on = isOn(def.tag) ?? false;
		const was = prev[def.id] ?? false;
		prev[def.id] = on;
		if (on && !was) {
			entries = [
				{
					seq: ++seq,
					defId: def.id,
					text: def.text,
					kind: def.kind,
					came: now,
					gone: null,
					acked: null
				},
				...entries
			].slice(0, HISTORY);
			changed = true;
		} else if (!on && was) {
			entries = entries.map((e) =>
				e.defId === def.id && e.gone === null ? { ...e, gone: now } : e
			);
			changed = true;
		}
	}
	if (!changed && Object.keys(prev).length === Object.keys(log.prev).length) {
		const same = defs.every((d) => prev[d.id] === log.prev[d.id]);
		if (same) return log;
	}
	return { entries, prev, seq };
}

/** Acknowledges the given entries (all unacknowledged when `seqs` is omitted). */
export function ackAlarms(log: AlarmLog, now: number, seqs?: readonly number[]): AlarmLog {
	const hit = (e: AlarmEntry) => e.acked === null && (!seqs || seqs.includes(e.seq));
	if (!log.entries.some(hit)) return log;
	return { ...log, entries: log.entries.map((e) => (hit(e) ? { ...e, acked: now } : e)) };
}

/** Active = not yet both gone and acknowledged. */
export const activeAlarms = (log: AlarmLog) =>
	log.entries.filter((e) => e.gone === null || e.acked === null);

export const unacked = (log: AlarmLog) => log.entries.filter((e) => e.acked === null).length;

/** State letters used on real panels: C = came, G = gone, A = acknowledged. */
export function alarmState(e: AlarmEntry): string {
	return (e.gone === null ? 'C' : 'CG') + (e.acked === null ? '' : 'A');
}

export const formatTime = (ms: number) => {
	const s = Math.floor(ms / 1000);
	const pad = (n: number) => String(n).padStart(2, '0');
	return `${pad(Math.floor(s / 60))}:${pad(s % 60)}.${String(Math.floor(ms % 1000)).padStart(3, '0')}`;
};
