import { describe, expect, it } from 'vitest';
import {
	ackAlarms,
	activeAlarms,
	alarmState,
	formatTime,
	newAlarmLog,
	unacked,
	updateAlarms
} from './alarms.js';
import { alarm, demoHmi, isHmi, toEng, toRaw, widget } from './model.js';

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
		expect(activeAlarms(log).map((e) => alarmState(e))).toEqual(['C', 'CA']);
		expect(unacked(log)).toBe(1);
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
