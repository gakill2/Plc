import { expect, it } from 'vitest';
import { compileLadder } from '#lib/ladder/compiler.js';
import { LESSONS } from '#lib/lessons/lessons.js';
import { demoProject } from '#lib/project/project.js';
import { ProjectState } from '#lib/project/state.svelte.js';
import { analyze, crossReference } from './analysis.js';

it('the demo project has no warnings', () => {
	const state = new ProjectState(demoProject());
	expect(state.warnings).toEqual([]);
	expect(state.xref.length).toBeGreaterThan(0);
});

it.each(LESSONS.map((l) => [l.slug, l] as const))(
	'lesson %s: the solution has no program warnings',
	(_, l) => {
		const c = compileLadder(l.solution());
		const xref = crossReference(c.program, c.sourceMap);
		expect(analyze({ xref, language: 'ladder', names: new Map(), wired: [] })).toEqual([]);
	}
);
