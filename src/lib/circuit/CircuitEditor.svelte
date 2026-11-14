<script lang="ts">
	import {
		Background,
		Controls,
		Panel,
		SvelteFlow,
		type Connection,
		type Edge,
		type Node,
		type NodeTypes
	} from '@xyflow/svelte';
	import '@xyflow/svelte/dist/style.css';
	import type { ProjectState } from '#lib/project/state.svelte.js';
	import type { RuntimeSnapshot } from '#lib/runtime/protocol.js';
	import { setCircuitView } from './context.js';
	import DeviceNode from './DeviceNode.svelte';
	import {
		connect,
		device,
		DEVICES,
		nextLabel,
		normalizeTerminal,
		removeDevice,
		MAIN,
		portOf,
		portsOf,
		removeWire,
		type DeviceType
	} from './model.js';
	import PlcNode from './PlcNode.svelte';
	import { isProcessKind } from '#lib/processes/models.js';
	import { PLANTS } from '#lib/processes/plants.js';
	import type { CircuitSim } from './sim.svelte.js';
	import WireEdge from './WireEdge.svelte';

	type Props = {
		project: ProjectState;
		sim: CircuitSim;
		snapshot: RuntimeSnapshot | null;
		locked: boolean;
	};
	let { project, sim, snapshot, locked }: Props = $props();

	setCircuitView({
		get project() {
			return project;
		},
		get sim() {
			return sim;
		},
		get snapshot() {
			return snapshot;
		},
		get locked() {
			return locked;
		}
	});

	// PlcNode takes no props, so it needs a cast to fit NodeTypes.
	const nodeTypes = { plc: PlcNode, device: DeviceNode } as unknown as NodeTypes;
	const edgeTypes = { wire: WireEdge };
	const circuit = $derived(project.circuit);

	let nodes = $state.raw<Node[]>([]);
	let edges = $state.raw<Edge[]>([]);

	// The circuit model is the source of truth; the flow's nodes/edges are rebuilt from it.
	$effect(() => {
		nodes = [
			{ id: 'plc', type: 'plc', position: { ...circuit.plc }, data: {}, deletable: false },
			...circuit.devices.map((d) => ({
				id: d.id,
				type: 'device',
				position: { x: d.x, y: d.y },
				data: { deviceId: d.id }
			}))
		];
	});

	$effect(() => {
		edges = circuit.wires.flatMap((w): Edge[] => {
			const d = circuit.devices.find((x) => x.id === w.device);
			if (!d) return [];
			const data = { terminal: w.terminal };
			const port = portOf(d.type, w.port);
			if (!port) return [];
			return port.io === 'input'
				? [
						{
							id: w.id,
							type: 'wire',
							source: d.id,
							sourceHandle: port.id === MAIN ? 'out' : port.id,
							target: 'plc',
							targetHandle: w.terminal,
							data
						}
					]
				: [
						{
							id: w.id,
							type: 'wire',
							source: 'plc',
							sourceHandle: w.terminal,
							target: d.id,
							targetHandle: 'in',
							data
						}
					];
		});
	});

	/** Which device and terminal a connection joins, if it is a valid one. */
	function parse(
		c: Connection | Edge
	): { deviceId: string; terminal: string; port: string } | null {
		const toPlc = c.target === 'plc';
		const deviceId = toPlc ? c.source : c.target;
		const terminal = normalizeTerminal((toPlc ? c.targetHandle : c.sourceHandle) ?? '');
		const d = circuit.devices.find((x) => x.id === deviceId);
		if (!d || !terminal) return null;
		const handle = (toPlc ? c.sourceHandle : c.targetHandle) ?? '';
		const port = portsOf(d.type).find(
			(p) => (p.id === MAIN ? (p.io === 'input' ? 'out' : 'in') : p.id) === handle
		);
		if (!port) return null;
		const area = port.io === 'input' ? 'I' : 'Q';
		return terminal.startsWith(area) ? { deviceId, terminal, port: port.id } : null;
	}

	function addDevice(type: DeviceType) {
		const io = DEVICES[type].io;
		const x = io === 'input' ? circuit.plc.x - 280 : circuit.plc.x + 380;
		const column = circuit.devices.filter((d) => DEVICES[d.type].io === io);
		const y = column.length ? Math.max(...column.map((d) => d.y)) + 160 : circuit.plc.y;
		circuit.devices.push(
			device(type, nextLabel(circuit, type), x, y, {
				...(type === 'lamp' ? { color: 'green' as const } : {}),
				...(DEVICES[type].defaultNc ? { nc: true } : {})
			})
		);
	}
</script>

<div class="h-full w-full">
	<SvelteFlow
		bind:nodes
		bind:edges
		{nodeTypes}
		{edgeTypes}
		colorMode="dark"
		fitView
		minZoom={0.3}
		nodesConnectable={!locked}
		deleteKey={locked ? null : ['Delete', 'Backspace']}
		isValidConnection={(c) => !locked && parse(c) !== null}
		onconnect={(c) => {
			const p = parse(c);
			if (p) connect(circuit, p.deviceId, p.terminal, p.port);
		}}
		ondelete={({ nodes: deletedNodes, edges: deletedEdges }) => {
			deletedEdges.forEach((e) => removeWire(circuit, e.id));
			deletedNodes.forEach((n) => n.id !== 'plc' && removeDevice(circuit, n.id));
		}}
		onnodedragstop={({ nodes: moved }) => {
			for (const n of moved) {
				if (n.id === 'plc') circuit.plc = { x: n.position.x, y: n.position.y };
				const d = circuit.devices.find((x) => x.id === n.id);
				if (d) Object.assign(d, { x: n.position.x, y: n.position.y });
			}
		}}
		proOptions={{ hideAttribution: true }}
	>
		<Background gap={20} />
		<Controls showLock={false} />
		<Panel position="top-left">
			<div
				class="flex max-w-3xl flex-wrap gap-1 rounded-md border border-slate-700 bg-slate-900/95 p-1 shadow-lg"
			>
				{#if !project.lesson}
					<select
						class="rounded bg-slate-800 px-1 text-xs text-slate-200 disabled:opacity-40"
						aria-label="Plant"
						title="Connect a simulated plant (installation) to the PLC"
						value={project.scenario ?? ''}
						disabled={locked}
						onchange={(e) => {
							const v = e.currentTarget.value;
							project.setScenario(isProcessKind(v) ? v : undefined);
						}}
					>
						<option value="">Plant: none</option>
						{#each PLANTS as p (p.kind)}<option value={p.kind}>Plant: {p.name}</option>{/each}
					</select>
				{/if}
				{#each Object.values(DEVICES) as spec (spec.type)}
					<button
						class="rounded px-2 py-1 text-xs text-slate-200 hover:bg-slate-700 disabled:opacity-40"
						disabled={locked}
						title="Add {spec.name.toLowerCase()} ({spec.io})"
						onclick={() => addDevice(spec.type)}
					>
						<span class={spec.io === 'input' ? 'text-sky-400' : 'text-amber-300'}>+</span>
						{spec.name}
					</button>
				{/each}
			</div>
		</Panel>
		<Panel position="bottom-right">
			<p class="rounded bg-slate-900/90 px-2 py-1 text-[11px] text-slate-400">
				Drag from a device's dot to a PLC terminal to wire it · Select + Del to remove
			</p>
		</Panel>
	</SvelteFlow>
</div>
