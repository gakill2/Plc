/**
 * A small plant network for the "why can't the PLC see the drive?" game: devices on a managed
 * switch with VLANs, a router to the office, Profinet device names — and one thing broken.
 */
import { formatIp, parseIp, sameSubnet } from './ip.js';

export type DeviceKind = 'plc' | 'hmi' | 'drive' | 'io' | 'laptop' | 'router' | 'scada';

export interface NetDevice {
	id: string;
	label: string;
	kind: DeviceKind;
	ip: string;
	prefix: number;
	gateway: string;
	/** switch port VLAN */
	vlan: number;
	/** cable plugged and link up */
	link: boolean;
	/** Profinet device name (IO devices) */
	pnName?: string;
}

export interface Network {
	devices: NetDevice[];
	/** Profinet IO devices the PLC project expects, by device name */
	expected: { name: string; device: string }[];
	/** router interfaces: VLAN → its IP / prefix */
	router: { vlan: number; ip: string; prefix: number }[];
}

export type FaultKind = 'ip' | 'mask' | 'gateway' | 'duplicate' | 'vlan' | 'cable' | 'name';

export const FAULT_TEXT: Record<FaultKind, string> = {
	ip: 'adres IP z innej podsieci',
	mask: 'zła maska podsieci',
	gateway: 'brak / zła brama domyślna',
	duplicate: 'zduplikowany adres IP',
	vlan: 'port switcha w złym VLAN-ie',
	cable: 'odłączony kabel (brak linku)',
	name: 'zła nazwa urządzenia Profinet'
};

const ip = (s: string) => parseIp(s) ?? -1;

/** Can `from` deliver a packet to `addr` and get it back? Returns a ping-like result. */
export function ping(net: Network, fromId: string, toId: string): { ok: boolean; text: string } {
	const from = net.devices.find((d) => d.id === fromId)!;
	const to = net.devices.find((d) => d.id === toId)!;
	const target = `ping ${to.ip} (${to.label})`;
	if (!from.link)
		return {
			ok: false,
			text: `${target}: brak połączenia sieciowego na ${from.label} (link down)`
		};
	const dup = net.devices.filter(
		(d) => d.ip === to.ip && d.id !== to.id && d.link && d.vlan === to.vlan
	);
	const reach = (a: NetDevice, b: NetDevice): boolean => {
		if (!b.link) return false;
		// same subnet from a's point of view → straight to b's MAC, needs the same VLAN
		if (sameSubnet(ip(a.ip), a.prefix, ip(b.ip))) return a.vlan === b.vlan;
		// otherwise through a's gateway: a router interface in a's VLAN with that address
		const gw = net.router.find((r) => r.vlan === a.vlan && r.ip === a.gateway);
		if (!gw || !sameSubnet(ip(a.ip), a.prefix, ip(gw.ip))) return false;
		const out = net.router.find((r) => sameSubnet(ip(r.ip), r.prefix, ip(b.ip)));
		return !!out && out.vlan === b.vlan;
	};
	if (dup.length) {
		const who = [to, ...dup].map((d) => d.label).join(' / ');
		return {
			ok: false,
			text: `${target}: odpowiedzi raz od jednego, raz od drugiego urządzenia (${who}) — konflikt adresu`
		};
	}
	if (!sameSubnet(ip(from.ip), from.prefix, ip(to.ip)) && !from.gateway)
		return {
			ok: false,
			text: `${target}: sieć docelowa nieosiągalna (${from.label} nie ma bramy domyślnej)`
		};
	if (!reach(from, to) || !reach(to, from))
		return { ok: false, text: `${target}: upłynął limit czasu żądania` };
	return { ok: true, text: `${target}: odpowiedź, czas < 1 ms, TTL = 64` };
}

/** What the PLC's Profinet diagnostics say about its IO devices. */
export function profinetStatus(net: Network): { name: string; ok: boolean; text: string }[] {
	const plc = net.devices.find((d) => d.kind === 'plc')!;
	return net.expected.map((e) => {
		const dev = net.devices.find((d) => d.pnName === e.name && d.vlan === plc.vlan && d.link);
		if (!dev)
			return {
				name: e.name,
				ok: false,
				text: `${e.name}: urządzenie nie znalezione (brak odpowiedzi DCP na tę nazwę)`
			};
		return { name: e.name, ok: true, text: `${e.name}: wymiana danych OK (${dev.label})` };
	});
}

/* ---------- scenarios ---------- */

export interface Scenario {
	id: string;
	title: string;
	/** the call from the plant */
	report: string;
	fault: { device: string; kind: FaultKind };
	explanation: string;
	network: () => Network;
}

/** The healthy machine network: OT VLAN 10 (192.168.10.0/24), office VLAN 20 (10.20.0.0/16). */
export function healthy(): Network {
	return {
		devices: [
			{
				id: 'plc',
				label: 'PLC',
				kind: 'plc',
				ip: '192.168.10.1',
				prefix: 24,
				gateway: '192.168.10.254',
				vlan: 10,
				link: true
			},
			{
				id: 'hmi',
				label: 'Panel HMI',
				kind: 'hmi',
				ip: '192.168.10.10',
				prefix: 24,
				gateway: '192.168.10.254',
				vlan: 10,
				link: true
			},
			{
				id: 'drive',
				label: 'Falownik',
				kind: 'drive',
				ip: '192.168.10.21',
				prefix: 24,
				gateway: '',
				vlan: 10,
				link: true,
				pnName: 'drive-conveyor'
			},
			{
				id: 'io',
				label: 'Wyspa I/O',
				kind: 'io',
				ip: '192.168.10.31',
				prefix: 24,
				gateway: '',
				vlan: 10,
				link: true,
				pnName: 'io-station-1'
			},
			{
				id: 'laptop',
				label: 'Laptop serwisowy',
				kind: 'laptop',
				ip: '192.168.10.200',
				prefix: 24,
				gateway: '192.168.10.254',
				vlan: 10,
				link: true
			},
			{
				id: 'scada',
				label: 'Serwer SCADA (biuro)',
				kind: 'scada',
				ip: '10.20.1.5',
				prefix: 16,
				gateway: '10.20.0.1',
				vlan: 20,
				link: true
			}
		],
		expected: [
			{ name: 'drive-conveyor', device: 'drive' },
			{ name: 'io-station-1', device: 'io' }
		],
		router: [
			{ vlan: 10, ip: '192.168.10.254', prefix: 24 },
			{ vlan: 20, ip: '10.20.0.1', prefix: 16 }
		]
	};
}

const tweak = (id: string, change: Partial<NetDevice>) => (): Network => {
	const n = healthy();
	Object.assign(
		n.devices.find((d) => d.id === id)!,
		change
	);
	return n;
};

export const SCENARIOS: Scenario[] = [
	{
		id: 'hmi-subnet',
		title: 'Panel po wymianie nie widzi sterownika',
		report:
			'Wymieniliśmy uszkodzony panel na nowy z magazynu. Na ekranie wszystkie pola mają „####” i komunikat o braku połączenia z PLC.',
		fault: { device: 'hmi', kind: 'ip' },
		explanation:
			'Nowy panel miał fabryczny adres 192.168.0.10 — inna podsieć niż 192.168.10.0/24. Bez wspólnej podsieci (i bez routingu) panel nie dogada się z PLC.',
		network: tweak('hmi', { ip: '192.168.0.10' })
	},
	{
		id: 'drive-name',
		title: 'Falownik po wymianie: błąd urządzenia Profinet',
		report:
			'Elektryk wymienił falownik na taśmie. PLC świeci na czerwono (BF), w diagnostyce „drive-conveyor: błąd urządzenia”. Ping do falownika… działa?!',
		fault: { device: 'drive', kind: 'name' },
		explanation:
			'Profinet szuka urządzeń po nazwie, nie po IP. Nowy falownik ma nazwę „drive-conveyor-new” — trzeba nadać mu nazwę z projektu (narzędziem DCP), wtedy PLC sam ustawi mu IP.',
		network: tweak('drive', { pnName: 'drive-conveyor-new' })
	},
	{
		id: 'io-cable',
		title: 'Połowa czujników „zgasła”',
		report:
			'Na maszynie nie działają czujniki z jednej strony. W PLC diagnostyka: „io-station-1 nie znalezione”. Operatorzy mówią, że rano była tam ekipa sprzątająca.',
		fault: { device: 'io', kind: 'cable' },
		explanation:
			'Odłączony (lub uszkodzony) kabel do wyspy I/O: brak linku na porcie switcha. Pierwsza rzecz do sprawdzenia: diody LINK/ACT na porcie.',
		network: tweak('io', { link: false })
	},
	{
		id: 'laptop-dup',
		title: 'Sterownik „znika” z sieci co chwilę',
		report:
			'Od kiedy podpięliśmy laptop serwisowy, HMI co kilka sekund traci połączenie z PLC, a potem wraca. Bez laptopa jest spokój.',
		fault: { device: 'laptop', kind: 'duplicate' },
		explanation:
			'Laptop dostał ręcznie ten sam adres co PLC (192.168.10.1). Dwa urządzenia z jednym IP walczą o niego w tablicach ARP — połączenia „skaczą”.',
		network: tweak('laptop', { ip: '192.168.10.1' })
	},
	{
		id: 'scada-gateway',
		title: 'SCADA w biurze nie widzi linii',
		report:
			'Serwer SCADA w biurze przestał zbierać dane z PLC po „porządkach w konfiguracji” PLC. Na hali wszystko działa normalnie.',
		fault: { device: 'plc', kind: 'gateway' },
		explanation:
			'PLC odpowiada do innej podsieci (biuro) przez bramę domyślną. Ktoś ją skasował — w sieci maszyny wszystko działa, ale odpowiedzi do SCADA nie mają którędy wrócić.',
		network: tweak('plc', { gateway: '' })
	},
	{
		id: 'hmi-vlan',
		title: 'Panel nie łączy się po przełożeniu kabla',
		report:
			'Przenieśliśmy panel na drugi koniec maszyny i wpięliśmy go do wolnego gniazda w switchu. Adres IP ten sam, a połączenia brak.',
		fault: { device: 'hmi', kind: 'vlan' },
		explanation:
			'Wolny port switcha był skonfigurowany w VLAN 20 (biuro). Ten sam adres, ta sama podsieć — ale inna sieć logiczna. Port musi być w VLAN 10.',
		network: tweak('hmi', { vlan: 20 })
	},
	{
		id: 'plc-mask',
		title: 'Po wymianie CPU nie da się podłączyć laptopem',
		report:
			'Po wymianie CPU maszyna pracuje, panel działa, ale z laptopa serwisowego nie da się połączyć ze sterownikiem (program nie widzi CPU). SCADA też zgłasza brak danych.',
		fault: { device: 'plc', kind: 'mask' },
		explanation:
			'Nowe CPU ma maskę 255.255.255.240 (/28): za „swoją” sieć uważa tylko adresy 192.168.10.0 … 15. Panel (.10) się mieści, laptop (.200) już nie — odpowiedzi idą na bramę, której CPU w tej masce nie widzi.',
		network: tweak('plc', { prefix: 28 })
	}
];

export const deviceSummary = (d: NetDevice) =>
	`${d.ip}/${d.prefix}${d.gateway ? ` · brama ${d.gateway}` : ''} · VLAN ${d.vlan}${d.pnName ? ` · ${d.pnName}` : ''}${d.link ? '' : ' · brak linku'}`;

export { formatIp };
