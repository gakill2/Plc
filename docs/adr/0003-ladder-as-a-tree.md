# ADR 0003 — Ladder rungs are stored as a series–parallel tree

**Status:** accepted

## Context

Classic ladder editors place elements on a free grid and connect them with wires. That is
flexible but makes editing, validation and compilation hard: a grid can contain dangling wires,
short circuits or shapes that have no boolean meaning.

## Decision

A rung is a `Series` of elements; an element can be a `Parallel` block whose branches are again
series. Coils hang off the end of the rung. The editor _draws_ this tree as a ladder diagram, but
the user edits it with structural operations (insert after, add branch, remove) that always keep
it valid. After every edit the tree is normalised (no empty branches, no single-branch blocks).

## Consequences

- Every rung that can be drawn is a valid boolean expression; there is no "broken wiring" state.
- Compilation is a straightforward recursive walk. Parallel branches start from the power
  entering the block (`LDT`), so boxes inside branches (e.g. a timer) see the correct input.
- Some unusual ladder shapes (bridges between branches) cannot be expressed. These are rarely
  taught and are considered bad practice anyway.
