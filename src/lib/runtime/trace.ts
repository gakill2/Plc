import type { TraceSample } from './protocol.js';

/**
 * UI-side history of traced signals. Samples are stored only when a value changes, so the
 * signal holds its value until the next sample (a step function).
 */
export class TraceBuffer {
	samples: TraceSample[] = [];
	epoch = -1;
	readonly maxSamples: number;

	constructor(maxSamples = 50_000) {
		this.maxSamples = maxSamples;
	}

	push(trace: { epoch: number; samples: TraceSample[] }): void {
		if (trace.epoch !== this.epoch) {
			this.epoch = trace.epoch;
			this.samples = [];
		}
		if (trace.samples.length === 0) return;
		this.samples.push(...trace.samples);
		if (this.samples.length > this.maxSamples) {
			this.samples.splice(0, this.samples.length - this.maxSamples);
		}
	}

	/** Index of the last sample at or before `t`, or -1. */
	indexAt(t: number): number {
		let lo = 0;
		let hi = this.samples.length - 1;
		let found = -1;
		while (lo <= hi) {
			const mid = (lo + hi) >> 1;
			if (this.samples[mid].t <= t) {
				found = mid;
				lo = mid + 1;
			} else {
				hi = mid - 1;
			}
		}
		return found;
	}

	valuesAt(t: number): number[] | null {
		const i = this.indexAt(t);
		return i >= 0 ? this.samples[i].v : null;
	}

	/** Samples needed to draw [from, to]: the one in effect at `from`, then all inside. */
	window(from: number, to: number): TraceSample[] {
		const start = Math.max(0, this.indexAt(from));
		const end = this.indexAt(to);
		return end < start ? [] : this.samples.slice(start, end + 1);
	}
}
