import type { PageLoad } from './$types';

// Reads the project from localStorage, like the editor.
export const prerender = false;
export const ssr = false;

export const load: PageLoad = ({ params }) => ({ projectId: params.id });
