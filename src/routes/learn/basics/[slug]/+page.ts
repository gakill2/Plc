import { error } from '@sveltejs/kit';
import { CHAPTERS, getChapter } from '#lib/tutorial/chapters.js';
import type { EntryGenerator, PageLoad } from './$types';

export const entries: EntryGenerator = () => CHAPTERS.map((c) => ({ slug: c.slug }));

export const load: PageLoad = ({ params }) => {
	const chapter = getChapter(params.slug);
	if (!chapter) error(404, 'Nie ma takiego rozdziału');
	const index = CHAPTERS.indexOf(chapter);
	return {
		slug: chapter.slug,
		index,
		prev: CHAPTERS[index - 1]?.slug ?? null,
		next: CHAPTERS[index + 1]?.slug ?? null
	};
};
