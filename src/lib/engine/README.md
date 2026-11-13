# PLC engine

Framework-free TypeScript core of PLC Sim. It knows nothing about Svelte or the DOM, so it is
unit-tested in Node and will run inside a Web Worker.

```
             ┌────────────── Plc.scan(dt) ───────────────┐
 terminals → │ 1. inputs → I    2. execute(IR)    3. Q → │ → terminals
             └───────────────────────────────────────────┘
```

| File           | Responsibility                                                     |
| -------------- | ------------------------------------------------------------------ |
| `address.ts`   | Siemens-style addresses: `I0.0`, `MW10`, `MD4`, `T1`, `C2`         |
| `memory.ts`    | I / Q / M areas (big-endian), timer and counter instances          |
| `ir.ts`        | The instruction set every language compiles to                     |
| `vm.ts`        | Stack machine executing the IR, faults, watchdog                   |
| `timers.ts`    | IEC TON / TOF / TP                                                 |
| `counters.ts`  | IEC CTU / CTD / CTUD                                               |
| `validate.ts`  | Load-time checks (ranges, writable areas, jump targets)            |
| `plc.ts`       | The CPU: modes RUN / STOP / FAULT, scan cycle, terminals, snapshot |
| `assembler.ts` | IL-like text → IR, for tests and a "compiled code" view            |

## Example

```ts
import { assemble, Plc } from '#lib/engine/index.js';

const plc = new Plc();
plc.load(
	assemble(`
		LD  I0.0     // start
		OR  Q0.0     // self-holding
		AND I0.1     // stop (NC)
		ST  Q0.0     // motor
		POP
	`)
);
plc.run();
plc.setInput('I0.0', true);
plc.setInput('I0.1', true);
plc.scan(10); // one 10 ms scan
plc.getOutput('Q0.0'); // true
```

Time is always passed in by the caller (`scan(dtMs)`), which makes every test deterministic —
no fake timers needed.
