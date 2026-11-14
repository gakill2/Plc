const KEY = 'plcsim:tutorial-quizzes';

type Store = Pick<Storage, 'getItem' | 'setItem'>;

/** Ids of quizzes answered correctly, e.g. "timers:0". */
export function solvedQuizzes(storage: Store = localStorage): Set<string> {
	try {
		const list = JSON.parse(storage.getItem(KEY) ?? '[]');
		return new Set(Array.isArray(list) ? list.filter((x) => typeof x === 'string') : []);
	} catch {
		return new Set();
	}
}

export function markQuizSolved(id: string, storage: Store = localStorage): void {
	const solved = solvedQuizzes(storage);
	solved.add(id);
	storage.setItem(KEY, JSON.stringify([...solved]));
}

/** A chapter is done when all its quizzes have been answered correctly. */
export function chapterDone(slug: string, quizCount: number, solved: ReadonlySet<string>): boolean {
	if (quizCount === 0) return false;
	for (let i = 0; i < quizCount; i++) if (!solved.has(`${slug}:${i}`)) return false;
	return true;
}
