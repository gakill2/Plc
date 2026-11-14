import { describe, expect, it } from 'vitest';
import {
	formatIp,
	hostCount,
	isPrivate,
	maskOf,
	parseIp,
	prefixOf,
	sameSubnet,
	subnetInfo
} from './ip.js';
import { healthy, ping, profinetStatus, SCENARIOS, type Network } from './netsim.js';

describe('IPv4', () => {
	it('parses, formats and computes subnets', () => {
		const ip = parseIp('192.168.10.37')!;
		expect(formatIp(ip)).toBe('192.168.10.37');
		expect(parseIp('192.168.10.300')).toBeNull();
		expect(formatIp(maskOf(24))).toBe('255.255.255.0');
		expect(prefixOf(parseIp('255.255.255.240')!)).toBe(28);
		expect(prefixOf(parseIp('255.0.255.0')!)).toBeNull();
		expect(subnetInfo(ip, 28)).toMatchObject({
			network: '192.168.10.32',
			broadcast: '192.168.10.47',
			first: '192.168.10.33',
			last: '192.168.10.46',
			hosts: 14
		});
		expect(hostCount(24)).toBe(254);
		expect(sameSubnet(ip, 24, parseIp('192.168.10.200')!)).toBe(true);
		expect(sameSubnet(ip, 28, parseIp('192.168.10.200')!)).toBe(false);
		expect(isPrivate(parseIp('172.20.1.1')!)).toBe(true);
		expect(isPrivate(parseIp('8.8.8.8')!)).toBe(false);
	});
});

/** Everything the PLC needs: every device pings the PLC and back, Profinet is up. */
function problems(net: Network): string[] {
	const out = net.devices
		.filter((d) => d.id !== 'plc')
		.flatMap((d) => [ping(net, d.id, 'plc'), ping(net, 'plc', d.id)])
		.filter((r) => !r.ok)
		.map((r) => r.text);
	return [
		...out,
		...profinetStatus(net)
			.filter((s) => !s.ok)
			.map((s) => s.text)
	];
}

describe('plant network', () => {
	it('works when healthy, the office is reached through the router', () => {
		expect(problems(healthy())).toEqual([]);
		expect(ping(healthy(), 'scada', 'drive').ok).toBe(false); // the drive has no gateway
	});

	it.each(SCENARIOS.map((s) => [s.id, s] as const))('%s shows a symptom', (_id, s) => {
		const net = s.network();
		expect(problems(net).length).toBeGreaterThan(0);
		expect(net.devices.some((d) => d.id === s.fault.device)).toBe(true);
	});

	it('explains the classic results', () => {
		const dup = SCENARIOS.find((s) => s.id === 'laptop-dup')!.network();
		expect(ping(dup, 'hmi', 'plc').text).toMatch(/konflikt/);
		const gw = SCENARIOS.find((s) => s.id === 'scada-gateway')!.network();
		expect(ping(gw, 'plc', 'scada').text).toMatch(/bramy/);
		expect(ping(gw, 'hmi', 'plc').ok).toBe(true);
		const name = SCENARIOS.find((s) => s.id === 'drive-name')!.network();
		expect(ping(name, 'plc', 'drive').ok).toBe(true);
		expect(profinetStatus(name).find((s) => !s.ok)?.text).toMatch(/drive-conveyor/);
	});
});
