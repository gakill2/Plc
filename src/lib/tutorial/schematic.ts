/*
 * A small machine documented like an EPLAN project: conveyor T1 with motor -M1 on contactor
 * -K1, PLC -A1, buttons, a sensor and the terminal strips -X1 / -X2 / -X3. Four pages of eight
 * columns; every device carries its tag (IEC 81346), and the parts of one device on other pages
 * are linked by cross references "/page.column". A wire on page 4 is broken — the multimeter
 * finds it.
 */

export type ShapeKind =
	| 'contactNO'
	| 'button'
	| 'buttonNC'
	| 'coil'
	| 'fuse'
	| 'breaker3'
	| 'contacts3'
	| 'motor'
	| 'psu'
	| 'terminal'
	| 'plcIn'
	| 'plcOut'
	| 'lamp'
	| 'sensor';

export interface Shape {
	id: string;
	kind: ShapeKind;
	/** device tag, e.g. -K1 */
	tag: string;
	/** which part of the device: 13-14, A1-A2, I0.4 … */
	part?: string;
	x: number;
	y: number;
	text: string;
	/** the other parts of this device on other pages */
	refs?: string[];
	/** contact mirror under a coil: contact → shape id */
	mirror?: [string, string][];
}

export interface Wire {
	id: string;
	points: [number, number][];
	/** potential, for the multimeter */
	net: string;
}

export interface Rail {
	y: number;
	x1: number;
	x2: number;
	name: string;
	/** where it comes from */
	ref?: string;
	/** the shape the reference jumps to */
	refTo?: string;
	net: string;
}

/** A point the multimeter can touch. */
export interface TestPoint {
	id: string;
	x: number;
	y: number;
	net: string;
	label: string;
}

export interface Page {
	no: number;
	title: string;
	shapes: Shape[];
	wires: Wire[];
	rails: Rail[];
	points: TestPoint[];
	notes?: { x: number; y: number; text: string; refTo?: string }[];
}

export const COLUMN = 100;
export const column = (x: number) => Math.min(8, Math.floor(x / COLUMN) + 1);

/** Voltage of each potential against M (AC: between phases), with the machine as found. */
export const VOLTS: Record<string, number> = {
	L1: 400,
	L2: 400,
	L3: 400,
	PE: 0,
	'L+': 24,
	'1L+': 24,
	'2L+': 24,
	'3L+': 24,
	M: 0,
	S1: 0,
	S2: 24,
	B1: 0,
	Q2aux: 24,
	K1aux: 0,
	'Q0.0': 24,
	'X2:1': 24,
	'K1:A1': 0,
	'Q0.1': 0,
	motor: 0
};

const W = (id: string, net: string, ...points: [number, number][]): Wire => ({ id, net, points });

export const PAGES: Page[] = [
	{
		no: 1,
		title: 'Zasilanie 400 V AC, silnik taśmy',
		rails: [
			{ y: 40, x1: 20, x2: 780, name: 'L1', net: 'L1', ref: '-Q1 wyłącznik główny' },
			{ y: 55, x1: 20, x2: 780, name: 'L2', net: 'L2' },
			{ y: 70, x1: 20, x2: 780, name: 'L3', net: 'L3' },
			{ y: 85, x1: 20, x2: 780, name: 'PE', net: 'PE' }
		],
		shapes: [
			{
				id: 'q2',
				kind: 'breaker3',
				tag: '-Q2',
				part: '1-2 3-4 5-6',
				x: 250,
				y: 150,
				text: 'wyłącznik silnikowy 4–6,3 A (przeciążenie i zwarcie)',
				refs: ['q2aux']
			},
			{
				id: 'k1main',
				kind: 'contacts3',
				tag: '-K1',
				part: '1-2 3-4 5-6',
				x: 250,
				y: 250,
				text: 'styki główne stycznika taśmy',
				refs: ['k1coil']
			},
			{
				id: 'x3',
				kind: 'terminal',
				tag: '-X3',
				part: 'U V W',
				x: 250,
				y: 330,
				text: 'listwa silnikowa -X3'
			},
			{ id: 'm1', kind: 'motor', tag: '-M1', x: 250, y: 410, text: 'silnik taśmy 2,2 kW, 400 V' },
			{ id: 't1', kind: 'psu', tag: '-T1', x: 550, y: 240, text: 'zasilacz 400 V AC / 24 V DC 5 A' }
		],
		wires: [
			W('p1', 'L1', [230, 40], [230, 125]),
			W('p2', 'L2', [250, 55], [250, 125]),
			W('p3', 'L3', [270, 70], [270, 125]),
			W('p4', 'motor', [230, 175], [230, 225]),
			W('p5', 'motor', [250, 175], [250, 225]),
			W('p6', 'motor', [270, 175], [270, 225]),
			W('p7', 'motor', [230, 275], [230, 322]),
			W('p8', 'motor', [250, 275], [250, 322]),
			W('p9', 'motor', [270, 275], [270, 322]),
			W('p10', 'motor', [250, 338], [250, 385]),
			W('p11', 'PE', [320, 85], [320, 410], [280, 410]),
			W('p12', 'L1', [530, 40], [530, 205]),
			W('p13', 'L2', [570, 55], [570, 205])
		],
		points: [
			{ id: 'tp-l1', x: 230, y: 110, net: 'L1', label: 'L1 przed -Q2' },
			{ id: 'tp-u', x: 230, y: 300, net: 'motor', label: '-X3:U' }
		],
		notes: [{ x: 550, y: 310, text: 'L+ / M → /2.1', refTo: 'f1' }]
	},
	{
		no: 2,
		title: 'Zasilanie 24 V DC i zabezpieczenia',
		rails: [
			{ y: 60, x1: 20, x2: 780, name: 'L+', ref: '-T1 /1.6', refTo: 't1', net: 'L+' },
			{ y: 470, x1: 20, x2: 780, name: 'M', ref: '-T1 /1.6', refTo: 't1', net: 'M' }
		],
		shapes: [
			{
				id: 'f1',
				kind: 'fuse',
				tag: '-F1',
				x: 150,
				y: 140,
				text: 'bezpiecznik 2 A — zasilanie CPU'
			},
			{
				id: 'f2',
				kind: 'fuse',
				tag: '-F2',
				x: 350,
				y: 140,
				text: 'bezpiecznik 2 A — przyciski i czujniki (wejścia)'
			},
			{
				id: 'f3',
				kind: 'fuse',
				tag: '-F3',
				x: 550,
				y: 140,
				text: 'bezpiecznik 4 A — wyjścia PLC (cewki, lampki)'
			},
			{
				id: 'a1psu',
				kind: 'psu',
				tag: '-A1',
				part: 'L+ M',
				x: 150,
				y: 300,
				text: 'CPU 1214C — zasilanie 24 V'
			}
		],
		wires: [
			W('d1', 'L+', [150, 60], [150, 115]),
			W('d2', '1L+', [150, 165], [150, 265]),
			W('d3', 'M', [190, 335], [190, 470]),
			W('d4', 'L+', [350, 60], [350, 115]),
			W('d5', '2L+', [350, 165], [350, 250]),
			W('d6', 'L+', [550, 60], [550, 115]),
			W('d7', '3L+', [550, 165], [550, 250])
		],
		points: [
			{ id: 'tp-f2', x: 350, y: 220, net: '2L+', label: 'za -F2' },
			{ id: 'tp-f3', x: 550, y: 220, net: '3L+', label: 'za -F3' }
		],
		notes: [
			{ x: 350, y: 270, text: '2L+ → /3.1', refTo: 's1' },
			{ x: 550, y: 270, text: '3L+ → /4.1', refTo: 'out0' }
		]
	},
	{
		no: 3,
		title: 'Wejścia PLC -A1 (DI)',
		rails: [
			{ y: 60, x1: 20, x2: 780, name: '2L+', ref: '-F2 /2.4', refTo: 'f2', net: '2L+' },
			{ y: 470, x1: 20, x2: 780, name: 'M', ref: '/2.1', refTo: 'f1', net: 'M' }
		],
		shapes: [
			{
				id: 's1',
				kind: 'button',
				tag: '-S1',
				part: '13-14',
				x: 50,
				y: 130,
				text: 'przycisk Start (NO)'
			},
			{
				id: 's2',
				kind: 'buttonNC',
				tag: '-S2',
				part: '11-12',
				x: 150,
				y: 130,
				text: 'przycisk Stop (NC)'
			},
			{
				id: 'b1',
				kind: 'sensor',
				tag: '-B1',
				x: 250,
				y: 130,
				text: 'czujnik indukcyjny PNP — koniec taśmy'
			},
			{
				id: 'q2aux',
				kind: 'contactNO',
				tag: '-Q2',
				part: '13-14',
				x: 350,
				y: 130,
				text: 'styk pomocniczy wyłącznika silnikowego (zamknięty = -Q2 załączony)',
				refs: ['q2']
			},
			{
				id: 'k1aux',
				kind: 'contactNO',
				tag: '-K1',
				part: '13-14',
				x: 450,
				y: 130,
				text: 'styk pomocniczy stycznika (potwierdzenie pracy)',
				refs: ['k1coil']
			},
			{ id: 'x1-1', kind: 'terminal', tag: '-X1', part: '1', x: 50, y: 240, text: 'zacisk -X1:1' },
			{ id: 'x1-2', kind: 'terminal', tag: '-X1', part: '2', x: 150, y: 240, text: 'zacisk -X1:2' },
			{
				id: 'x1-3',
				kind: 'terminal',
				tag: '-X1',
				part: '3',
				x: 225,
				y: 240,
				text: 'zacisk -X1:3 (BN, +24 V czujnika)'
			},
			{
				id: 'x1-4',
				kind: 'terminal',
				tag: '-X1',
				part: '4',
				x: 275,
				y: 240,
				text: 'zacisk -X1:4 (BU, 0 V czujnika)'
			},
			{
				id: 'x1-5',
				kind: 'terminal',
				tag: '-X1',
				part: '5',
				x: 250,
				y: 280,
				text: 'zacisk -X1:5 (BK, sygnał czujnika)'
			},
			{ id: 'x1-6', kind: 'terminal', tag: '-X1', part: '6', x: 350, y: 240, text: 'zacisk -X1:6' },
			{ id: 'x1-7', kind: 'terminal', tag: '-X1', part: '7', x: 450, y: 240, text: 'zacisk -X1:7' },
			{
				id: 'in0',
				kind: 'plcIn',
				tag: '-A1',
				part: 'I0.0',
				x: 50,
				y: 370,
				text: 'wejście I0.0 — Start'
			},
			{
				id: 'in1',
				kind: 'plcIn',
				tag: '-A1',
				part: 'I0.1',
				x: 150,
				y: 370,
				text: 'wejście I0.1 — Stop'
			},
			{
				id: 'in2',
				kind: 'plcIn',
				tag: '-A1',
				part: 'I0.2',
				x: 250,
				y: 370,
				text: 'wejście I0.2 — czujnik końca taśmy'
			},
			{
				id: 'in3',
				kind: 'plcIn',
				tag: '-A1',
				part: 'I0.3',
				x: 350,
				y: 370,
				text: 'wejście I0.3 — wyłącznik silnikowy OK'
			},
			{
				id: 'in4',
				kind: 'plcIn',
				tag: '-A1',
				part: 'I0.4',
				x: 450,
				y: 370,
				text: 'wejście I0.4 — stycznik pracuje'
			}
		],
		wires: [
			W('i1', '2L+', [50, 60], [50, 105]),
			W('i2', 'S1', [50, 155], [50, 232]),
			W('i3', 'S1', [50, 248], [50, 352]),
			W('i4', '2L+', [150, 60], [150, 105]),
			W('i5', 'S2', [150, 155], [150, 232]),
			W('i6', 'S2', [150, 248], [150, 352]),
			W('i7', '2L+', [225, 60], [225, 232]),
			W('i8', '2L+', [225, 248], [225, 255], [238, 255], [238, 158]),
			W('i9', 'M', [262, 158], [262, 225], [275, 225], [275, 232]),
			W('i10', 'M', [275, 248], [275, 470]),
			W('i11', 'B1', [250, 158], [250, 272]),
			W('i12', 'B1', [250, 288], [250, 352]),
			W('i13', '2L+', [350, 60], [350, 105]),
			W('i14', 'Q2aux', [350, 155], [350, 232]),
			W('i15', 'Q2aux', [350, 248], [350, 352]),
			W('i16', '2L+', [450, 60], [450, 105]),
			W('i17', 'K1aux', [450, 155], [450, 232]),
			W('i18', 'K1aux', [450, 248], [450, 352])
		],
		points: [
			{ id: 'tp-in2', x: 250, y: 325, net: 'B1', label: '-A1:I0.2' },
			{ id: 'tp-in3', x: 350, y: 325, net: 'Q2aux', label: '-A1:I0.3' },
			{ id: 'tp-in4', x: 450, y: 325, net: 'K1aux', label: '-A1:I0.4' }
		]
	},
	{
		no: 4,
		title: 'Wyjścia PLC -A1 (DQ)',
		rails: [
			{ y: 40, x1: 20, x2: 780, name: '3L+', ref: '-F3 /2.6', refTo: 'f3', net: '3L+' },
			{ y: 470, x1: 20, x2: 780, name: 'M', ref: '/2.1', refTo: 'f1', net: 'M' }
		],
		shapes: [
			{
				id: 'out0',
				kind: 'plcOut',
				tag: '-A1',
				part: 'Q0.0',
				x: 150,
				y: 100,
				text: 'wyjście Q0.0 — stycznik taśmy'
			},
			{
				id: 'out1',
				kind: 'plcOut',
				tag: '-A1',
				part: 'Q0.1',
				x: 350,
				y: 100,
				text: 'wyjście Q0.1 — lampka pracy'
			},
			{ id: 'x2-1', kind: 'terminal', tag: '-X2', part: '1', x: 150, y: 190, text: 'zacisk -X2:1' },
			{ id: 'x2-3', kind: 'terminal', tag: '-X2', part: '3', x: 350, y: 190, text: 'zacisk -X2:3' },
			{
				id: 'k1coil',
				kind: 'coil',
				tag: '-K1',
				part: 'A1-A2',
				x: 150,
				y: 300,
				text: 'cewka stycznika taśmy 24 V DC',
				mirror: [
					['1-2', 'k1main'],
					['3-4', 'k1main'],
					['5-6', 'k1main'],
					['13-14', 'k1aux']
				]
			},
			{ id: 'h1', kind: 'lamp', tag: '-H1', x: 350, y: 300, text: 'lampka „taśma pracuje”' }
		],
		wires: [
			W('o0', '3L+', [100, 40], [100, 88], [128, 88]),
			W('o1', 'Q0.0', [150, 118], [150, 182]),
			W('o2', 'K1:A1', [150, 198], [150, 282]),
			W('o3', 'M', [150, 318], [150, 470]),
			W('o4', 'Q0.1', [350, 118], [350, 182]),
			W('o5', 'Q0.1', [350, 198], [350, 285]),
			W('o6', 'M', [350, 315], [350, 470])
		],
		points: [
			{ id: 'tp-q0', x: 150, y: 150, net: 'Q0.0', label: '-A1:Q0.0' },
			{ id: 'tp-x21', x: 150, y: 206, net: 'X2:1', label: '-X2:1 (od strony pola)' },
			{ id: 'tp-a1', x: 150, y: 274, net: 'K1:A1', label: '-K1:A1' },
			{ id: 'tp-a2', x: 150, y: 330, net: 'M', label: '-K1:A2' }
		]
	}
];

export const allShapes = PAGES.flatMap((p) => p.shapes.map((s) => ({ ...s, page: p.no })));

/** "/page.column" of a shape, as the cross reference prints it. */
export const where = (id: string) => {
	const s = allShapes.find((x) => x.id === id);
	return s ? `/${s.page}.${column(s.x)}` : '';
};

/** Terminal strip -X1 as the terminal diagram shows it: cabinet side ↔ field side. */
export const STRIP_X1: [string, string, string][] = [
	['-X1:1', '-A1:I0.0', '-S1:14'],
	['-X1:2', '-A1:I0.1', '-S2:12'],
	['-X1:3', '2L+ (-F2)', '-B1:BN'],
	['-X1:4', 'M', '-B1:BU'],
	['-X1:5', '-A1:I0.2', '-B1:BK'],
	['-X1:6', '-A1:I0.3', '-Q2:14'],
	['-X1:7', '-A1:I0.4', '-K1:14']
];

export interface SchematicTask {
	question: string;
	/** the answer: a shape or a wire id */
	answer: string;
	explanation: string;
	hint: string;
}

export const TASKS: SchematicTask[] = [
	{
		question: 'Znajdź cewkę stycznika -K1. Kliknij ją.',
		answer: 'k1coil',
		hint: 'Cewki sterowane z PLC są na stronie wyjść. Pomaga lista aparatów: -K1 A1-A2.',
		explanation:
			'Cewka -K1 (A1-A2) jest na stronie 4 w kolumnie 2 (/4.2). Pod nią lustro styków: gdzie leżą jego styki główne i pomocnicze.'
	},
	{
		question:
			'Styk pomocniczy -K1 (13-14) potwierdza, że stycznik pracuje. Na którym wejściu PLC go odczytasz? Kliknij to wejście.',
		answer: 'in4',
		hint: 'Lustro styków pod cewką -K1 mówi, gdzie jest styk 13-14. Kliknij odsyłacz — przeniesie Cię na tę stronę.',
		explanation:
			'Styk -K1:13-14 (/3.5) idzie przez zacisk -X1:7 na wejście -A1:I0.4. Program porównuje Q0.0 z I0.4 — tak wykrywa niezałączony albo sklejony stycznik.'
	},
	{
		question: 'Który bezpiecznik zasila przyciski i czujnik? Kliknij go.',
		answer: 'f2',
		hint: 'Szyna nad wejściami to 2L+, a odsyłacz przy niej wskazuje aparat i stronę, skąd przychodzi.',
		explanation:
			'2L+ przychodzi z bezpiecznika -F2 (/2.4). Gdy -F2 się przepali, wszystkie wejścia mają 0 — a Stop (NC) zatrzymuje maszynę: tak działa fail-safe.'
	},
	{
		question:
			'Przez który zacisk listwy -X1 sygnał czujnika -B1 (żyła BK) idzie do sterownika? Kliknij ten zacisk.',
		answer: 'x1-5',
		hint: 'Czujnik PNP ma trzy żyły: BN (+24 V), BU (0 V), BK (sygnał). Pomaga schemat listwy -X1.',
		explanation:
			'BK przez -X1:5 na -A1:I0.2. BN i BU idą przez -X1:3 i -X1:4 — z listy zacisków elektryk na obiekcie wie, gdzie co podłączyć.'
	},
	{
		question:
			'Usterka: PLC załącza Q0.0 (dioda na karcie świeci), a -K1 nie przyciąga. Włącz multimetr, zmierz napięcia w punktach pomiarowych na stronie 4 i kliknij przewód, który jest przerwany.',
		answer: 'o2',
		hint: 'Mierz od wyjścia PLC w stronę cewki: tam, gdzie 24 V przechodzi w 0 V, jest przerwa.',
		explanation:
			'Q0.0 = 24 V, -X2:1 = 24 V, -K1:A1 = 0 V: przerwa w przewodzie między zaciskiem -X2:1 a A1 cewki (niedokręcony zacisk albo urwana żyła w korycie).'
	},
	{
		question:
			'Wyłącznik silnikowy zadziałał (przeciążenie). Kliknij aparat, który zadziałał — i sprawdź, na którym wejściu PLC to widać.',
		answer: 'q2',
		hint: 'Silnik jest zabezpieczony na stronie 1, w obwodzie mocy.',
		explanation:
			'-Q2 (/1.3) ma styk pomocniczy 13-14 (/3.4) na wejściu I0.3. Program wie o zadziałaniu zabezpieczenia i daje operatorowi alarm zamiast „silnik nie rusza”.'
	}
];
