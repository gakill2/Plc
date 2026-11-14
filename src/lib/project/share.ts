import { parseProject, type Project } from './project.js';

/*
 * Share links carry the whole project in the URL fragment (never sent to a server):
 * JSON → deflate (CompressionStream) → base64url.
 */

function toBase64Url(bytes: Uint8Array): string {
	let binary = '';
	for (let i = 0; i < bytes.length; i += 0x8000) {
		binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
	}
	return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array {
	const b64 = text.replace(/-/g, '+').replace(/_/g, '/');
	const binary = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
	return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

async function pipe(
	bytes: Uint8Array,
	transform: CompressionStream | DecompressionStream
): Promise<Uint8Array> {
	const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(transform);
	return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function encodeProject(project: Project): Promise<string> {
	const { updatedAt: _ignored, ...rest } = project;
	void _ignored;
	const json = new TextEncoder().encode(JSON.stringify(rest));
	return toBase64Url(await pipe(json, new CompressionStream('deflate-raw')));
}

/** Returns null for anything that is not a valid shared project. */
export async function decodeProject(text: string): Promise<Project | null> {
	try {
		const json = await pipe(fromBase64Url(text.trim()), new DecompressionStream('deflate-raw'));
		return parseProject(JSON.parse(new TextDecoder().decode(json)));
	} catch {
		return null;
	}
}
