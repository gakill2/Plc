/*
 * Offline support (PWA). Everything the app needs is cached at install: the JS/CSS bundles,
 * static files, the prerendered pages and one copy of the editor shell (the editor is a
 * client-side page, so the same HTML works for every /editor/<id> URL). Projects live in
 * localStorage anyway, so after the first visit the whole app works without a network.
 */
import { version } from '$app/env';
import { assets, immutable, prerendered } from '$app/manifest';
import { self as sw } from '$app/service-worker';

const CACHE = `plcsim-${version}`;
const EDITOR_SHELL = '/editor/demo';
const ASSETS = [
	...new Set([...immutable, ...assets, ...prerendered].map((f) => '/' + f.path.replace(/^\//, ''))),
	EDITOR_SHELL
];
const ASSET_SET = new Set(ASSETS);

sw.addEventListener('install', (event) => {
	event.waitUntil(
		caches
			.open(CACHE)
			.then((cache) => cache.addAll(ASSETS))
			.then(() => sw.skipWaiting())
	);
});

sw.addEventListener('activate', (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
			.then(() => sw.clients.claim())
	);
});

/** Cached HTML for a page: the page itself, the editor shell for any editor URL, or the home page. */
async function offlinePage(cache: Cache, url: URL): Promise<Response | undefined> {
	const path = url.pathname.replace(/\/$/, '') || '/';
	return (
		(await cache.match(path)) ??
		(path.startsWith('/editor/') ? await cache.match(EDITOR_SHELL) : undefined) ??
		(await cache.match('/'))
	);
}

sw.addEventListener('fetch', (event) => {
	const { request } = event;
	if (request.method !== 'GET') return;
	const url = new URL(request.url);
	if (url.origin !== sw.location.origin) return;

	event.respondWith(
		(async () => {
			const cache = await caches.open(CACHE);
			// Hashed bundles and static files never change for a version: cache first.
			if (ASSET_SET.has(url.pathname) && request.mode !== 'navigate') {
				const hit = await cache.match(url.pathname);
				if (hit) return hit;
			}
			try {
				const response = await fetch(request);
				if (response.ok && request.mode === 'navigate' && /^\/editor\/[^/]+$/.test(url.pathname)) {
					// keep the newest editor shell for offline use
					cache.put(EDITOR_SHELL, response.clone());
				}
				return response;
			} catch (error) {
				const fallback =
					request.mode === 'navigate'
						? await offlinePage(cache, url)
						: await cache.match(url.pathname);
				if (fallback) return fallback;
				throw error;
			}
		})()
	);
});
