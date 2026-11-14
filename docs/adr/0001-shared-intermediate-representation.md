# ADR 0001 — One intermediate representation for every language

**Status:** accepted

## Context

PLC Sim offers two programming languages, Ladder (LAD) and Structured Text (ST), and more may
follow (FBD, IL). Each of them needs to run in the simulator, be checked by the lesson tests and
be shown in the debugging tools (watch table, trend, compiled-code view).

## Decision

Every language compiles to the same small instruction set (`src/lib/engine/ir.ts`), executed by
one stack-machine VM. The IR is modelled on Instruction List: a stack of booleans (the RLO),
bit loads/stores, IEC timers and counters, memory-to-memory arithmetic and jumps. Two probe
instructions (`TAP`, `LDT`) record power flow for the graphical editor.

## Consequences

- The VM, timers, counters, forcing, tracing and the lesson runner are written and tested once.
- A new language is "only" a compiler; ST was added in stage 6 without touching the engine.
- Lessons can be solved in either language — the tests run against IR, not source.
- The IR can be shown to students ("what does my ladder compile to?"), which is itself a
  teaching tool. A text assembler/disassembler keeps it readable and makes tests concise.
- Numeric expressions in ST need temporaries in the marker area, because the IR has no numeric
  stack. This is acceptable for a teaching tool and mirrors how many real PLCs work.
