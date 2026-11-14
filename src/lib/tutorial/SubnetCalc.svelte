<script lang="ts">
	import { bits, isPrivate, maskOf, parseIp, sameSubnet, subnetInfo } from '#lib/net/ip.js';

	let address = $state('192.168.10.37');
	let prefix = $state(24);
	let other = $state('192.168.10.200');

	const ip = $derived(parseIp(address));
	const ip2 = $derived(parseIp(other));
	const info = $derived(ip === null ? null : subnetInfo(ip, prefix));
	const ipBits = $derived(ip === null ? '' : bits(ip));
	const maskBits = $derived(bits(maskOf(prefix)));
	/** split a dotted binary string into network / host parts at the prefix */
	const split = (b: string) => {
		let seen = 0;
		let cut = b.length;
		for (let i = 0; i < b.length; i++) {
			if (b[i] === '.') continue;
			if (seen === prefix) {
				cut = i;
				break;
			}
			seen++;
		}
		return [b.slice(0, cut), b.slice(cut)];
	};
</script>

<figure class="space-y-3 rounded-xl border border-slate-800 bg-slate-900/60 p-4" lang="pl">
	<figcaption class="text-sm font-semibold text-white">Kalkulator podsieci</figcaption>
	<div class="flex flex-wrap items-end gap-3 text-xs">
		<label class="block"
			><span class="text-slate-400">Adres IP</span>
			<input
				class="mt-0.5 block w-36 rounded border border-slate-700 bg-slate-900 px-2 py-1 font-mono"
				bind:value={address}
				aria-label="Adres IP"
			/></label
		>
		<label class="block"
			><span class="text-slate-400">Prefiks /{prefix} = {info?.mask ?? ''}</span>
			<input
				class="mt-1.5 block w-48"
				type="range"
				min="8"
				max="30"
				bind:value={prefix}
				aria-label="Prefiks"
			/></label
		>
		<label class="block"
			><span class="text-slate-400">Drugie urządzenie</span>
			<input
				class="mt-0.5 block w-36 rounded border border-slate-700 bg-slate-900 px-2 py-1 font-mono"
				bind:value={other}
				aria-label="Drugi adres IP"
			/></label
		>
	</div>
	{#if ip === null || !info}
		<p class="text-xs text-red-300">To nie jest poprawny adres IPv4 (cztery liczby 0 … 255).</p>
	{:else}
		{@const [ipNet, ipHost] = split(ipBits)}
		{@const [mNet, mHost] = split(maskBits)}
		<div class="overflow-x-auto rounded bg-slate-950 p-2 font-mono text-xs">
			<p>
				<span class="inline-block w-14 text-slate-500">IP</span><span class="text-sky-300"
					>{ipNet}</span
				><span class="text-amber-300">{ipHost}</span>
			</p>
			<p>
				<span class="inline-block w-14 text-slate-500">maska</span><span class="text-sky-300"
					>{mNet}</span
				><span class="text-slate-500">{mHost}</span>
			</p>
			<p class="mt-1 text-[10px] text-slate-500">
				<span class="text-sky-300">część sieci</span> ·
				<span class="text-amber-300">część hosta</span>
			</p>
		</div>
		<dl class="grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4" data-testid="subnet-info">
			<dt class="text-slate-400">Adres sieci</dt>
			<dd class="font-mono text-white">{info.network}</dd>
			<dt class="text-slate-400">Broadcast</dt>
			<dd class="font-mono text-white">{info.broadcast}</dd>
			<dt class="text-slate-400">Hosty</dt>
			<dd class="font-mono text-white">{info.first ?? '—'} … {info.last ?? '—'}</dd>
			<dt class="text-slate-400">Liczba hostów</dt>
			<dd class="font-mono text-white">{info.hosts}</dd>
		</dl>
		{#if info.reserved}
			<p class="text-xs text-amber-300">
				Ten adres to adres sieci albo broadcast — nie można go nadać urządzeniu.
			</p>
		{/if}
		{#if !isPrivate(ip)}
			<p class="text-xs text-amber-300">
				To nie jest adres prywatny (10/8, 172.16/12, 192.168/16) — w sieci maszyny używa się
				prywatnych.
			</p>
		{/if}
		{#if ip2 !== null}
			<p class="text-xs" role="status">
				{other} jest
				{#if sameSubnet(ip, prefix, ip2)}<b class="text-emerald-300">w tej samej podsieci</b> — rozmawiają
					bezpośrednio.
				{:else}<b class="text-red-300">w innej podsieci</b> — potrzebna brama (router).{/if}
			</p>
		{/if}
	{/if}
</figure>
