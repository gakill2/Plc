import { priorityOf, type AlarmClass, type AlarmDef, type AlarmPriority } from './model.js';

/*
 * Alarm handling like on a real HMI, with the tools of alarm management (ISA-18.2 / EEMUA 191).
 * An alarm *comes* when its condition holds (after the on-delay) and *goes* when it is gone (after
 * the off-delay); the operator *acknowledges* it. It leaves the active list only when it is both
 * gone and acknowledged. Alarms can be suppressed by design (a state bit) and shelved by the
 * operator for a while. Everything stays in the history, and the statistics tell a flood, a
 * chattering alarm and a standing alarm apart.
 */

export interface AlarmEntry {
	seq: number;
	defId: string;
	text: string;
	kind: AlarmClass;
	priority: AlarmPriority;
	action?: string;
	/** simulated time (ms) */
	came: number;
	gone: number | null;
	acked: number | null;
}

export interface AlarmLog {
	entries: AlarmEntry[]; // newest first
	/** whether each alarm is raised (after delays, suppression and shelving) */
	prev: Record<string, boolean>;
	seq: number;
	/** since when the condition holds (on-delay running) */
	since: Record<string, number>;
	/** since when the condition is gone (off-delay running) */
	offSince: Record<string, number>;
	/** shelved until (simulated ms) */
	shelved: Record<string, number>;
	/** how often each alarm came, ever */
	counts: Record<string, number>;
	/** times the alarms came, recent ones (for the rate) */
	recent: { defId: string; at: number }[];
}

export const HISTORY = 100;
/** the window of the alarm rate: 10 minutes (EEMUA: about 1 alarm per 10 min is manageable) */
export const RATE_WINDOW_MS = 600_000;
/** ISA-18.2: more than 10 alarms in 10 minutes is a flood */
export const FLOOD = 10;
/** an alarm that came 3 times within a minute chatters */
export const CHATTER = { count: 3, windowMs: 60_000 };
/** active longer than this is a standing alarm (24 h in a plant; shortened for the simulator) */
export const STANDING_MS = 300_000;

export const newAlarmLog = (): AlarmLog => ({
	entries: [],
	prev: {},
	seq: 0,
	since: {},
	offSince: {},
	shelved: {},
	counts: {},
	recent: []
});

/** Applies the current alarm bits. `isOn` returns null for a tag that cannot be read. */
export function updateAlarms(
	log: AlarmLog,
	defs: readonly AlarmDef[],
	isOn: (tag: string) => boolean | null,
	now: number
): AlarmLog {
	let entries = log.entries;
	const prev = { ...log.prev };
	const since = { ...log.since };
	const offSince = { ...log.offSince };
	const counts = { ...log.counts };
	let recent = log.recent;
	let seq = log.seq;
	let changed = false;
	for (const def of defs) {
		const raw = isOn(def.tag) ?? false;
		const suppressed = def.suppressTag?.trim() ? (isOn(def.suppressTag) ?? false) : false;
		const shelved = (log.shelved[def.id] ?? -1) > now;
		const cond = raw && !suppressed && !shelved;
		const was = prev[def.id] ?? false;
		let on = was;
		if (cond) {
			delete offSince[def.id];
			if (!was) {
				since[def.id] ??= now;
				if (now - since[def.id] >= (def.onDelayMs ?? 0)) on = true;
			}
		} else {
			delete since[def.id];
			if (was) {
				// a suppressed or shelved alarm goes at once; a gone condition waits for the off-delay
				if (!raw || suppressed || shelved) {
					offSince[def.id] ??= now;
					if (suppressed || shelved || now - offSince[def.id] >= (def.offDelayMs ?? 0)) on = false;
				}
			}
		}
		if (on === was) continue;
		prev[def.id] = on;
		changed = true;
		if (on) {
			delete since[def.id];
			counts[def.id] = (counts[def.id] ?? 0) + 1;
			recent = [...recent.filter((r) => now - r.at < RATE_WINDOW_MS), { defId: def.id, at: now }];
			entries = [
				{
					seq: ++seq,
					defId: def.id,
					text: def.text,
					kind: def.kind,
					priority: priorityOf(def),
					...(def.action ? { action: def.action } : {}),
					came: now,
					gone: null,
					acked: null
				},
				...entries
			].slice(0, HISTORY);
		} else {
			delete offSince[def.id];
			entries = entries.map((e) =>
				e.defId === def.id && e.gone === null ? { ...e, gone: now } : e
			);
		}
	}
	const same = (a: Record<string, number>, b: Record<string, number>) => {
		const ka = Object.keys(a);
		return ka.length === Object.keys(b).length && ka.every((k) => a[k] === b[k]);
	};
	const timing = !same(since, log.since) || !same(offSince, log.offSince);
	if (!changed && !timing && defs.every((d) => (prev[d.id] ?? false) === (log.prev[d.id] ?? false)))
		return log;
	return { ...log, entries, prev, seq, since, offSince, counts, recent };
}

/** Acknowledges the given entries (all unacknowledged when `seqs` is omitted). */
export function ackAlarms(log: AlarmLog, now: number, seqs?: readonly number[]): AlarmLog {
	const hit = (e: AlarmEntry) => e.acked === null && (!seqs || seqs.includes(e.seq));
	if (!log.entries.some(hit)) return log;
	return { ...log, entries: log.entries.map((e) => (hit(e) ? { ...e, acked: now } : e)) };
}

/**
 * The operator shelves an alarm (a nuisance while a technician works on it): it goes from the
 * list at once and does not come back until the time runs out. Shelving is logged.
 */
export function shelveAlarm(log: AlarmLog, defId: string, now: number, forMs: number): AlarmLog {
	return {
		...log,
		shelved: { ...log.shelved, [defId]: now + forMs },
		entries: log.entries.map((e) =>
			e.defId === defId && (e.gone === null || e.acked === null)
				? { ...e, gone: e.gone ?? now, acked: e.acked ?? now }
				: e
		)
	};
}

/** Active = not yet both gone and acknowledged; most urgent first, then newest. */
export const activeAlarms = (log: AlarmLog) =>
	log.entries
		.filter((e) => e.gone === null || e.acked === null)
		.sort((a, b) => a.priority - b.priority || b.came - a.came);

export const unacked = (log: AlarmLog) => log.entries.filter((e) => e.acked === null).length;

/** State letters used on real panels: C = came, G = gone, A = acknowledged. */
export function alarmState(e: AlarmEntry): string {
	return (e.gone === null ? 'C' : 'CG') + (e.acked === null ? '' : 'A');
}

export interface AlarmStats {
	/** alarms that came in the last 10 minutes */
	rate: number;
	flood: boolean;
	/** alarm ids that came 3+ times within a minute */
	chattering: string[];
	/** alarm ids active longer than STANDING_MS */
	standing: string[];
	/** alarm ids shelved right now */
	shelved: string[];
	/** how often each alarm came, most frequent first (the "bad actors") */
	top: { defId: string; count: number }[];
}

export function alarmStats(log: AlarmLog, now: number): AlarmStats {
	const recent = log.recent.filter((r) => now - r.at < RATE_WINDOW_MS);
	const byDef = new Map<string, number[]>();
	for (const r of recent) byDef.set(r.defId, [...(byDef.get(r.defId) ?? []), r.at]);
	const chattering = [...byDef]
		.filter(([, times]) =>
			times.some(
				(t) => times.filter((u) => u >= t && u - t < CHATTER.windowMs).length >= CHATTER.count
			)
		)
		.map(([id]) => id);
	const standing = log.entries
		.filter((e) => e.gone === null && now - e.came >= STANDING_MS)
		.map((e) => e.defId);
	return {
		rate: recent.length,
		flood: recent.length > FLOOD,
		chattering,
		standing: [...new Set(standing)],
		shelved: Object.entries(log.shelved)
			.filter(([, until]) => until > now)
			.map(([id]) => id),
		top: Object.entries(log.counts)
			.map(([defId, count]) => ({ defId, count }))
			.sort((a, b) => b.count - a.count)
	};
}

export const formatTime = (ms: number) => {
	const s = Math.floor(ms / 1000);
	const pad = (n: number) => String(n).padStart(2, '0');
	return `${pad(Math.floor(s / 60))}:${pad(s % 60)}.${String(Math.floor(ms % 1000)).padStart(3, '0')}`;
};
