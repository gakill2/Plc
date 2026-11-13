# PLC Sim

> Learn how a PLC thinks — one scan cycle at a time.

A browser-based PLC simulator for learning industrial automation. Build a circuit with a virtual
controller, push buttons, sensors, lamps and motors, program it in **Ladder Logic** or
**Structured Text**, then run it and watch the controller execute your program scan by scan.

**Live demo:** _coming soon_ · **Status:** stage 3 — circuit editor (devices wired to I/O) and symbol table

## Planned features

- Realistic scan cycle (read inputs → execute → write outputs) with RUN / STOP / STEP
- Ladder editor with live power-flow highlighting
- Structured Text editor with inline compile errors
- IEC timers (TON, TOF, TP) and counters (CTU, CTD, CTUD)
- Circuit editor: wire devices to I/O terminals, interact with them while running
- Watch table with forcing, timing diagram of signals
- Simulated processes: traffic lights, tank filling, sorting conveyor
- Lessons with automatic solution checking

See [PLAN.md](./PLAN.md) for the full plan and roadmap.

## Architecture (short version)

```
Ladder / ST  ──compile──▶  shared IR (instruction list)  ──▶  VM in a Web Worker
                                                             │
UI (Svelte 5) ◀──── memory snapshots every frame ────────────┘
```

The PLC engine is plain TypeScript with no UI dependencies, so it is fully unit-tested in Node —
see [`src/lib/engine`](./src/lib/engine/README.md).

## Tech stack

SvelteKit · Svelte 5 (runes) · TypeScript · Tailwind CSS · Vitest · Playwright · GitHub Actions · Cloudflare Workers

## Getting started

Requires Node 22 (see `.nvmrc`).

```sh
npm install
npm run dev        # dev server
npm test           # unit + component tests
npm run test:coverage  # engine coverage report
npm run check      # type check
npm run lint       # prettier + eslint
npm run build      # static build to ./build
```

## Deployment

Deployed to **Cloudflare Workers** with `@sveltejs/adapter-cloudflare`. Prerendered pages are served
as static assets; client-only routes (the editor) go through the worker. Configuration lives in
`wrangler.jsonc`.

```sh
npx wrangler login   # once
npm run preview      # build + run locally on the Workers runtime
npm run deploy       # build + deploy
```
