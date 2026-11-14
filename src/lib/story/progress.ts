import { TICKETS } from './tickets.js';

const KEY = 'plcsim:tickets';

export type TicketRecord = {
	/** When the ticket was first opened (ms since epoch). */
	openedAt: number;
	/** When it was first solved. */
	solvedAt?: number;
	/** Failed "check solution" runs before solving. */
	failedChecks: number;
	/** Hints revealed. */
	hints: number;
	/** The reference solution was shown. */
	usedSolution: boolean;
	/** Best result so far (1–3), set once solved. */
	stars?: number;
};

export type StoryProgress = Record<string, TicketRecord>;

type Store = Pick<Storage, 'getItem' | 'setItem'>;

export function loadStory(storage: Pick<Storage, 'getItem'> = localStorage): StoryProgress {
	try {
		const data = JSON.parse(storage.getItem(KEY) ?? '{}');
		return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
	} catch {
		return {};
	}
}

function save(progress: StoryProgress, storage: Store) {
	storage.setItem(KEY, JSON.stringify(progress));
}

/** Change one ticket's record (created on first use) and store it. */
export function updateTicket(
	id: string,
	change: (r: TicketRecord) => void,
	storage: Store = localStorage,
	now = Date.now()
): TicketRecord {
	const progress = loadStory(storage);
	const record = progress[id] ?? { openedAt: now, failedChecks: 0, hints: 0, usedSolution: false };
	change(record);
	progress[id] = record;
	save(progress, storage);
	return record;
}

/** 3 stars: at most one failed check and no hints; 2: a few tries and one hint; else 1. */
export function starsFor(r: Pick<TicketRecord, 'failedChecks' | 'hints' | 'usedSolution'>): number {
	if (r.usedSolution) return 1;
	if (r.failedChecks <= 1 && r.hints === 0) return 3;
	if (r.failedChecks <= 3 && r.hints <= 1) return 2;
	return 1;
}

/** Record a solved ticket; keeps the best star count. */
export function solveTicket(id: string, storage: Store = localStorage, now = Date.now()) {
	return updateTicket(
		id,
		(r) => {
			r.solvedAt ??= now;
			r.stars = Math.max(r.stars ?? 0, starsFor(r));
		},
		storage,
		now
	);
}

/** How long the machine stood still: from opening the ticket to solving it. */
export function downtime(r: TicketRecord, costPerHour: number) {
	const minutes = Math.max(1, Math.round(((r.solvedAt ?? r.openedAt) - r.openedAt) / 60_000));
	return { minutes, cost: Math.round((minutes / 60) * costPerHour) };
}

/** A ticket is open once the previous one is solved. */
export function isUnlocked(id: string, progress: StoryProgress): boolean {
	const i = TICKETS.findIndex((t) => t.id === id);
	if (i <= 0) return i === 0;
	return progress[TICKETS[i - 1].id]?.solvedAt !== undefined;
}

export const totalStars = (progress: StoryProgress) =>
	Object.values(progress).reduce((n, r) => n + (r.stars ?? 0), 0);

export const CAREER = [
	{ stars: 0, title: 'Praktykant' },
	{ stars: 10, title: 'Młodszy automatyk' },
	{ stars: 25, title: 'Automatyk' },
	{ stars: 40, title: 'Starszy automatyk' }
] as const;

/** Current career level and the next one (null at the top). */
export function career(stars: number) {
	let level = 0;
	CAREER.forEach((c, i) => {
		if (stars >= c.stars) level = i;
	});
	return { current: CAREER[level], next: CAREER[level + 1] ?? null };
}
