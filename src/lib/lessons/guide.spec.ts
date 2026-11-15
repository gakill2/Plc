import { describe, expect, it } from 'vitest';
import { checkSymbols } from '#lib/symbols/symbols.js';
import { deviceSymbols } from '#lib/circuit/model.js';
import { addressResolver, GUIDES, type GuideContext } from './guide.js';
import { LESSONS } from './lessons.js';

function context(
	slug: string,
	ladder: GuideContext['ladder'],
	which: 'solution' | 'starter' = 'solution'
): GuideContext {
	const lesson = LESSONS.find((l) => l.slug === slug)!;
	const project = lesson.starter();
	const { map } = checkSymbols([...deviceSymbols(project.circuit), ...project.symbols]);
	const circuit =
		which === 'solution' ? (lesson.solutionCircuit?.() ?? project.circuit) : project.circuit;
	const hmi = which === 'solution' ? (lesson.solutionHmi?.() ?? project.hmi) : project.hmi;
	const st = which === 'solution' ? (lesson.solutionSt ?? project.st) : project.st;
	const sfc = which === 'solution' ? (lesson.solutionSfc?.() ?? project.sfc) : project.sfc;
	const fbd = which === 'solution' ? (lesson.solutionFbd?.() ?? project.fbd) : project.fbd;
	const stl = which === 'solution' ? (lesson.solutionStl ?? project.stl) : project.stl;
	const hw = which === 'solution' ? (lesson.solutionHw?.() ?? project.hw) : project.hw;
	const safety =
		which === 'solution'
			? (lesson.solutionSafety ?? project.safety?.program)
			: project.safety?.program;
	return {
		ladder,
		circuit,
		hmi,
		st,
		sfc,
		fbd,
		stl,
		hw,
		safety,
		addr: addressResolver(map),
		online: false,
		passed: false
	};
}

describe('lesson guides', () => {
	it('every lesson has a guide', () => {
		expect(LESSONS.map((l) => l.slug).filter((s) => !GUIDES[s])).toEqual([]);
	});

	it.each(LESSONS.map((l) => [l.slug, l] as const))(
		'%s: the reference solution ticks every building step',
		(slug, lesson) => {
			const steps = GUIDES[slug];
			const c = context(slug, lesson.solution());
			const building = steps.filter((s) => !s.manual);
			const manual = steps.filter((s) => s.manual);
			expect(building.length).toBeGreaterThan(0);
			for (const s of building) expect(s.done(c), s.text).toBe(true);
			// "run it" / "check it" steps are ticked by doing it, not by the program
			for (const s of manual) {
				expect(s.done(c)).toBe(false);
				expect(s.done({ ...c, online: true, passed: true })).toBe(true);
			}
			expect(steps.at(-1)!.done({ ...c, passed: true })).toBe(true);
			// neither an empty program nor the starter ticks the building steps
			const empty = {
				...context(slug, { version: 1, rungs: [] }, 'starter'),
				circuit: undefined,
				hmi: undefined,
				st: undefined,
				sfc: undefined,
				fbd: undefined
			};
			expect(steps.some((s) => s.done(empty))).toBe(false);
			const start = context(slug, lesson.starter().ladder, 'starter');
			expect(building.every((s) => s.done(start))).toBe(false);
		}
	);

	it('checks the structure, not just the parts', () => {
		const lesson = LESSONS.find((l) => l.slug === 'self-holding')!;
		const wrong = lesson.solution();
		// Stop as a NO contact: the holding branch is there, the Stop step is not done
		const r = wrong.rungs[0];
		const stop = r.logic.items[1];
		if (stop.kind === 'contact') stop.type = 'NO';
		const ticks = GUIDES['self-holding'].map((s) => s.done(context('self-holding', wrong)));
		expect(ticks).toEqual([true, true, false, false, false]);
	});

	it('resolves symbols and addresses alike, invalid ones to null', () => {
		const addr = addressResolver(new Map([['START', 'I0.0']]));
		expect(addr('start')).toBe('I0.0');
		expect(addr('i0.0')).toBe('I0.0');
		expect(addr('nonsense')).toBeNull();
	});
});
