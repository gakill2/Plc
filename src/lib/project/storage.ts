import { emptyCircuit } from '#lib/circuit/model.js';
import { emptyProgram } from '#lib/ladder/defaults.js';
import { parseProject, projectKey, type Project } from './project.js';

export const PROJECT_PREFIX = 'plcsim:project:';

type ProjectStorage = Pick<Storage, 'length' | 'key' | 'getItem' | 'setItem' | 'removeItem'>;

export interface ProjectSummary {
	id: string;
	name: string;
	updatedAt: number;
	lesson?: string;
	scenario?: string;
	language: 'ladder' | 'st' | 'sfc';
	networks: number;
	devices: number;
}

/** All projects saved in this browser, most recently changed first. */
export function listProjects(storage: ProjectStorage): ProjectSummary[] {
	const list: ProjectSummary[] = [];
	for (let i = 0; i < storage.length; i++) {
		const key = storage.key(i);
		if (!key?.startsWith(PROJECT_PREFIX)) continue;
		let project: Project | null = null;
		try {
			project = parseProject(JSON.parse(storage.getItem(key) ?? 'null'));
		} catch {
			// unreadable save — skip it
		}
		if (!project) continue;
		list.push({
			id: key.slice(PROJECT_PREFIX.length),
			name: project.name?.trim() || 'Untitled',
			updatedAt: project.updatedAt ?? 0,
			lesson: project.lesson,
			scenario: project.scenario,
			language: project.language ?? 'ladder',
			networks: project.ladder.rungs.length,
			devices: project.circuit.devices.length
		});
	}
	return list.sort((a, b) => b.updatedAt - a.updatedAt);
}

export function saveProject(
	storage: ProjectStorage,
	id: string,
	project: Project,
	now = Date.now()
): void {
	storage.setItem(projectKey(id), JSON.stringify({ ...project, updatedAt: now }));
}

export function readProject(storage: ProjectStorage, id: string): Project | null {
	try {
		return parseProject(JSON.parse(storage.getItem(projectKey(id)) ?? 'null'));
	} catch {
		return null;
	}
}

export function deleteProject(storage: ProjectStorage, id: string): void {
	storage.removeItem(projectKey(id));
}

export function newProjectId(): string {
	return `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

export const emptyProject = (name = 'Untitled'): Project => ({
	version: 2,
	name,
	ladder: emptyProgram(),
	circuit: emptyCircuit(),
	symbols: [],
	watch: [],
	language: 'ladder',
	st: ''
});
