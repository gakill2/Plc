import { describe, expect, it } from 'vitest';
import { deviceSymbols } from '#lib/circuit/model.js';
import { getLesson } from '#lib/lessons/lessons.js';
import { runLessonTests } from '#lib/lessons/runner.js';
import { compileSt } from '#lib/st/compiler.js';
import { checkSymbols } from '#lib/symbols/symbols.js';
import { analogReading, channelAddress, checkHardware, type Hardware } from './hw.js';

const rack = (): Hardware => ({
	cpu: 'CPU',
	imageBytes: 128,
	modules: [
		{ slot: 2, kind: 'DI16', start: 0 },
		{ slot: 3, kind: 'DQ16', start: 0 },
		{ slot: 4, kind: 'AI4', start: 64, ai: [] }
	],
	wiring: []
});

describe('hardware configuration', () => {
	it('gives every channel its address', () => {
		const hw = rack();
		expect(channelAddress(hw, 2, 0)).toBe('I0.0');
		expect(channelAddress(hw, 2, 9)).toBe('I1.1');
		expect(channelAddress(hw, 3, 4)).toBe('Q0.4');
		expect(channelAddress(hw, 4, 1)).toBe('IW66');
		expect(channelAddress(hw, 5, 0)).toBeNull();
		expect(channelAddress(hw, 2, 16)).toBeNull();
	});

	it('finds overlapping addresses, odd analog starts and the end of the image', () => {
		expect(checkHardware(rack())).toEqual([]);
		const hw = rack();
		hw.modules.push({ slot: 5, kind: 'DI16', start: 1 });
		expect(checkHardware(hw)[0].message).toMatch(/overlap/);
		hw.modules[2].start = 65;
		expect(checkHardware(hw).some((i) => /even/.test(i.message))).toBe(true);
		hw.modules[1].start = 127;
		expect(checkHardware(hw).some((i) => /outside/.test(i.message))).toBe(true);
	});

	it('reads analog values like a real card', () => {
		const ok = { mode: 'I_4_20', diag: true } as const;
		expect(analogReading(13824, 'I_4_20', ok, false)).toBe(13824);
		// open loop: 32767 only with diagnostics, otherwise an under-range value
		expect(analogReading(13824, 'I_4_20', ok, true)).toBe(32767);
		expect(analogReading(13824, 'I_4_20', { mode: 'I_4_20', diag: false }, true)).toBe(-4864);
		// 0–20 mA on a 4–20 mA transmitter: zero is not zero
		expect(analogReading(0, 'I_4_20', { mode: 'I_0_20', diag: false }, false)).toBe(5530);
		// a current loop on a voltage input saturates
		expect(analogReading(1000, 'I_4_20', { mode: 'U_0_10', diag: false }, false)).toBe(32767);
		// 0–10 V cannot tell a broken wire from an empty tank
		expect(analogReading(13824, 'U_0_10', { mode: 'U_0_10', diag: true }, true)).toBe(0);
		expect(analogReading(235, 'RTD', { mode: 'RTD', diag: true }, false)).toBe(235);
		expect(analogReading(235, 'RTD', { mode: 'U_0_10', diag: false }, false)).toBe(0);
	});

	it('the mixer lesson fails for each wrong setting on its own', () => {
		const lesson = getLesson('hw-config')!;
		const project = lesson.starter();
		const { map } = checkSymbols([...deviceSymbols(project.circuit), ...project.symbols]);
		const r = compileSt(lesson.solutionSt!, { symbols: map });
		const failing = (change: (hw: Hardware) => void) => {
			const hw = lesson.solutionHw!();
			change(hw);
			return runLessonTests(lesson, r.program, project.circuit, [], r.load, hw)
				.filter((t) => !t.passed)
				.map((t) => t.name);
		};
		expect(failing(() => {})).toEqual([]);
		expect(failing((hw) => (hw.modules[1].start = 4))).toContain(
			'Rozruch: receptura 1 — dobra partia'
		);
		expect(failing((hw) => (hw.modules[2].ai![0].diag = false))).toEqual([
			'Diagnostyka: zerwany przewód poziomu — alarm od razu, nie dopiero od wyłącznika HH'
		]);
		expect(failing((hw) => (hw.modules[2].ai![1].mode = 'I_4_20')).length).toBeGreaterThan(0);
		expect(failing((hw) => (hw.modules[2].ai![0].mode = 'I_0_20')).length).toBeGreaterThan(0);
	});
});
