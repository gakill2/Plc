<script lang="ts">
	type Props = { on?: boolean; color?: 'green' | 'amber' | 'red'; label?: string };
	let { on = true, color = 'green', label }: Props = $props();

	const colors = {
		green: 'bg-emerald-400 shadow-emerald-400/60',
		amber: 'bg-amber-400 shadow-amber-400/60',
		red: 'bg-red-500 shadow-red-500/60'
	};
</script>

<span
	class="inline-block size-2.5 rounded-full {on
		? `${colors[color]} shadow-[0_0_8px]`
		: 'bg-slate-600'}"
	role="img"
	aria-label={label ?? (on ? 'on' : 'off')}
></span>
