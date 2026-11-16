import type { Locale } from '#lib/i18n/i18n.svelte.js';
import type { PathStage } from './path.js';

/*
 * Shorter paths by job role: the same chapters and lessons, in the order of the whole path,
 * but only the ones that role needs first. Each list is `chapter:slug` / `lesson:slug`.
 */

export type RoleId = 'maintenance' | 'programmer' | 'commissioning';

export interface Role {
	id: RoleId;
	icon: string;
	title: Record<Locale, string>;
	/** who it is for and what the job looks like */
	who: Record<Locale, string>;
	steps: string[];
}

const ch = (...slugs: string[]) => slugs.map((s) => `chapter:${s}`);
const ls = (...slugs: string[]) => slugs.map((s) => `lesson:${s}`);

export const ROLES: Role[] = [
	{
		id: 'maintenance',
		icon: '🔧',
		title: { pl: 'Technik utrzymania ruchu', en: 'Maintenance technician' },
		who: {
			pl: 'Maszyna stoi, Ty masz ją uruchomić. Schematy, czujniki, napędy, czytanie programu online i szukanie usterek — bez pisania dużych programów. Ćwicz też w trybie Dyżur.',
			en: 'The machine is down and you get it running. Schematics, sensors, drives, reading the program online and fault finding — without writing big programs. Practise in on-call mode too.'
		},
		steps: [
			...ch('czym-jest-plc', 'cykl-skanowania', 'adresowanie', 'elektryka', 'styki-i-cewki'),
			...ls('first-rung', 'bug-stop-nc'),
			...ch('podtrzymanie'),
			...ls('self-holding', 'bug-double-coil'),
			...ch('timery'),
			...ls('bug-flicker'),
			...ch('liczby-i-analog', 'diagnostyka', 'alarmy-hmi', 'uruchomienie'),
			...ls('press-diagnostics', 'alarm-flood', 'commissioning-conveyor'),
			...ch('falownik'),
			...ls('commissioning-vfd'),
			...ch('bezpieczenstwo-maszyn', 'szafa-sterownicza', 'schematy')
		]
	},
	{
		id: 'programmer',
		icon: '⌨️',
		title: { pl: 'Programista PLC', en: 'PLC programmer' },
		who: {
			pl: 'Piszesz programy nowych maszyn i zmieniasz stare. Języki, struktura projektu, sekwencje, tryby pracy, diagnostyka, standard bloków, praca na cudzym kodzie i TIA Portal.',
			en: 'You write the programs of new machines and change old ones. Languages, project structure, sequences, operating modes, diagnostics, block standards, legacy code and TIA Portal.'
		},
		steps: [
			...ch('czym-jest-plc', 'cykl-skanowania', 'adresowanie', 'styki-i-cewki', 'logika'),
			...ls('first-rung', 'and-or'),
			...ch('podtrzymanie', 'zbocza'),
			...ls('toggle', 'bug-set-reset-order'),
			...ch('timery', 'liczniki'),
			...ls('traffic-light', 'bug-timer-edge'),
			...ch('structured-text', 'organizacja', 'typy-danych'),
			...ls('fb-motor', 'recipe-index', 'recipe-db'),
			...ch('sekwencje', 'tryby-pracy'),
			...ls('drilling-station', 'pneumatic-press', 'press-packml'),
			...ch('diagnostyka'),
			...ls('press-diagnostics', 'std-motor', 'std-conveyors'),
			...ch('tia-portal', 'cudzy-kod', 'zmiany-normy'),
			...ls('stl-pump', 'brownfield-press', 'change-management'),
			...ch('projekt-koncowy'),
			...ls('capstone-mixer')
		]
	},
	{
		id: 'commissioning',
		icon: '🚀',
		title: { pl: 'Inżynier uruchomień', en: 'Commissioning engineer' },
		who: {
			pl: 'Jeździsz na obiekty i uruchamiasz maszyny: sprzęt i adresy, okablowanie, napędy, regulacja, sieci, bezpieczeństwo, FAT/SAT. Programu nie piszesz od zera, ale musisz go rozumieć i poprawić na miejscu.',
			en: 'You travel to sites and commission machines: hardware and addresses, wiring, drives, control loops, networks, safety, FAT/SAT. You do not write the program from scratch, but you must understand and fix it on site.'
		},
		steps: [
			...ch('czym-jest-plc', 'adresowanie', 'elektryka', 'liczby-i-analog', 'regulacja'),
			...ls('oven-pid'),
			...ch('tryby-pracy'),
			...ls('press-packml'),
			...ch('uruchomienie'),
			...ls('commissioning-conveyor', 'commissioning-vfd'),
			...ch('falownik', 'falownik-siec'),
			...ls('vfd-fan', 'drive-profidrive'),
			...ch('ruch-plcopen'),
			...ls('motion-pickplace'),
			...ch('komunikacja', 'sieci-ot'),
			...ls('remote-pump'),
			...ch('bezpieczenstwo-maszyn', 'f-cpu'),
			...ls('f-estop'),
			...ch('sprzet', 'schematy'),
			...ls('hw-config'),
			...ch('tia-portal', 'projekt-koncowy'),
			...ls('capstone-mixer')
		]
	}
];

export const roleOf = (id: string | null | undefined): Role | null =>
	ROLES.find((r) => r.id === id) ?? null;

/** The whole path narrowed to a role: same stages and order, only the role's steps. */
export function rolePath(stages: PathStage[], role: Role | null): PathStage[] {
	if (!role) return stages;
	const keep = new Set(role.steps);
	return stages
		.map((s) => ({ ...s, steps: s.steps.filter((x) => keep.has(`${x.kind}:${x.slug}`)) }))
		.filter((s) => s.steps.length > 0);
}

const KEY = 'plcsim:role';

export function savedRole(storage: Pick<Storage, 'getItem'> = localStorage): RoleId | null {
	try {
		return roleOf(storage.getItem(KEY))?.id ?? null;
	} catch {
		return null;
	}
}

export function saveRole(
	id: RoleId | null,
	storage: Pick<Storage, 'setItem' | 'removeItem'> = localStorage
): void {
	try {
		if (id) storage.setItem(KEY, id);
		else storage.removeItem(KEY);
	} catch {
		// storage unavailable — the choice lasts for this visit only
	}
}
