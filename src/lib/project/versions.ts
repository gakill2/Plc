/*
 * Versions of a project, like the archives a maintenance team keeps (and what TIA Portal's
 * version control interface or a versiondog server does): a named snapshot with a comment, and
 * a comparison of two states section by section — program, library, symbols, wiring, alarms,
 * hardware, safety program — as a line diff.
 */
import { ladderToSt } from '#lib/export/export.js';
import { boxTypes, fbdToSt } from '#lib/fbd/fbd.js';
import { priorityOf } from '#lib/hmi/model.js';
import { signature } from '#lib/safety/safety.js';
import { sfcToSt } from '#lib/sfc/sfc.js';
import { blockCatalog } from '#lib/st/stdlib.js';
import type { Project } from './project.js';

export interface ProjectVersion {
	id: string;
	/** e.g. "v1.2" */
	name: string;
	/** what changed and why (change order number) */
	comment: string;
	/** ms since 1970 */
	at: number;
	snapshot: Project;
}

/** At most this many versions are kept in a project (the oldest go first). */
export const MAX_VERSIONS = 20;

export function makeVersion(
	project: Project,
	name: string,
	comment: string,
	at = Date.now()
): ProjectVersion {
	const snapshot: Project = JSON.parse(JSON.stringify({ ...project, history: undefined }));
	delete snapshot.history;
	return { id: `v${at.toString(36)}`, name: name.trim(), comment: comment.trim(), at, snapshot };
}

export function isVersion(v: unknown): v is ProjectVersion {
	const o = v as ProjectVersion;
	return (
		typeof o === 'object' &&
		o !== null &&
		typeof o.name === 'string' &&
		typeof o.at === 'number' &&
		typeof o.snapshot === 'object'
	);
}

export interface Section {
	title: string;
	lines: string[];
}

const programText = (p: Project): string => {
	const symbols = new Map(p.symbols.map((s) => [s.name.toUpperCase(), s.address] as const));
	switch (p.language) {
		case 'st':
			return p.st ?? '';
		case 'stl':
			return p.stl ?? '';
		case 'sfc':
			return p.sfc ? sfcToSt(p.sfc).source : '';
		case 'fbd':
			return p.fbd ? fbdToSt(p.fbd, boxTypes(blockCatalog(p.library ?? ''))).source : '';
		default:
			return ladderToSt(p.ladder, symbols);
	}
};

const split = (text: string) => (text.trim() ? text.replace(/\s+$/, '').split('\n') : []);

/** A project as text, section by section: what a comparison looks at. */
export function sections(p: Project): Section[] {
	const lang = { ladder: 'LAD', st: 'ST', stl: 'STL', sfc: 'SFC', fbd: 'FBD' }[
		p.language ?? 'ladder'
	];
	const out: Section[] = [
		{
			title: `Program (${lang}${lang === 'LAD' || lang === 'SFC' || lang === 'FBD' ? ' jako ST' : ''})`,
			lines: split(programText(p))
		},
		{ title: 'Biblioteka', lines: split(p.library ?? '') },
		{
			title: 'Tablica symboli',
			lines: [...p.symbols]
				.sort((a, b) => a.name.localeCompare(b.name))
				.map((s) => `${s.name}  ${s.address}${s.comment ? `  // ${s.comment}` : ''}`)
		},
		{
			title: 'Okablowanie',
			lines: p.circuit.wires
				.map((w) => {
					const d = p.circuit.devices.find((x) => x.id === w.device);
					return `${d?.label ?? '?'}${w.port ? `.${w.port}` : ''} → ${w.terminal}${d?.nc ? ' (NC)' : ''}`;
				})
				.sort()
		},
		{
			title: 'Alarmy HMI',
			lines: (p.hmi?.alarms ?? []).map(
				(a) =>
					`${a.tag}: ${a.text} · P${priorityOf(a)}${a.onDelayMs ? ` · opóźnienie ${a.onDelayMs / 1000} s` : ''}${a.suppressTag ? ` · tłumienie ${a.suppressTag}` : ''}${a.action ? ` · reakcja: ${a.action}` : ''}`
			)
		}
	];
	if (p.hw)
		out.push({
			title: 'Sprzęt',
			lines: p.hw.modules.map(
				(m) =>
					`slot ${m.slot} ${m.kind} od ${m.start}${m.ai ? ` · ${m.ai.map((c, i) => `k${i} ${c.mode}${c.diag ? '+diag' : ''}`).join(', ')}` : ''}`
			)
		});
	if (p.safety)
		out.push({
			title: `Program bezpieczeństwa (podpis F ${signature(p.safety)})`,
			lines: split(p.safety.program)
		});
	return out;
}

export type DiffLine = { kind: 'same' | 'added' | 'removed'; text: string };

/** Line diff by the longest common subsequence: removed lines of `a`, added lines of `b`. */
export function diffLines(a: string[], b: string[]): DiffLine[] {
	const n = a.length;
	const m = b.length;
	const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
	for (let i = n - 1; i >= 0; i--)
		for (let j = m - 1; j >= 0; j--)
			lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
	const out: DiffLine[] = [];
	let i = 0;
	let j = 0;
	while (i < n && j < m) {
		if (a[i] === b[j]) {
			out.push({ kind: 'same', text: a[i] });
			i++;
			j++;
		} else if (lcs[i + 1][j] >= lcs[i][j + 1]) out.push({ kind: 'removed', text: a[i++] });
		else out.push({ kind: 'added', text: b[j++] });
	}
	while (i < n) out.push({ kind: 'removed', text: a[i++] });
	while (j < m) out.push({ kind: 'added', text: b[j++] });
	return out;
}

export interface SectionDiff {
	title: string;
	lines: DiffLine[];
	changed: number;
}

/** Old → new, every section; unchanged sections have `changed = 0`. */
export function compareProjects(older: Project, newer: Project): SectionDiff[] {
	const a = sections(older);
	const b = sections(newer);
	const titles = [...new Set([...a, ...b].map((s) => s.title.replace(/ \(podpis F .*\)$/, ' F')))];
	return titles.map((title) => {
		const find = (list: Section[]) =>
			list.find((s) => s.title.replace(/ \(podpis F .*\)$/, ' F') === title)?.lines ?? [];
		const lines = diffLines(find(a), find(b));
		return { title, lines, changed: lines.filter((l) => l.kind !== 'same').length };
	});
}
