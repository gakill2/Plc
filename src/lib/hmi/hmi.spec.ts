import { describe, expect, it } from 'vitest';
import {
	ackAlarms,
	activeAlarms,
	alarmState,
	formatTime,
	newAlarmLog,
	unacked,
	updateAlarms,
	shelveAlarm,
	alarmStats,
	type AlarmLog
} from './alarms.js';
import { alarm, demoHmi, isHmi, toEng, toRaw, widget, type Hmi } from './model.js';
import { deviceSymbols } from '#lib/circuit/model.js';
import { getLesson } from '#lib/lessons/lessons.js';
import { runLessonTests } from '#lib/lessons/runner.js';
import { compileSt } from '#lib/st/compiler.js';
import { checkSymbols } from '#lib/symbols/symbols.js';

describe('alarms', () => {
	const overheat = alarm('M1.0', 'Przegrzanie silnika');
	const low = alarm('M1.1', 'Niski poziom', 'warning');
	const defs = [overheat, low];

	it('come, go and are acknowledged like on a real panel', () => {
		const bits: Record<string, boolean> = {};
		const step = (log: ReturnType<typeof newAlarmLog>, now: number) =>
			updateAlarms(log, defs, (t) => bits[t] ?? false, now);

		let log = step(newAlarmLog(), 0);
		expect(log.entries).toEqual([]);

		bits['M1.0'] = true;
		log = step(log, 100);
		expect(log.entries).toHaveLength(1);
		expect(alarmState(log.entries[0])).toBe('C');
		expect(unacked(log)).toBe(1);
		expect(step(log, 150)).toBe(log); // nothing changed → same object

		bits['M1.0'] = false;
		log = step(log, 200);
		expect(alarmState(log.entries[0])).toBe('CG');
		expect(activeAlarms(log)).toHaveLength(1); // gone, but not acknowledged yet

		log = ackAlarms(log, 300);
		expect(alarmState(log.entries[0])).toBe('CGA');
		expect(activeAlarms(log)).toEqual([]);
		expect(ackAlarms(log, 400)).toBe(log);

		// the same alarm again is a new entry; ack while still active keeps it active
		bits['M1.0'] = true;
		bits['M1.1'] = true;
		log = step(log, 500);
		expect(log.entries.map((e) => e.text)).toEqual([
			'Niski poziom',
			'Przegrzanie silnika',
			'Przegrzanie silnika'
		]);
		log = ackAlarms(log, 600, [log.entries[1].seq]);
		// most urgent first: the alarm (priority 2) before the warning (priority 3)
		expect(activeAlarms(log).map((e) => [e.text, alarmState(e)])).toEqual([
			['Przegrzanie silnika', 'CA'],
			['Niski poziom', 'C']
		]);
		expect(unacked(log)).toBe(1);
	});

	it('delays, suppression by design and shelving (ISA-18.2)', () => {
		const bits: Record<string, boolean> = {};
		const level = { ...alarm('M2.0', 'Poziom wysoki'), onDelayMs: 2000, offDelayMs: 1000 };
		const flow = { ...alarm('M2.1', 'Brak przepływu'), suppressTag: 'M2.2' };
		const step = (log: AlarmLog, now: number) =>
			updateAlarms(log, [level, flow], (t) => bits[t] ?? false, now);
		let log = newAlarmLog();
		// a short blip does not come
		bits['M2.0'] = true;
		log = step(log, 0);
		log = step(log, 1500);
		bits['M2.0'] = false;
		log = step(log, 1600);
		expect(log.entries).toEqual([]);
		// a steady condition comes after the on-delay
		bits['M2.0'] = true;
		log = step(log, 2000);
		log = step(log, 4100);
		expect(log.entries).toHaveLength(1);
		// a short drop does not make it go
		bits['M2.0'] = false;
		log = step(log, 4200);
		bits['M2.0'] = true;
		log = step(log, 4800);
		expect(log.entries[0].gone).toBeNull();

		// no flow while the pump is stopped is no alarm
		bits['M2.1'] = true;
		bits['M2.2'] = true;
		log = step(log, 5000);
		expect(log.entries).toHaveLength(1);
		bits['M2.2'] = false;
		log = step(log, 5100);
		expect(log.entries[0].text).toBe('Brak przepływu');

		// shelved: gone at once, does not come back until the time runs out
		log = shelveAlarm(log, flow.id, 5200, 10_000);
		expect(activeAlarms(log).map((e) => e.text)).toEqual(['Poziom wysoki']);
		log = step(log, 6000);
		expect(alarmStats(log, 6000).shelved).toEqual([flow.id]);
		log = step(log, 15_300);
		expect(log.entries[0].text).toBe('Brak przepływu');
	});

	it('finds chattering and standing alarms and floods', () => {
		const bits: Record<string, boolean> = {};
		const a = alarm('M3.0', 'Drga');
		const many = Array.from({ length: 12 }, (_, i) => alarm(`M4.${i % 8}`, `A${i}`));
		let log = newAlarmLog();
		for (let i = 0; i < 4; i++) {
			bits['M3.0'] = true;
			log = updateAlarms(log, [a], (t) => bits[t] ?? false, i * 10_000);
			bits['M3.0'] = false;
			log = updateAlarms(log, [a], (t) => bits[t] ?? false, i * 10_000 + 5000);
		}
		expect(alarmStats(log, 40_000).chattering).toEqual([a.id]);
		expect(alarmStats(log, 40_000).top[0]).toEqual({ defId: a.id, count: 4 });
		bits['M3.0'] = true;
		log = updateAlarms(log, [a], (t) => bits[t] ?? false, 50_000);
		expect(alarmStats(log, 50_000 + 300_000).standing).toEqual([a.id]);
		let flood = newAlarmLog();
		for (let i = 0; i < 12; i++) {
			flood = updateAlarms(flood, many.slice(0, i + 1), () => true, i * 1000);
		}
		expect(alarmStats(flood, 12_000).flood).toBe(true);
	});

	it('formats simulated time', () => {
		expect(formatTime(83_045)).toBe('01:23.045');
	});
});

describe('hmi model', () => {
	it('creates widgets with sizes and scales analog values', () => {
		const w = widget('value', 10, 20, { tag: 'U1_Speed', scale: 50, unit: 'Hz' });
		expect(w).toMatchObject({ kind: 'value', w: 150, h: 60, tag: 'U1_Speed' });
		expect(toEng(w, 13824)).toBe(25);
		expect(toRaw(w, 25)).toBe(13824);
		expect(toEng({ scale: 0 }, 7)).toBe(7);
		expect(isHmi(demoHmi())).toBe(true);
		expect(isHmi({ widgets: 1 })).toBe(false);
	});
});

describe('the alarm-flood lesson', () => {
	const lesson = getLesson('alarm-flood')!;
	const project = lesson.starter();
	const { map } = checkSymbols([...deviceSymbols(project.circuit), ...project.symbols]);
	const r = compileSt(lesson.solutionSt!, { symbols: map });
	const failing = (change: (hmi: Hmi) => void) => {
		const hmi = lesson.solutionHmi!();
		change(hmi);
		return runLessonTests(lesson, r.program, project.circuit, [], r.load, undefined, {
			hmi,
			symbols: map
		})
			.filter((t) => !t.passed)
			.map((t) => t.name);
	};
	const normal = 'Normalna partia: ani jednego alarmu';

	it('fails a chattering alarm and a standing one, each on its own', () => {
		expect(failing(() => {})).toEqual([]);
		expect(failing((h) => (h.alarms[0].onDelayMs = 0))).toContain(normal);
		expect(failing((h) => delete h.alarms[1].suppressTag)).toContain(normal);
	});
});
