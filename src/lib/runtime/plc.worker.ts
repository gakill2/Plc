/// <reference lib="webworker" />
import { RuntimeCore } from './core.js';
import type { RuntimeCommand, RuntimeEvent } from './protocol.js';

const FRAME_MS = 16;
const core = new RuntimeCore();
let last = performance.now();

function post(event: RuntimeEvent) {
	self.postMessage(event);
}

function publish() {
	post({ type: 'snapshot', snapshot: core.snapshot() });
}

self.onmessage = (e: MessageEvent<RuntimeCommand>) => {
	const event = core.handle(e.data);
	if (event) post(event);
	publish();
};

setInterval(() => {
	const now = performance.now();
	const scans = core.tick(now - last);
	last = now;
	if (scans > 0 || core.status === 'FAULT') publish();
}, FRAME_MS);

publish();
