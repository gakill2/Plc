import { describe, expect, it } from 'vitest';
import { deviceSymbols } from '#lib/circuit/model.js';
import { LESSONS } from '#lib/lessons/lessons.js';
import { runLessonTests } from '#lib/lessons/runner.js';
import { compileSt } from '#lib/st/compiler.js';
import { STDLIB } from '#lib/st/stdlib.js';
import { checkSymbols } from '#lib/symbols/symbols.js';
import { emptySfc } from '#lib/sfc/sfc.js';
import { exportPlcOpen, exportScl, iecAddress, ladderToSt, type ExportInput } from './export.js';

/** Ladder lessons whose tests run on the plain PLC (no wiring) — their solutions are translated to ST. */
const ladderLessons = LESSONS.filter(
	(l) =>
		!l.solutionSt && !l.solutionSfc && !l.solutionFbd && l.kind !== 'commissioning' && !l.fieldTests
);

describe('ladder → Structured Text', () => {
	it.each(ladderLessons.map((l) => [l.slug, l] as const))(
		'%s behaves the same in ST',
		(_slug, lesson) => {
			const project = lesson.starter();
			const { map } = checkSymbols([...deviceSymbols(project.circuit), ...project.symbols]);
			const st = ladderToSt(lesson.solution(), map);
			const r = compileSt(st, { symbols: map, prelude: STDLIB });
			expect(
				r.diagnostics.map((d) => d.message),
				st
			).toEqual([]);
			const failed = runLessonTests(lesson, r.program, project.circuit).filter((t) => !t.passed);
			expect(failed, st).toEqual([]);
		}
	);
});

const sample: ExportInput = {
	name: 'Demo',
	language: 'st',
	ladder: { version: 1, rungs: [] },
	sfc: emptySfc(),
	library: `FUNCTION_BLOCK Motor
VAR_INPUT Start, Stop : BOOL; END_VAR
VAR_OUTPUT Run : BOOL; END_VAR
VAR t : TON; END_VAR
Run := (Start OR Run) AND Stop;
t(IN := Run, PT := T#2s);
END_FUNCTION_BLOCK`,
	st: `VAR
  m1 : Motor;
  level : REAL;
  pid1 : PID;
END_VAR
m1(Start := StartBtn, Stop := I0.1, Run => Q0.0);
level := INT_TO_REAL(IW4) / 276.48;
pid1(SP := 50.0, PV := level, OUT => QW4);`,
	symbols: [
		{ name: 'StartBtn', address: 'I0.0', comment: 'Start; zielony' },
		{ name: 'Level', address: 'IW4', comment: '' }
	]
};

describe('export', () => {
	it('exports arrays, VAR RETAIN and the cyclic interrupt', () => {
		const lesson = LESSONS.find((l) => l.slug === 'oven-filter')!;
		const project = lesson.starter();
		const input: ExportInput = {
			...sample,
			library: '',
			st: lesson.solutionSt!,
			symbols: project.symbols.map((x) => ({
				name: x.name,
				address: x.address,
				comment: x.comment
			}))
		};
		const { scl, errors } = exportScl(input);
		expect(errors).toEqual([]);
		expect(scl).toContain('buf : Array[0..9] of Int;');
		expect(scl).toMatch(/VAR RETAIN\s+alarms : Int;/);
		expect(scl).toContain('ORGANIZATION_BLOCK "Cyclic_interrupt"');
		expect(scl).toContain('"Main_DB".buf["Main_DB".pos] := "Temperature";');
		const { xml } = exportPlcOpen(input);
		expect(xml).toContain('<localVars retain="true">');
		expect(xml).toContain(
			'<array><dimension lower="0" upper="9"/><baseType><INT/></baseType></array>'
		);
		expect(xml).toContain('<task name="CyclicTask" interval="T#100ms"');
		expect(xml).toContain('PLC_PRG.buf[PLC_PRG.pos] := Temperature;');
	});

	it('writes TIA Portal SCL with # locals, "tags" and %addresses', () => {
		const { scl, tags, errors } = exportScl(sample);
		expect(errors).toEqual([]);
		expect(scl).toContain('FUNCTION_BLOCK "Motor"');
		expect(scl).toContain('t : TON_TIME;');
		expect(scl).toContain('#Run := (#Start OR #Run) AND #Stop;');
		expect(scl).toContain('#m1(Start := "StartBtn", Stop := %I0.1, Run => %Q0.0);');
		expect(scl).toContain('FUNCTION_BLOCK "PID"'); // the standard block it uses
		expect(scl).not.toContain('FUNCTION_BLOCK "SCALE"'); // … and not the unused one
		expect(scl).toContain('"Main_DB"();');
		expect(tags.split('\n')[1]).toBe('StartBtn;Default tag table;Bool;%I0.0;Start, zielony');
	});

	it('writes PLCopen XML with POUs, a program and global I/O variables', () => {
		const { xml, errors } = exportPlcOpen(sample, new Date('2026-01-01T00:00:00Z'));
		expect(errors).toEqual([]);
		expect(xml).toContain('<pou name="Motor" pouType="functionBlock">');
		expect(xml).toContain('<pou name="PLC_PRG" pouType="program">');
		expect(xml).toContain('<variable name="m1"><type><derived name="Motor"/></type></variable>');
		expect(xml).toContain('<variable name="StartBtn" address="%IX0.0"><type><BOOL/></type>');
		expect(xml).toContain('m1(Start := StartBtn, Stop := %IX0.1, Run =&gt; %QX0.0);');
		expect((xml.match(/<pou /g) ?? []).length).toBe(3);
	});

	it('maps addresses to IEC direct addresses', () => {
		expect(iecAddress('I0.0')).toBe('%IX0.0');
		expect(iecAddress('QW4')).toBe('%QW4');
		expect(iecAddress('MD100')).toBe('%MD100');
		expect(iecAddress('T0')).toBe('');
	});
});
