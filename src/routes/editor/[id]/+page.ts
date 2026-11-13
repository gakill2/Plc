import type { PageLoad } from './$types';

// The editor runs fully client-side (Web Worker runtime, IndexedDB), so it is not prerendered.
export const prerender = false;
export const ssr = false;

export const load: PageLoad = ({ params }) => ({ projectId: params.id });
