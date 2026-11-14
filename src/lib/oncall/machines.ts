/**
 * On-call mode („Dyżur”): a machine that used to work breaks down during the night shift.
 * The program and wiring are right — one component failed. Find which one, as fast as you can.
 */
import type { Fault } from '#lib/circuit/model.js';
import { getLesson } from '#lib/lessons/lessons.js';
import type { LessonTest } from '#lib/lessons/types.js';
import type { Project } from '#lib/project/project.js';

export type Incident = {
	id: string;
	fault: Fault;
	/** Who calls and at what time. */
	caller: string;
	time: string;
	/** What the operator says on the phone — the symptom, never the cause. */
	report: string;
	/** What was really broken — shown once diagnosed. */
	cause: string;
	/** What maintenance does about it. */
	repair: string;
};

export type Machine = {
	id: string;
	name: string;
	area: string;
	/** The lesson whose reference solution (program + circuit) is the healthy machine. */
	lesson: string;
	/** Normal operation, on top of the lesson's tests: every incident must break one of them. */
	tests: LessonTest[];
	incidents: Incident[];
};

export const ONCALL_PREFIX = 'oncall-';

export const MACHINES: Machine[] = [
	{
		id: 'p7',
		name: 'Przenośnik P7',
		area: 'Hala A · pakowanie',
		lesson: 'commissioning-conveyor',
		tests: [
			{
				name: 'Praca ciągła przez 5 s',
				steps: [
					{ label: 'start', actuate: { S1: true }, wait: 100 },
					{
						label: 'puść S1, 5 s pracy',
						actuate: { S1: false },
						wait: 5000,
						expectDevices: { K1: true, H1: true, H2: false }
					}
				]
			}
		],
		incidents: [
			{
				id: 'p7-start',
				fault: { kind: 'wire-break', device: 'S1' },
				caller: 'Operator Kamil',
				time: '02:14',
				report: 'Naciskam Start i nic. Żadna lampka się nie zapala, taśma stoi.',
				cause:
					'Przerwany przewód przycisku Start S1 — wejście I0.0 nie zmienia stanu po wciśnięciu.',
				repair: 'Elektryk wymienia przewód w puszce przy pulpicie.'
			},
			{
				id: 'p7-stop',
				fault: { kind: 'wire-break', device: 'S2' },
				caller: 'Operator Kamil',
				time: '03:40',
				report: 'Taśma stanęła sama w trakcie pracy i nie da się jej uruchomić. Start nie reaguje.',
				cause:
					'Przerwany obwód przycisku Stop S2 (NC). Na I0.1 jest 0, więc program widzi „Stop wciśnięty”. Dzięki podłączeniu NC maszyna zatrzymała się bezpiecznie.',
				repair: 'Wymiana styku NC w przycisku Stop.'
			},
			{
				id: 'p7-sensor',
				fault: { kind: 'stuck-on', device: 'B1' },
				caller: 'Brygadzistka Ola',
				time: '23:05',
				report: 'Zielona lampka „praca” świeci, ale taśma nie jedzie. Na końcu taśmy nic nie leży.',
				cause:
					'Czujnik B1 zgłasza detal cały czas (zabrudzona soczewka / uszkodzony czujnik) — program zatrzymuje taśmę, bo „na końcu jest detal”.',
				repair: 'Czyszczenie soczewki i regulacja czujnika, w razie potrzeby wymiana.'
			},
			{
				id: 'p7-overload',
				fault: { kind: 'overload', device: 'K1' },
				caller: 'Operator Kamil',
				time: '04:22',
				report: 'Taśma rusza, po dwóch sekundach staje i zapala się czerwona lampka.',
				cause:
					'Zadziałał przekaźnik termiczny silnika taśmy (K1). Stycznik się nie trzyma, brak potwierdzenia → program zgłasza awarię po 2 s.',
				repair: 'Sprawdzenie, czy taśma się nie zacina, pomiar prądu silnika, reset termika.'
			},
			{
				id: 'p7-aux',
				fault: { kind: 'aux-contact', device: 'K1' },
				caller: 'Brygadzistka Ola',
				time: '01:50',
				report:
					'Taśma rusza, po dwóch sekundach staje i jest czerwona lampka. Mechanik mówi, że silnik kręcił się normalnie.',
				cause:
					'Spalony styk pomocniczy stycznika K1: silnik pracuje, ale sterownik nie dostaje potwierdzenia na I0.3 i po 2 s zgłasza awarię.',
				repair: 'Wymiana bloku styków pomocniczych na styczniku.'
			},
			{
				id: 'p7-coil',
				fault: { kind: 'wire-break', device: 'K1' },
				caller: 'Operator Kamil',
				time: '05:05',
				report:
					'Po Start świeci zielona lampka, taśma nie rusza, a po dwóch sekundach czerwona lampka.',
				cause:
					'Przerwany przewód cewki stycznika K1: wyjście Q0.0 jest załączone, ale stycznik nie dostaje napięcia.',
				repair: 'Naprawa przewodu między kartą wyjść a cewką K1.'
			},
			{
				id: 'p7-lamp',
				fault: { kind: 'lamp-burnt', device: 'H1' },
				caller: 'Brygadzistka Ola',
				time: '22:30',
				report:
					'Taśma jedzie normalnie, ale zielona lampka „praca” nie świeci. Operatorzy myślą, że linia stoi.',
				cause: 'Spalona żarówka (moduł LED) lampki H1 — wyjście Q0.1 jest załączone.',
				repair: 'Wymiana modułu LED lampki.'
			}
		]
	},
	{
		id: 'po2',
		name: 'Pompa obiegowa PO2',
		area: 'Kotłownia',
		lesson: 'commissioning-vfd',
		tests: [
			{
				name: 'Praca na 35 Hz przez 8 s',
				steps: [
					{ label: 'start', actuate: { S1: true }, wait: 100 },
					{
						label: 'puść S1, 8 s pracy',
						actuate: { S1: false },
						wait: 8000,
						expectDevices: { U1: true, H1: true, H2: false }
					}
				]
			}
		],
		incidents: [
			{
				id: 'po2-trip',
				fault: { kind: 'vfd-trip', device: 'U1' },
				caller: 'Palacz Zbyszek',
				time: '03:15',
				report: 'Pompa rusza, a po chwili staje i świeci awaria. Kwituję — to samo od nowa.',
				cause:
					'Falownik wybija na przeciążenie (F001) zawsze przy rozpędzaniu — zatarte łożysko pompy, silnik nie daje rady.',
				repair: 'Wymiana łożyska pompy. Kwitowanie błędu przy zatrzymanym napędzie.'
			},
			{
				id: 'po2-run',
				fault: { kind: 'wire-break', device: 'U1' },
				caller: 'Palacz Zbyszek',
				time: '00:40',
				report: 'Wciskam Start, falownik jest gotowy, błędu nie ma, a pompa nie kręci.',
				cause:
					'Przerwany przewód sygnału RUN do falownika: wyjście Q0.0 jest załączone, ale falownik go nie widzi.',
				repair: 'Naprawa przewodu RUN na listwie falownika.'
			},
			{
				id: 'po2-atspeed',
				fault: { kind: 'wire-break', device: 'U1', port: 'atSpeed' },
				caller: 'Palacz Zbyszek',
				time: '02:02',
				report:
					'Pompa pracuje i słychać ją normalnie, ale zielona lampka „na obrotach” w ogóle się nie zapala.',
				cause:
					'Przerwany przewód przekaźnika AT SPEED falownika — wejście I0.5 zostaje 0, choć napęd jest na obrotach.',
				repair: 'Naprawa przewodu sygnału zwrotnego.'
			},
			{
				id: 'po2-start',
				fault: { kind: 'wire-break', device: 'S1' },
				caller: 'Palacz Zbyszek',
				time: '05:30',
				report:
					'Pompa się zatrzymała przy zmianie pracy i nie da się jej włączyć. Falownik bez błędu.',
				cause: 'Przerwany przewód przycisku Start S1.',
				repair: 'Wymiana przewodu przycisku.'
			}
		]
	},
	{
		id: 'w1',
		name: 'Wentylator hali C',
		area: 'Hala C · wentylacja',
		lesson: 'vfd-fan',
		tests: [],
		incidents: [
			{
				id: 'w1-fast',
				fault: { kind: 'wire-break', device: 'Fast' },
				caller: 'Mistrz Marek',
				time: '22:10',
				report: 'Przełączam wentylator na „szybko”, a on dalej kręci wolno. Na hali duszno.',
				cause:
					'Przerwany przewód przełącznika Fast — wejście I0.2 zostaje 0, falownik dostaje 20 Hz.',
				repair: 'Naprawa przewodu przełącznika.'
			},
			{
				id: 'w1-reverse',
				fault: { kind: 'stuck-on', device: 'Reverse' },
				caller: 'Mistrz Marek',
				time: '23:45',
				report:
					'Wentylator kręci w drugą stronę — zamiast nawiewać, wyciąga. Przełącznik kierunku stoi na normalnym.',
				cause:
					'Przełącznik Reverse jest uszkodzony i zwiera cały czas — wejście I0.3 = 1, więc program wybiera kierunek wsteczny.',
				repair: 'Wymiana przełącznika kierunku.'
			},
			{
				id: 'w1-trip',
				fault: { kind: 'vfd-trip', device: 'U1' },
				caller: 'Mistrz Marek',
				time: '01:20',
				report: 'Wentylator rusza i zaraz staje. Po Stop i Start to samo.',
				cause:
					'Falownik wybija na przeciążenie przy rozpędzaniu — zablokowany wirnik wentylatora (np. folia w kanale).',
				repair: 'Usunięcie blokady wirnika, kontrola łożysk.'
			}
		]
	}
];

export const getMachine = (id: string) => MACHINES.find((m) => m.id === id) ?? null;

export const machineProjectId = (m: Machine) => `${ONCALL_PREFIX}${m.id}`;

export const machineFromProjectId = (projectId: string) =>
	projectId.startsWith(ONCALL_PREFIX) ? getMachine(projectId.slice(ONCALL_PREFIX.length)) : null;

/** The healthy machine: the lesson's reference program and wiring. */
export function machineProject(m: Machine): Project {
	const lesson = getLesson(m.lesson)!;
	const starter = lesson.starter();
	return {
		...starter,
		name: m.name,
		ladder: lesson.solution(),
		circuit: lesson.solutionCircuit?.() ?? starter.circuit,
		lesson: undefined
	};
}

/** Everything that can be blamed on a device — the diagnosis form's choices. */
export function faultOptions(type: string, label: string): { text: string; fault: Fault }[] {
	const f = (kind: Fault['kind'], text: string, port?: string) => ({
		text,
		fault: { kind, device: label, ...(port ? { port } : {}) }
	});
	switch (type) {
		case 'pushbutton':
		case 'switch':
		case 'selector':
		case 'estop':
			return [f('wire-break', 'przerwany przewód'), f('stuck-on', 'zwarty / zablokowany styk')];
		case 'sensor':
		case 'limit':
			return [f('wire-break', 'przerwany przewód'), f('stuck-on', 'zgłasza obiekt cały czas')];
		case 'contactor':
			return [
				f('overload', 'zadziałał przekaźnik termiczny'),
				f('aux-contact', 'uszkodzony styk pomocniczy'),
				f('wire-break', 'przerwany przewód cewki')
			];
		case 'vfd':
			return [
				f('vfd-trip', 'wybija na przeciążenie (mechanika napędu)'),
				f('wire-break', 'przerwany przewód RUN'),
				f('wire-break', 'przerwany przewód READY', 'ready'),
				f('wire-break', 'przerwany przewód FAULT', 'fault'),
				f('wire-break', 'przerwany przewód AT SPEED', 'atSpeed')
			];
		case 'lamp':
		case 'buzzer':
			return [
				f('lamp-burnt', 'spalona żarówka / sygnalizator'),
				f('wire-break', 'przerwany przewód')
			];
		case 'motor':
			return [f('wire-break', 'przerwany przewód zasilania')];
		default:
			return [];
	}
}

export const sameFault = (a: Fault, b: Fault) =>
	a.kind === b.kind &&
	a.device.toUpperCase() === b.device.toUpperCase() &&
	(a.port ?? 'main') === (b.port ?? 'main');
