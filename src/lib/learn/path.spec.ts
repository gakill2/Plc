import { describe, expect, it } from 'vitest';
import { LESSONS } from '#lib/lessons/lessons.js';
import { CHAPTERS, quizCount } from '#lib/tutorial/chapters.js';
import { isDone, learningPath, nextStep } from './path.js';

describe('learning path', () => {
	const stages = learningPath();
	const steps = stages.flatMap((s) => s.steps);

	it('contains every chapter and every lesson exactly once, in stages', () => {
		expect(steps.filter((s) => s.kind === 'chapter').map((s) => s.slug)).toEqual(
			CHAPTERS.map((c) => c.slug)
		);
		const lessons = steps.filter((s) => s.kind === 'lesson').map((s) => s.slug);
		expect([...lessons].sort()).toEqual(LESSONS.map((l) => l.slug).sort());
		expect(new Set(lessons).size).toBe(lessons.length);
		expect(stages.map((s) => s.title)).toHaveLength(6);
	});

	it('puts each lesson right after the chapter that introduces it', () => {
		const i = steps.findIndex((s) => s.slug === 'styki-i-cewki');
		expect(steps[i + 1]).toMatchObject({ kind: 'lesson', slug: 'first-rung' });
		const j = steps.findIndex((s) => s.slug === 'sekwencje');
		expect(steps[j + 1]).toMatchObject({ kind: 'lesson', slug: 'drilling-station' });
	});

	it('finds the next step from the progress', () => {
		const empty = { solvedQuizzes: new Set<string>(), lessonsDone: new Set<string>() };
		expect(nextStep(stages, empty)).toBe(steps[0]);

		const first = CHAPTERS[0];
		const solved = new Set(
			Array.from({ length: quizCount(first) }, (_, i) => `${first.slug}:${i}`)
		);
		const p = { solvedQuizzes: solved, lessonsDone: new Set<string>() };
		expect(isDone(steps[0], p)).toBe(true);
		expect(nextStep(stages, p)).toBe(steps[1]);

		const all = {
			solvedQuizzes: new Set(
				CHAPTERS.flatMap((c) => Array.from({ length: quizCount(c) }, (_, i) => `${c.slug}:${i}`))
			),
			lessonsDone: new Set(LESSONS.map((l) => l.slug))
		};
		expect(nextStep(stages, all)).toBeNull();
	});
});
