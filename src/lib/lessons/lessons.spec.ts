import { describe, expect, it } from 'vitest';
import { deviceSymbols } from '#lib/circuit/model.js';
import { compileLadder } from '#lib/ladder/compiler.js';
import { compileSt } from '#lib/st/compiler.js';
import { sfcToSt } from '#lib/sfc/sfc.js';
import type { LadderProgram } from '#lib/ladder/model.js';
import { checkSymbols } from '#lib/symbols/symbols.js';
import { LESSONS } from './lessons.js';
import { runLessonTests } from './runner.js';
import { boxTypes, fbdToSt } from '#lib/fbd/fbd.js';
import { blockCatalog } from '#lib/st/stdlib.js';
import { stlToSt } from '#lib/stl/stl.js';

const FBD_TYPES = boxTypes(blockCatalog(''));

/** Compiles a ladder with the symbols of the lesson's starter project, like the editor does. */
function compile(lesson: (typeof LESSONS)[number], ladder: LadderProgram) {
	const project = lesson.starter();
	const { map, issues } = checkSymbols([...deviceSymbols(project.circuit), ...project.symbols]);
	expect(issues).toEqual([]);
	return compileLadder(ladder, { symbols: map });
}

/** Structured Text lessons: compiles the source with the starter's symbols. */
function compileStLesson(lesson: (typeof LESSONS)[number], src: string, safetyProgram?: string) {
	const project = lesson.starter();
	const { map, issues } = checkSymbols([...deviceSymbols(project.circuit), ...project.symbols]);
	expect(issues).toEqual([]);
	const safety = project.safety
		? { ...project.safety, program: safetyProgram ?? project.safety.program }
		: undefined;
	const r = compileSt(src, { symbols: map, ...(safety ? { safety } : {}) });
	return { program: r.program, diagnostics: r.diagnostics, load: r.load };
}

/** Statement List lessons: translated to ST first, every line must translate. */
function compileStlLesson(lesson: (typeof LESSONS)[number], src: string) {
	const gen = stlToSt(src);
	expect(gen.issues).toEqual([]);
	return compileStLesson(lesson, gen.source);
}

describe.each(LESSONS.map((l) => [l.slug, l] as const))('lesson %s', (_slug, lesson) => {
	it('the reference solution passes every test', () => {
		const { program, diagnostics, load } = lesson.solutionSfc
			? compileStLesson(lesson, sfcToSt(lesson.solutionSfc()).source)
			: lesson.solutionFbd
				? compileStLesson(lesson, fbdToSt(lesson.solutionFbd(), FBD_TYPES).source)
				: lesson.solutionStl
					? compileStlLesson(lesson, lesson.solutionStl)
					: lesson.solutionSt
						? compileStLesson(lesson, lesson.solutionSt, lesson.solutionSafety)
						: compile(lesson, lesson.solution());
		expect(diagnostics).toEqual([]);
		const circuit = lesson.solutionCircuit?.() ?? lesson.starter().circuit;
		const hw = lesson.solutionHw?.() ?? lesson.starter().hw;
		const results = runLessonTests(lesson, program, circuit, [], load, hw);
		expect(results.filter((r) => !r.passed)).toEqual([]);
	});

	it('the starter project does not pass', () => {
		const start = lesson.starter();
		const { program, load } =
			start.language === 'sfc' && start.sfc
				? compileStLesson(lesson, sfcToSt(start.sfc).source)
				: start.language === 'fbd' && start.fbd
					? compileStLesson(lesson, fbdToSt(start.fbd, FBD_TYPES).source)
					: start.language === 'stl'
						? compileStlLesson(lesson, start.stl ?? '')
						: start.language === 'st'
							? compileStLesson(lesson, start.st ?? '')
							: compile(lesson, start.ladder);
		expect(
			runLessonTests(lesson, program, lesson.starter().circuit, [], load, start.hw).some(
				(r) => !r.passed
			)
		).toBe(true);
	});
});

describe('runner', () => {
	it('explains what went wrong', () => {
		const lesson = LESSONS.find((l) => l.slug === 'self-holding')!;
		// no holding contact: motor runs only while Start is held
		const ladder: LadderProgram = {
			version: 1,
			rungs: [lesson.solution().rungs[0]]
		};
		const wrong = structuredClone(ladder);
		const p = wrong.rungs[0].logic.items[0];
		if (p.kind === 'parallel') p.branches.pop();
		const results = runLessonTests(lesson, compile(lesson, wrong).program);
		expect(results[0]).toMatchObject({
			passed: false,
			message: 'Po kroku „puść Start”: Q0.0 powinno być 1, a jest 0'
		});
	});

	it('reports a program that does not load', () => {
		const lesson = LESSONS[0];
		const results = runLessonTests(lesson, [
			{ op: 'ST', addr: { area: 'I', size: 'X', byte: 0, bit: 0 } }
		]);
		expect(results[0].message).toMatch(/nie ładuje/);
	});
});
