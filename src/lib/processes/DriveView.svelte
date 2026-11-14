<script lang="ts">
	import DrivePanel from '#lib/drive/DrivePanel.svelte';
	import type { DrivePlantState } from './types.js';

	type Props = {
		state: DrivePlantState;
		command: (name: string, value?: unknown) => void;
	};
	let { state, command }: Props = $props();
</script>

<div class="p-6">
	<p class="mb-4 text-xs text-slate-400" lang="pl">
		Napęd na Profinet, telegram standardowy 1: PLC pisze <code class="text-sky-300">STW1</code>
		(QW4) i
		<code class="text-sky-300">NSOLL_A</code> (QW6), napęd odsyła
		<code class="text-emerald-300">ZSW1</code>
		(IW4) i
		<code class="text-emerald-300">NIST_A</code> (IW6). 16#4000 = 100 % = 50 Hz.
	</p>
	<DrivePanel
		drive={state.drive}
		stw={state.stw}
		zsw={state.zsw}
		nist={state.nist}
		params={state.params}
		onParams={(p) => command('params', p)}
		onTrip={() => command('fault')}
	/>
</div>
