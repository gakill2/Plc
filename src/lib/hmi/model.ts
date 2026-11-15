import { newId } from '#lib/ladder/model.js';

/*
 * The operator panel (HMI): widgets on a fixed-size screen, each bound to a tag — a symbol or
 * an address of the PLC — and the alarm definitions.
 */

export const HMI_WIDTH = 800;
export const HMI_HEIGHT = 480;

export type WidgetKind =
	'button' | 'switch' | 'lamp' | 'value' | 'input' | 'bar' | 'label' | 'alarms';

export type HmiColor = 'green' | 'red' | 'amber' | 'blue' | 'grey';

export interface HmiWidget {
	id: string;
	kind: WidgetKind;
	x: number;
	y: number;
	w: number;
	h: number;
	/** symbol or address the widget reads or writes */
	tag: string;
	text: string;
	color: HmiColor;
	unit: string;
	decimals: number;
	/**
	 * Engineering value for a raw analog 27648 — e.g. 50 shows a VFD word in Hz.
	 * 0 = show the raw value.
	 */
	scale: number;
	min: number;
	max: number;
}

export type AlarmClass = 'alarm' | 'warning';

/** ISA-18.2 priority: 1 = critical (immediate action) … 4 = low. */
export type AlarmPriority = 1 | 2 | 3 | 4;

export interface AlarmDef {
	id: string;
	/** bit that raises the alarm while it is 1 */
	tag: string;
	text: string;
	kind: AlarmClass;
	/** default: alarm → 2, warning → 3 */
	priority?: AlarmPriority;
	/** the condition must hold this long before the alarm comes (against chattering) */
	onDelayMs?: number;
	/** the condition must be gone this long before the alarm goes */
	offDelayMs?: number;
	/** suppression by design: while this bit is 1 the alarm is not raised (e.g. machine stopped) */
	suppressTag?: string;
	/** rationalization: what the operator must do */
	action?: string;
}

export const priorityOf = (d: Pick<AlarmDef, 'priority' | 'kind'>): AlarmPriority =>
	d.priority ?? (d.kind === 'alarm' ? 2 : 3);

export interface Hmi {
	widgets: HmiWidget[];
	alarms: AlarmDef[];
	/** pulsed when the operator acknowledges alarms, so the program can reset latched faults */
	ackTag: string;
}

/** Widgets that write to the PLC. */
export const WRITES: ReadonlySet<WidgetKind> = new Set(['button', 'switch', 'input']);

const SIZE: Record<WidgetKind, [number, number]> = {
	button: [120, 50],
	switch: [120, 50],
	lamp: [120, 50],
	value: [150, 60],
	input: [150, 60],
	bar: [220, 50],
	label: [200, 30],
	alarms: [420, 150]
};

export const WIDGET_NAMES: Record<WidgetKind, string> = {
	button: 'Przycisk',
	switch: 'Przełącznik',
	lamp: 'Lampka',
	value: 'Wartość',
	input: 'Pole liczbowe',
	bar: 'Pasek',
	label: 'Tekst',
	alarms: 'Lista alarmów'
};

export function widget(
	kind: WidgetKind,
	x: number,
	y: number,
	extra: Partial<HmiWidget> = {}
): HmiWidget {
	const [w, h] = SIZE[kind];
	return {
		id: newId('h'),
		kind,
		x,
		y,
		w,
		h,
		tag: '',
		text: kind === 'label' ? 'Tekst' : kind === 'alarms' ? '' : WIDGET_NAMES[kind],
		color: kind === 'button' ? 'blue' : 'green',
		unit: '',
		decimals: 0,
		scale: 0,
		min: 0,
		max: 100,
		...extra
	};
}

export const alarm = (tag: string, text: string, kind: AlarmClass = 'alarm'): AlarmDef => ({
	id: newId('a'),
	tag,
	text,
	kind
});

export const emptyHmi = (): Hmi => ({ widgets: [], alarms: [], ackTag: '' });

/** Engineering value of a raw number for a widget. */
export const toEng = (w: Pick<HmiWidget, 'scale'>, raw: number) =>
	w.scale ? (raw / 27648) * w.scale : raw;
export const toRaw = (w: Pick<HmiWidget, 'scale'>, eng: number) =>
	w.scale ? Math.round((eng / w.scale) * 27648) : Math.round(eng);

/** The panel that comes with the demo project (read-only: it only shows the machine). */
export function demoHmi(): Hmi {
	return {
		widgets: [
			widget('label', 30, 20, { w: 500, text: 'Silnik taśmy — panel operatora', h: 34 }),
			widget('lamp', 30, 80, { tag: 'Motor', text: 'Silnik', color: 'green' }),
			widget('lamp', 170, 80, { tag: 'Running', text: 'Praca', color: 'green' }),
			widget('lamp', 310, 80, { tag: 'Service', text: 'Serwis', color: 'amber' }),
			widget('value', 30, 160, { tag: 'RunDelay', text: 'Opóźnienie (ET)', unit: 'ms' }),
			widget('value', 200, 160, { tag: 'MotorStarts', text: 'Uruchomienia', unit: 'szt.' }),
			widget('bar', 370, 165, {
				tag: 'MotorStarts',
				text: 'Do serwisu',
				min: 0,
				max: 5,
				unit: 'szt.'
			}),
			widget('alarms', 30, 260, { w: 560, h: 180 })
		],
		alarms: [alarm('Service', 'Serwis: silnik uruchomiono 5 razy — wymień szczotki', 'warning')],
		ackTag: ''
	};
}

export function isHmi(v: unknown): v is Hmi {
	return (
		typeof v === 'object' &&
		v !== null &&
		Array.isArray((v as Hmi).widgets) &&
		Array.isArray((v as Hmi).alarms)
	);
}
