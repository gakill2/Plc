import { exportPlcOpen, exportScl, programSource, type ExportInput } from '#lib/export/export.js';
import type { ProjectState } from './state.svelte.js';

export type ExportFormat = 'json' | 'scl' | 'xml' | 'st';

/** What the exporters need from a project. */
export function exportInput(project: ProjectState): ExportInput {
	return {
		name: project.name,
		language: project.language,
		ladder: $state.snapshot(project.ladder.program),
		st: project.st,
		sfc: $state.snapshot(project.sfc),
		fbd: $state.snapshot(project.fbd),
		library: project.library,
		symbols: [...project.deviceSymbols, ...project.userSymbols].map((s) => ({
			name: s.name,
			address: s.address,
			comment: s.comment
		}))
	};
}

/** The files of an export: name, content and MIME type. */
export function exportFiles(
	project: ProjectState,
	format: ExportFormat
): { name: string; text: string; type: string }[] {
	const base = (project.name || 'project').replace(/[^\w-]+/g, '_');
	if (format === 'json')
		return [
			{
				name: `${base}.plcsim.json`,
				text: JSON.stringify(project.toJSON(), null, 2),
				type: 'application/json'
			}
		];
	const input = exportInput(project);
	if (format === 'scl') {
		const { scl, tags } = exportScl(input);
		return [
			{ name: `${base}.scl`, text: scl, type: 'text/plain' },
			{ name: `${base}_tags.csv`, text: tags, type: 'text/csv' }
		];
	}
	if (format === 'xml')
		return [{ name: `${base}.xml`, text: exportPlcOpen(input).xml, type: 'application/xml' }];
	return [{ name: `${base}.st`, text: programSource(input), type: 'text/plain' }];
}

/** Downloads the files in the browser. */
export function download(files: { name: string; text: string; type: string }[]) {
	for (const f of files) {
		const a = document.createElement('a');
		a.href = URL.createObjectURL(new Blob([f.text], { type: f.type }));
		a.download = f.name;
		a.click();
		URL.revokeObjectURL(a.href);
	}
}
