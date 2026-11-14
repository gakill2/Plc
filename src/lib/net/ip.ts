/** IPv4 helpers for the networking chapter. Addresses are unsigned 32-bit numbers. */

export function parseIp(text: string): number | null {
	const m = /^\s*(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\s*$/.exec(text);
	if (!m) return null;
	const parts = m.slice(1).map(Number);
	if (parts.some((p) => p > 255)) return null;
	return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

export const formatIp = (n: number) => [24, 16, 8, 0].map((s) => (n >>> s) & 0xff).join('.');

export const maskOf = (prefix: number) => (prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0);

/** Prefix length of a dotted mask, or null if the mask is not contiguous. */
export function prefixOf(mask: number): number | null {
	let p = 0;
	while (p < 32 && (mask >>> (31 - p)) & 1) p++;
	return maskOf(p) === mask >>> 0 ? p : null;
}

export const networkOf = (ip: number, prefix: number) => (ip & maskOf(prefix)) >>> 0;
export const broadcastOf = (ip: number, prefix: number) =>
	(networkOf(ip, prefix) | ~maskOf(prefix)) >>> 0;

/** Usable host addresses (/31 and /32 are special cases, treated as 0 here). */
export const hostCount = (prefix: number) => (prefix >= 31 ? 0 : 2 ** (32 - prefix) - 2);

/** Does `other` lie in the subnet of `ip` / `prefix` (as seen by the owner of `ip`)? */
export const sameSubnet = (ip: number, prefix: number, other: number) =>
	networkOf(ip, prefix) === networkOf(other, prefix);

export const bits = (n: number) =>
	[24, 16, 8, 0].map((s) => ((n >>> s) & 0xff).toString(2).padStart(8, '0')).join('.');

/** RFC 1918 private ranges — what plant networks use. */
export function isPrivate(ip: number): boolean {
	return (
		networkOf(ip, 8) === parseIp('10.0.0.0') ||
		networkOf(ip, 12) === parseIp('172.16.0.0') ||
		networkOf(ip, 16) === parseIp('192.168.0.0')
	);
}

export interface SubnetInfo {
	network: string;
	broadcast: string;
	first: string | null;
	last: string | null;
	hosts: number;
	mask: string;
	/** the address is the network or the broadcast address itself */
	reserved: boolean;
}

export function subnetInfo(ip: number, prefix: number): SubnetInfo {
	const net = networkOf(ip, prefix);
	const bc = broadcastOf(ip, prefix);
	const hosts = hostCount(prefix);
	return {
		network: formatIp(net),
		broadcast: formatIp(bc),
		first: hosts ? formatIp(net + 1) : null,
		last: hosts ? formatIp(bc - 1) : null,
		hosts,
		mask: formatIp(maskOf(prefix)),
		reserved: hosts > 0 && (ip === net || ip === bc)
	};
}
