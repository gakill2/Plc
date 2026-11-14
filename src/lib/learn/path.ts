import { LESSONS } from '#lib/lessons/lessons.js';
import { CHAPTERS, quizCount } from '#lib/tutorial/chapters.js';
import { chapterDone } from '#lib/tutorial/progress.js';

/*
 * One learning path through the whole app: each tutorial chapter (theory + simulator + quiz) is
 * followed by the hands-on lessons it introduces, in the order the chapters link to them.
 * Lessons no chapter mentions are added at the end.
 */

export type PathStep =
	| { kind: 'chapter'; slug: string; title: string; summary: string; minutes: number }
	| { kind: 'lesson'; slug: string; title: string; summary: string; debug: boolean };

export interface PathStage {
	title: string;
	steps: PathStep[];
}

/** Stage titles: which chapters start a new stage. */
const STAGES: [firstChapter: string, title: string][] = [
	['czym-jest-plc', 'Etap 1 · Jak działa sterownik'],
	['styki-i-cewki', 'Etap 2 · Logika bitowa'],
	['timery', 'Etap 3 · Czas i liczenie'],
	['structured-text', 'Etap 4 · Tekst strukturalny i dobre praktyki'],
	['sekwencje', 'Etap 5 · Sekwencje i procesy'],
	['panel-hmi', 'Etap 6 · Praca na obiekcie: HMI, uruchomienie, napędy']
];

export function learningPath(): PathStage[] {
	const stages: PathStage[] = [];
	const used = new Set<string>();
	for (const chapter of CHAPTERS) {
		const stage = STAGES.find(([first]) => first === chapter.slug);
		if (stage || stages.length === 0) stages.push({ title: stage?.[1] ?? 'Start', steps: [] });
		const steps = stages[stages.length - 1].steps;
		steps.push({
			kind: 'chapter',
			slug: chapter.slug,
			title: chapter.title,
			summary: chapter.summary,
			minutes: chapter.minutes
		});
		for (const block of chapter.blocks) {
			if (block.kind !== 'lesson' || used.has(block.slug)) continue;
			const lesson = LESSONS.find((l) => l.slug === block.slug);
			if (!lesson) continue;
			used.add(lesson.slug);
			steps.push({
				kind: 'lesson',
				slug: lesson.slug,
				title: lesson.title,
				summary: lesson.summary,
				debug: lesson.kind === 'debug'
			});
		}
	}
	const rest = LESSONS.filter((l) => !used.has(l.slug));
	if (rest.length)
		stages[stages.length - 1].steps.push(
			...rest.map((l) => ({
				kind: 'lesson' as const,
				slug: l.slug,
				title: l.title,
				summary: l.summary,
				debug: l.kind === 'debug'
			}))
		);
	return stages;
}

export interface Progress {
	solvedQuizzes: ReadonlySet<string>;
	lessonsDone: ReadonlySet<string>;
}

export function isDone(step: PathStep, p: Progress): boolean {
	if (step.kind === 'lesson') return p.lessonsDone.has(step.slug);
	const chapter = CHAPTERS.find((c) => c.slug === step.slug);
	return chapter ? chapterDone(chapter.slug, quizCount(chapter), p.solvedQuizzes) : false;
}

/** The first step not done yet (null when everything is done). */
export function nextStep(stages: PathStage[], p: Progress): PathStep | null {
	for (const stage of stages) for (const step of stage.steps) if (!isDone(step, p)) return step;
	return null;
}
