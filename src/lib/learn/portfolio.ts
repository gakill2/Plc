import { programSource } from '#lib/export/export.js';
import { deviceSymbols } from '#lib/circuit/model.js';
import { emptySfc } from '#lib/sfc/sfc.js';
import { LESSONS } from '#lib/lessons/lessons.js';
import type { Lesson } from '#lib/lessons/types.js';
import type { Project } from '#lib/project/project.js';
import type { PathStage } from './path.js';

/*
 * The portfolio: what a student shows at a job interview — the lessons passed, what each one
 * proves (its acceptance tests) and the student's own program.
 */

export interface PortfolioEntry {
	slug: string;
	title: string;
	summary: string;
	kind: string;
	/** acceptance items the program passed */
	tests: string[];
	language: string;
	/** the student's program as text, null when it is not saved in this browser */
	code: string | null;
}

export interface Portfolio {
	name: string;
	role: string | null;
	date: string;
	chaptersDone: number;
	chaptersTotal: number;
	entries: PortfolioEntry[];
}

export const KIND_LABEL: Record<string, string> = {
	build: 'Program od zera',
	debug: 'Znajdź błąd',
	commissioning: 'Uruchomienie',
	capstone: 'Projekt końcowy (FAT)',
	brownfield: 'Modernizacja cudzego programu'
};

export const KIND_LABEL_EN: Record<string, string> = {
	build: 'Program from scratch',
	debug: 'Find the bug',
	commissioning: 'Commissioning',
	capstone: 'Final project (FAT)',
	brownfield: 'Modernising a legacy program'
};

const LANGUAGE: Record<string, string> = {
	ladder: 'LAD (drabinka)',
	st: 'ST (tekst strukturalny)',
	sfc: 'SFC / GRAFCET',
	fbd: 'FBD',
	stl: 'STL / AWL'
};

/** The student's program as readable text: STL as written, everything else as ST. */
export function programText(project: Project | null): string | null {
	if (!project) return null;
	const language = project.language ?? 'ladder';
	if (language === 'stl') return project.stl?.trim() || null;
	if (language === 'st') return project.st?.trim() || null;
	try {
		const text = programSource({
			name: project.name ?? '',
			language,
			ladder: project.ladder,
			st: project.st ?? '',
			sfc: project.sfc ?? emptySfc(),
			fbd: project.fbd,
			stl: project.stl,
			library: project.library ?? '',
			symbols: [...deviceSymbols(project.circuit), ...project.symbols].map((s) => ({
				name: s.name,
				address: s.address,
				comment: s.comment
			}))
		});
		return text.trim() || null;
	} catch {
		return null;
	}
}

export function portfolioEntries(
	stages: PathStage[],
	done: ReadonlySet<string>,
	project: (slug: string) => Project | null
): PortfolioEntry[] {
	const lessons = new Map<string, Lesson>(LESSONS.map((l) => [l.slug, l]));
	return stages
		.flatMap((s) => s.steps)
		.filter((s) => s.kind === 'lesson' && done.has(s.slug))
		.map((s) => {
			const lesson = lessons.get(s.slug)!;
			const p = project(s.slug);
			return {
				slug: s.slug,
				title: s.title,
				summary: s.summary,
				kind: lesson.kind ?? 'build',
				tests: lesson.tests.map((t) => t.name),
				language: LANGUAGE[p?.language ?? (lesson.solutionSt ? 'st' : 'ladder')] ?? '',
				code: programText(p)
			};
		});
}

/** The portfolio as Markdown — to put on GitHub next to the CV. */
export function portfolioMarkdown(p: Portfolio): string {
	const out = [
		`# Portfolio PLC${p.name ? ` — ${p.name}` : ''}`,
		'',
		`PLC Sim · ${p.date}${p.role ? ` · ścieżka: ${p.role}` : ''}`,
		'',
		`- zaliczone lekcje: **${p.entries.length}** (każda sprawdzona automatycznymi testami na symulowanym obiekcie)`,
		`- rozdziały teorii z quizem: **${p.chaptersDone} / ${p.chaptersTotal}**`,
		''
	];
	const kinds = Object.entries(
		p.entries.reduce<Record<string, number>>((m, e) => ((m[e.kind] = (m[e.kind] ?? 0) + 1), m), {})
	);
	if (kinds.length) {
		out.push('| Rodzaj zadania | Liczba |', '| --- | --- |');
		for (const [k, n] of kinds) out.push(`| ${KIND_LABEL[k] ?? k} | ${n} |`);
		out.push('');
	}
	for (const e of p.entries) {
		out.push(
			`## ${e.title}`,
			'',
			`*${KIND_LABEL[e.kind] ?? e.kind} · ${e.language}*`,
			'',
			e.summary.replace(/\*\*/g, ''),
			'',
			'Zaliczone pozycje odbioru:',
			'',
			...e.tests.map((t) => `- ✓ ${t}`),
			''
		);
		if (e.code) out.push('```', e.code, '```', '');
	}
	return out.join('\n');
}
