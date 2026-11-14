import type { LadderProgram } from '#lib/ladder/model.js';

export interface SimInput {
	address: string;
	/** Also the symbol name used in the program, so it must be an identifier. */
	label: string;
	/** push = held only while pressed, toggle = switch */
	kind?: 'push' | 'toggle';
	/** Physical button wired through its normally-closed contact. */
	nc?: boolean;
	/** Offer a "broken wire" checkbox (signal forced to 0). */
	breakable?: boolean;
}

export interface SimOutput {
	address: string;
	label: string;
	color?: 'green' | 'red' | 'amber' | 'blue';
}

export interface SimBlock {
	kind: 'sim';
	title?: string;
	caption?: string;
	ladder?: () => LadderProgram;
	st?: string;
	inputs: SimInput[];
	outputs: SimOutput[];
	/** Additional symbols, e.g. markers: { label: 'Impuls', address: 'M0.0' } */
	symbols?: { label: string; address: string }[];
	trace?: { address: string; format?: 'BOOL' | 'DEC' }[];
	/** Show a truth table of all input combinations (only for logic without memory). */
	truthTable?: boolean;
}

export type Block =
	| { kind: 'text'; text: string }
	| { kind: 'callout'; tone: 'info' | 'warn' | 'tip'; title?: string; text: string }
	| SimBlock
	| { kind: 'code'; title?: string; code: string }
	| { kind: 'table'; head: string[]; rows: string[][] }
	| { kind: 'quiz'; question: string; options: string[]; correct: number; explanation: string }
	| { kind: 'scan-cycle' }
	| { kind: 'address-explorer' }
	| { kind: 'plc-overview' }
	| { kind: 'lesson'; slug: string; text: string }
	| { kind: 'wiring' }
	| { kind: 'analog' }
	| { kind: 'control'; initial?: 'onoff' | 'pid' };

export interface Chapter {
	slug: string;
	title: string;
	summary: string;
	minutes: number;
	blocks: Block[];
}

export interface GlossaryEntry {
	pl: string;
	en: string;
	text: string;
	/** Chapter where the term is explained. */
	chapter?: string;
}
