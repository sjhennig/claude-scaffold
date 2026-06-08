# <Subsystem> Spec

<!--
Living doc — Claude updates this at the author's direction whenever the owning
files change. One spec per subsystem. Copy this file to e.g. docs/specs/auth.md
and register it in docs/specs/subsystem-map.json so drift detection can watch it.
Keep it file-path-and-parameter explicit: it earns its place by being more
precise than re-reading the code.
-->

## Purpose

<!-- One paragraph: what this subsystem is responsible for, and what it is NOT. -->

## Owning files

<!-- The exact files this spec governs, each with a one-line role. -->

- `src/path/to/file.ts` — <role>

## Public interface

<!-- Exported functions / types other code depends on, with signatures and the
     meaning of each parameter and return value. -->

```
functionName(param: Type) -> ReturnType   // what it does; what each param means
```

## Invariants & constraints

<!-- Rules that must always hold (ordering, validation, idempotency, limits). -->

-

## Edge cases

<!-- Inputs/states that need deliberate handling, and the expected behavior. -->

-

## Open decisions

<!-- Unresolved questions or deferred tradeoffs. Move resolved ones to NOTES.md. -->

-
