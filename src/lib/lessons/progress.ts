const KEY = 'plcsim:lessons-done';

/** Slugs of completed lessons, kept in localStorage. */
export function completedLessons(storage: Pick<Storage, 'getItem'> = localStorage): Set<string> {
	try {
		const list = JSON.parse(storage.getItem(KEY) ?? '[]');
		return new Set(Array.isArray(list) ? list.filter((s) => typeof s === 'string') : []);
	} catch {
		return new Set();
	}
}

export function markCompleted(
	slug: string,
	storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage
): void {
	const done = completedLessons(storage);
	done.add(slug);
	storage.setItem(KEY, JSON.stringify([...done]));
}
