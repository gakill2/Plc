/**
 * Undo / redo over whole-project snapshots. Changes that arrive in quick succession (typing an
 * operand character by character) are merged into one step.
 */
export class History<T> {
	readonly limit: number;
	readonly coalesceMs: number;
	#past: T[] = [];
	#present: T | null = null;
	#future: T[] = [];
	#lastAt = -Infinity;

	constructor(limit = 100, coalesceMs = 600) {
		this.limit = limit;
		this.coalesceMs = coalesceMs;
	}

	get canUndo(): boolean {
		return this.#past.length > 0;
	}

	get canRedo(): boolean {
		return this.#future.length > 0;
	}

	get present(): T | null {
		return this.#present;
	}

	/** Records a new state. Returns false if it equals the current one (nothing to do). */
	record(state: T, now = Date.now()): boolean {
		if (this.#present !== null && state === this.#present) return false;
		if (this.#present !== null) {
			const merge = now - this.#lastAt < this.coalesceMs && this.#past.length > 0;
			if (!merge) {
				this.#past.push(this.#present);
				if (this.#past.length > this.limit) this.#past.shift();
			}
		}
		this.#present = state;
		this.#future = [];
		this.#lastAt = now;
		return true;
	}

	undo(): T | null {
		const previous = this.#past.pop();
		if (previous === undefined || this.#present === null) return null;
		this.#future.push(this.#present);
		this.#present = previous;
		this.#lastAt = -Infinity;
		return previous;
	}

	redo(): T | null {
		const next = this.#future.pop();
		if (next === undefined || this.#present === null) return null;
		this.#past.push(this.#present);
		this.#present = next;
		this.#lastAt = -Infinity;
		return next;
	}
}
