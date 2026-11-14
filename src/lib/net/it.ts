/** MQTT topic matching and an OT firewall exercise, for the "above the PLC" chapters. */

/* ---------- MQTT ---------- */

/** Does a subscription filter (with + and # wildcards) match a topic? */
export function topicMatches(filter: string, topic: string): boolean {
	const f = filter.split('/');
	const t = topic.split('/');
	for (let i = 0; i < f.length; i++) {
		if (f[i] === '#') return i === f.length - 1;
		if (i >= t.length) return false;
		if (f[i] !== '+' && f[i] !== t[i]) return false;
	}
	return f.length === t.length;
}

export const validFilter = (filter: string) =>
	filter.length > 0 &&
	filter
		.split('/')
		.every((p, i, all) =>
			p === '#' ? i === all.length - 1 : !p.includes('#') && (p === '+' || !p.includes('+'))
		);

/* ---------- firewall between IT and OT ---------- */

export type Zone = 'office' | 'dmz' | 'ot' | 'internet' | 'vendor';

export const ZONES: Record<Zone, string> = {
	office: 'Biuro (IT)',
	dmz: 'DMZ przemysłowa',
	ot: 'Sieć maszyn (OT)',
	internet: 'Internet',
	vendor: 'Serwis zewnętrzny (VPN)'
};

export interface Flow {
	id: string;
	from: Zone;
	to: Zone;
	service: string;
	what: string;
	/** should a well-designed firewall allow it? */
	allow: boolean;
	why: string;
}

export const FLOWS: Flow[] = [
	{
		id: 'scada-plc',
		from: 'dmz',
		to: 'ot',
		service: 'OPC UA, TCP 4840',
		what: 'Serwer SCADA / historian w DMZ czyta dane z PLC',
		allow: true,
		why: 'Jedyne potrzebne połączenie do OT: konkretny serwer, konkretny port, tylko odczyt danych procesu.'
	},
	{
		id: 'office-historian',
		from: 'office',
		to: 'dmz',
		service: 'HTTPS, TCP 443',
		what: 'Kierownik w biurze ogląda raporty z historiana',
		allow: true,
		why: 'Biuro widzi dane w DMZ — nigdy bezpośrednio maszyny.'
	},
	{
		id: 'office-plc',
		from: 'office',
		to: 'ot',
		service: 'S7 / Profinet, TCP 102',
		what: 'Komputer w biurze łączy się bezpośrednio z PLC',
		allow: false,
		why: 'Ruch z IT prosto do OT to najkrótsza droga dla ransomware z poczty do sterownika. Zawsze przez DMZ.'
	},
	{
		id: 'vendor-jump',
		from: 'vendor',
		to: 'dmz',
		service: 'VPN → serwer przesiadkowy (RDP)',
		what: 'Serwisant producenta loguje się na serwer przesiadkowy w DMZ',
		allow: true,
		why: 'Zdalny serwis tak — ale przez VPN, z uwierzytelnianiem wieloskładnikowym, na serwer przesiadkowy, włączany na czas zlecenia i logowany.'
	},
	{
		id: 'vendor-plc',
		from: 'vendor',
		to: 'ot',
		service: 'dowolny',
		what: 'Serwisant łączy się z VPN prosto do sieci maszyn',
		allow: false,
		why: 'Bez kontroli, kto i co robi w sieci maszyn. Zdalny dostęp kończy się w DMZ.'
	},
	{
		id: 'plc-internet',
		from: 'ot',
		to: 'internet',
		service: 'dowolny',
		what: 'Panel HMI pobiera aktualizacje z internetu',
		allow: false,
		why: 'Urządzenia OT nie wychodzą do internetu. Aktualizacje sprawdza się i wgrywa planowo, z DMZ.'
	},
	{
		id: 'ot-dmz-time',
		from: 'ot',
		to: 'dmz',
		service: 'NTP, UDP 123',
		what: 'PLC synchronizuje czas z serwerem w DMZ',
		allow: true,
		why: 'Wspólny czas jest potrzebny do alarmów i historii. Serwer czasu w DMZ, konkretny port.'
	}
];

/** Score a set of decisions: which flows were decided right. */
export function grade(decisions: Record<string, boolean | undefined>) {
	const results = FLOWS.map((f) => ({
		flow: f,
		ok: decisions[f.id] === f.allow,
		decided: decisions[f.id] !== undefined
	}));
	return { results, correct: results.filter((r) => r.ok).length };
}
