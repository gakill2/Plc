import { describe, expect, it } from 'vitest';
import { History } from './history.js';
import { demoProject, projectKey } from './project.js';
import { decodeProject, encodeProject } from './share.js';
import {
	deleteProject,
	emptyProject,
	listProjects,
	newProjectId,
	readProject,
	saveProject
} from './storage.js';

/** In-memory Storage. */
function memoryStorage() {
	const map = new Map<string, string>();
	return {
		get length() {
			return map.size;
		},
		key: (i: number) => [...map.keys()][i] ?? null,
		getItem: (k: string) => map.get(k) ?? null,
		setItem: (k: string, v: string) => void map.set(k, v),
		removeItem: (k: string) => void map.delete(k),
		map
	};
}

describe('History', () => {
	it('undoes and redoes, dropping the redo branch on a new change', () => {
		const h = new History<string>(10, 0);
		h.record('a', 0);
		h.record('b', 1);
		h.record('c', 2);
		expect(h.undo()).toBe('b');
		expect(h.undo()).toBe('a');
		expect(h.undo()).toBeNull();
		expect(h.redo()).toBe('b');
		h.record('x', 3);
		expect(h.canRedo).toBe(false);
		expect(h.undo()).toBe('b');
	});

	it('merges quick successive changes and ignores no-ops', () => {
		const h = new History<string>(10, 500);
		h.record('', 0);
		h.record('M', 1000);
		h.record('M0', 1100);
		h.record('M0.', 1200);
		expect(h.record('M0.', 1300)).toBe(false);
		expect(h.undo()).toBe('');
		expect(h.canUndo).toBe(false);
	});

	it('keeps at most `limit` steps', () => {
		const h = new History<number>(3, 0);
		for (let i = 0; i < 10; i++) h.record(i, i);
		let steps = 0;
		while (h.undo() !== null) steps++;
		expect(steps).toBe(3);
	});
});

describe('project storage', () => {
	it('lists, reads and deletes saved projects, newest first', () => {
		const s = memoryStorage();
		saveProject(s, 'a', { ...emptyProject('First') }, 1000);
		saveProject(s, 'b', { ...demoProject(), name: 'Demo' }, 2000);
		s.setItem(projectKey('broken'), '{not json');
		s.setItem('other-app', '{}');

		const list = listProjects(s);
		expect(list.map((p) => [p.id, p.name, p.updatedAt])).toEqual([
			['b', 'Demo', 2000],
			['a', 'First', 1000]
		]);
		expect(list[0]).toMatchObject({ networks: 3, devices: 6, language: 'ladder' });
		expect(readProject(s, 'a')?.name).toBe('First');
		expect(readProject(s, 'missing')).toBeNull();

		deleteProject(s, 'a');
		expect(listProjects(s).map((p) => p.id)).toEqual(['b']);
	});

	it('creates distinct ids', () => {
		expect(newProjectId()).not.toBe(newProjectId());
	});
});

describe('share links', () => {
	it('round-trips a project through a compact URL-safe string', async () => {
		const project = { ...demoProject(), name: 'Shared', updatedAt: 123 };
		const text = await encodeProject(project);
		expect(text).toMatch(/^[A-Za-z0-9_-]+$/);
		expect(text.length).toBeLessThan(JSON.stringify(project).length / 2);
		const back = await decodeProject(text);
		expect(back).toMatchObject({
			name: 'Shared',
			ladder: project.ladder,
			circuit: project.circuit
		});
		expect(back?.updatedAt).toBeUndefined();
	});

	it('rejects garbage', async () => {
		expect(await decodeProject('not-a-project')).toBeNull();
		expect(await decodeProject('')).toBeNull();
	});
});
