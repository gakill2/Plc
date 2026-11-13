import { describe, expect, it } from 'vitest';
import { demoProgram } from '#lib/ladder/defaults.js';
import { demoProject, loadProject, parseProject, projectKey } from './project.js';

const storage = (items: Record<string, unknown>) => ({
	getItem: (key: string) => (key in items ? JSON.stringify(items[key]) : null)
});

describe('project persistence', () => {
	it('accepts the current format', () => {
		const p = demoProject();
		expect(parseProject(JSON.parse(JSON.stringify(p)))).toEqual(p);
	});

	it('migrates a stage-2 ladder-only save', () => {
		const ladder = demoProgram();
		const p = parseProject(ladder);
		expect(p?.version).toBe(2);
		expect(p?.ladder).toEqual(ladder);
		expect(p?.circuit.devices.length).toBeGreaterThan(0);
	});

	it('rejects garbage', () => {
		expect(parseProject({ version: 2 })).toBeNull();
		expect(parseProject('nope')).toBeNull();
	});

	it('loads the saved project, the legacy save, or the demo', () => {
		const saved = demoProject();
		saved.symbols = [];
		expect(loadProject(storage({ [projectKey('x')]: saved }), 'x').symbols).toEqual([]);
		expect(loadProject(storage({ 'plcsim:ladder:y': demoProgram() }), 'y').version).toBe(2);
		expect(loadProject(storage({}), 'z').symbols.length).toBeGreaterThan(0);
	});
});
