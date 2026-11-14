import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import adapter from '@sveltejs/adapter-cloudflare';
import { sveltekit } from '@sveltejs/kit/vite';

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},

			// Cloudflare Workers: prerendered pages are served as static assets,
			// the rest (e.g. /editor/[id]) goes through the worker. Config: wrangler.jsonc.
			adapter: adapter()
		})
	],
	test: {
		expect: { requireAssertions: true },
		passWithNoTests: true,
		coverage: {
			provider: 'v8',
			include: [
				'src/lib/engine/**/*.ts',
				'src/lib/ladder/**/*.ts',
				'src/lib/runtime/core.ts',
				'src/lib/circuit/model.ts',
				'src/lib/symbols/**/*.ts',
				'src/lib/project/project.ts',
				'src/lib/monitor/watch.ts',
				'src/lib/runtime/trace.ts',
				'src/lib/processes/models.ts',
				'src/lib/lessons/runner.ts',
				'src/lib/lessons/lessons.ts'
			],
			exclude: [
				'**/*.spec.ts',
				'src/lib/engine/index.ts',
				'src/lib/engine/types.ts',
				'src/lib/engine/ir.ts',
				'**/*.svelte.ts',
				'src/lib/ladder/context.ts',
				'src/lib/ladder/monitor.ts'
			],
			thresholds: { lines: 90, functions: 90, branches: 85, statements: 90 }
		},
		projects: [
			{
				extends: './vite.config.ts',
				test: {
					name: 'client',
					browser: {
						enabled: true,
						provider: playwright(),
						instances: [{ browser: 'chromium', headless: true }]
					},
					include: ['src/**/*.svelte.{test,spec}.{js,ts}'],
					exclude: ['src/lib/server/**']
				}
			},

			{
				extends: './vite.config.ts',
				test: {
					name: 'server',
					environment: 'node',
					include: ['src/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
				}
			}
		]
	}
});
