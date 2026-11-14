# ADR 0002 — The PLC runs in a Web Worker, with simulated time

**Status:** accepted

## Context

A PLC executes its program in a fixed scan cycle. The UI on the other hand renders at the
display's frame rate and can be busy (dragging nodes, typing). Timers must be exact and
reproducible, both in the app and in automated tests.

## Decision

- The engine never reads a clock. `Plc.scan(dtMs)` receives the elapsed time, so every scan is
  deterministic and unit tests need no fake timers.
- The app runs the engine inside a Web Worker (`src/lib/runtime/plc.worker.ts`). The worker
  converts real time × speed into whole 10 ms scans and posts a snapshot to the UI each frame.
- All worker logic lives in `RuntimeCore`, a plain class tested in Node; the worker file only
  forwards messages and calls `tick()`.
- Plant models (tank, conveyor …) run in the same worker right after each scan, and signals for
  the timing diagram are sampled there too — so nothing is lost at high simulation speed.

## Consequences

- UI work never delays the PLC and vice versa; speed can be changed from ×0.1 to ×10.
- The UI only ever sees immutable snapshots (structured-cloned), which keeps Svelte reactivity
  simple.
- The lesson runner reuses the same engine and plant models headless, so "it passes the tests"
  and "it works when I press the buttons" are the same thing.
