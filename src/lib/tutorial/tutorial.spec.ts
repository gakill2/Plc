import { describe, expect, it } from 'vitest';
import { Plc } from '#lib/engine/index.js';
import { getLesson } from '#lib/lessons/lessons.js';
import { CHAPTERS, quizCount } from './chapters.js';
import { GLOSSARY } from './glossary.js';
import { chapterDone, markQuizSolved, solvedQuizzes } from './progress.js';
import { compileSim, inputSignal, truthTable } from './sim.js';
import type { SimBlock } from './types.js';

const sims = CHAPTERS.flatMap((c) =>
	c.blocks
		.filter((b): b is SimBlock => b.kind === 'sim')
		.map((b, i) => [`${c.slug} #${i + 1}`, b] as const)
);

describe('tutorial content', () => {
	it('has unique chapter slugs and at least one quiz per chapter', () => {
		expect(new Set(CHAPTERS.map((c) => c.slug)).size).toBe(CHAPTERS.length);
		for (const c of CHAPTERS) expect(quizCount(c), c.slug).toBeGreaterThan(0);
	});

	it('every quiz has a valid answer and every lesson link exists', () => {
		for (const c of CHAPTERS) {
			for (const b of c.blocks) {
				if (b.kind === 'quiz') expect(b.correct, b.question).toBeLessThan(b.options.length);
				if (b.kind === 'lesson') expect(getLesson(b.slug), b.slug).not.toBeNull();
			}
		}
	});

	it('glossary terms are unique and point to existing chapters', () => {
		expect(new Set(GLOSSARY.map((g) => g.pl)).size).toBe(GLOSSARY.length);
		const slugs = new Set(CHAPTERS.map((c) => c.slug));
		for (const g of GLOSSARY) if (g.chapter) expect(slugs.has(g.chapter), g.chapter).toBe(true);
	});

	it.each(sims)('simulator %s compiles and loads', (_name, block) => {
		const c = compileSim(block);
		expect(c.diagnostics).toEqual([]);
		const plc = new Plc();
		expect(() => plc.load(c.program)).not.toThrow();
	});
});

describe('tutorial simulators behave as the text says', () => {
	const sim = (slug: string, n = 0) =>
		CHAPTERS.find((c) => c.slug === slug)!.blocks.filter((b): b is SimBlock => b.kind === 'sim')[n];

	it('logic gates match their truth table', () => {
		const block = sim('logika');
		const rows = truthTable(block, compileSim(block).program);
		expect(rows.map((r) => r.outputs.map(Number).join(''))).toEqual([
			'0010',
			'0111',
			'0101',
			'1100'
		]);
	});

	it('fail-safe stop: a broken wire stops the motor', () => {
		const block = sim('bezpieczenstwo');
		const plc = new Plc();
		plc.load(compileSim(block).program);
		plc.run();
		const [start, stop] = block.inputs;
		const scan = (startPressed: boolean, broken: boolean) => {
			plc.setInput(start.address, inputSignal(start, startPressed, false));
			plc.setInput(stop.address, inputSignal(stop, false, broken));
			plc.scan(10);
			return plc.getOutput('Q0.0');
		};
		scan(true, false);
		expect(scan(false, false)).toBe(true);
		expect(scan(false, true)).toBe(false);
		expect(scan(true, true)).toBe(false); // cannot start with the fault
	});

	it('double coil: only the last rung counts', () => {
		const block = sim('bezpieczenstwo', 1);
		const plc = new Plc();
		plc.load(compileSim(block).program);
		plc.run();
		plc.setInput('I0.0', true);
		plc.scan(10);
		expect(plc.getOutput('Q0.0')).toBe(false);
	});
});

describe('tutorial progress', () => {
	it('a chapter is done when all its quizzes are solved', () => {
		const map = new Map<string, string>();
		const storage = {
			getItem: (k: string) => map.get(k) ?? null,
			setItem: (k: string, v: string) => void map.set(k, v)
		};
		markQuizSolved('timery:0', storage);
		expect(chapterDone('timery', 2, solvedQuizzes(storage))).toBe(false);
		markQuizSolved('timery:1', storage);
		expect(chapterDone('timery', 2, solvedQuizzes(storage))).toBe(true);
		expect(chapterDone('x', 0, new Set())).toBe(false);
	});
});
