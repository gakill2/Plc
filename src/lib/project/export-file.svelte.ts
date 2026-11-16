import { exportPlcOpen, exportScl, programSource, type ExportInput } from '#lib/export/export.js';
import { xlsx } from '#lib/export/xlsx.js';
import type { ProjectState } from './state.svelte.js';

/** A file to download; binary files carry `bytes`. */
export type ExportedFile = {
	name: string;
	text: string;
	bytes?: Uint8Array<ArrayBuffer>;
	type: string;
};

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
		stl: project.stl,
		library: project.library,
		symbols: [...project.deviceSymbols, ...project.userSymbols].map((s) => ({
			name: s.name,
			address: s.address,
			comment: s.comment
		}))
	};
}

/** The files of an export: name, content and MIME type. */
export function exportFiles(project: ProjectState, format: ExportFormat): ExportedFile[] {
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
		const { scl, tags, tagRows } = exportScl(input);
		return [
			{ name: `${base}.scl`, text: scl, type: 'text/plain' },
			{ name: `${base}_tags.csv`, text: tags, type: 'text/csv' },
			// the tag table in the format TIA Portal imports (PLC tags → Import)
			{
				name: `${base}_PLCTags.xlsx`,
				text: '',
				bytes: xlsx('PLC Tags', tagRows),
				type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
			}
		];
	}
	if (format === 'xml')
		return [{ name: `${base}.xml`, text: exportPlcOpen(input).xml, type: 'application/xml' }];
	return [
		{ name: `${base}.st`, text: programSource(input), type: 'text/plain' },
		// the original Statement List too: that is what goes back into STEP 7
		...(input.language === 'stl'
			? [{ name: `${base}.awl`, text: input.stl ?? '', type: 'text/plain' }]
			: [])
	];
}

/** Downloads the files in the browser. */
export function download(files: ExportedFile[]) {
	for (const f of files) {
		const a = document.createElement('a');
		a.href = URL.createObjectURL(new Blob([f.bytes ?? f.text], { type: f.type }));
		a.download = f.name;
		a.click();
		URL.revokeObjectURL(a.href);
	}
}
