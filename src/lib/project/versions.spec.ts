import { describe, expect, it } from 'vitest';
import { getLesson } from '#lib/lessons/lessons.js';
import { demoProject, parseProject } from './project.js';
import { compareProjects, diffLines, makeVersion } from './versions.js';

describe('versions', () => {
	it('diffs lines by the longest common subsequence', () => {
		expect(diffLines(['a', 'b', 'c'], ['a', 'x', 'c'])).toEqual([
			{ kind: 'same', text: 'a' },
			{ kind: 'removed', text: 'b' },
			{ kind: 'added', text: 'x' },
			{ kind: 'same', text: 'c' }
		]);
		expect(diffLines([], ['a']).map((l) => l.kind)).toEqual(['added']);
	});

	it('snapshots a project without its own history and survives a save', () => {
		const p = demoProject();
		const v = makeVersion({ ...p, history: [makeVersion(p, 'v0', 'x', 1)] }, 'v1', 'first', 2);
		expect(v.snapshot.history).toBeUndefined();
		const back = parseProject(JSON.parse(JSON.stringify({ ...p, history: [v] })))!;
		expect(back.history?.[0].name).toBe('v1');
	});

	it('compares section by section — a ladder program as ST, symbols, wiring', () => {
		const a = demoProject();
		const b = demoProject();
		b.symbols = [...b.symbols, { id: 'n', name: 'Extra', address: 'M5.0', comment: '' }];
		b.ladder.rungs = b.ladder.rungs.slice(1);
		const d = compareProjects(a, b);
		expect(d.find((s) => s.title === 'Tablica symboli')!.changed).toBe(1);
		expect(d.find((s) => s.title.startsWith('Program'))!.changed).toBeGreaterThan(0);
		expect(d.find((s) => s.title === 'Okablowanie')!.changed).toBe(0);
	});

	it('shows exactly the undocumented change of the change-management lesson', () => {
		const project = getLesson('change-management')!.starter();
		const v11 = project.history!.find((v) => v.name === 'v1.1')!;
		const program = compareProjects(v11.snapshot, project).find((s) =>
			s.title.startsWith('Program')
		)!;
		expect(program.lines.filter((l) => l.kind === 'removed').map((l) => l.text.trim())).toEqual([
			'moveTime(IN := step >= 10 AND step <= 40 AND step = lastStep, PT := T#2s);',
			'IF step >= 10 AND step <= 40 AND (moveTime.Q OR NOT AirOk) THEN'
		]);
		expect(program.changed).toBe(4);
	});
});
