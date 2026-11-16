# AGENTS.md — fancy-chat-js

`CLAUDE.md` is a symlink to this file.

**This file describes THIS REPO'S CODE and nothing else.** Process rules live in
the envelope's `RULES.md` and must never be copied here.

## What this package is

The agent-chat wire contract v1 (CC-fancy-0042): the thread log a server projects
Prism Harness runs into. The one contract every server implements (fancy-chat-php
today, a Node twin next). Zero runtime dependencies and isomorphic, because the UI
reads it in the browser.

## Layout

| file | what lives there |
|---|---|
| `contract/machines.json` | The ONE transition table: turn, delivery, approval, option kinds, reserved tool names. fancy-chat-php vendors this file. |
| `conformance/chat-v1.json` | Shared fixture cases. Each section lists the legs (`js`, `php`) that must pass it. fancy-chat-php vendors this file. |
| `src/events.ts` | Envelope validation and the closed event-type set. |
| `src/machines.ts` | Runners over `machines.json`. Encodes no transition of its own. |
| `src/parts.ts` | Part validation, plain-text forms, the app part registry, limits. |
| `src/hitl.ts` | Human-only decisions, reserved tool names, answer checks, single actionable. |
| `src/status.ts` | `deriveAgentStatus`, pure (it never reads a clock). |
| `src/sequence.ts` | Client-side replay: dedupe, gap hold, reset. |
| `src/typed-approval.ts` | The deterministic typed-approval matcher. Off and phraseless by default. |
| `src/undo.ts`, `src/plan.ts` | The undo window and the held-step release rule. |
| `src/projection.ts` | The reducer and rows. The state is plain JSON and IS the snapshot format. |

## Invariants (each has a test, and a sabotage entry that proves it)

1. **Change a fixture or `machines.json`, re-pin BOTH legs.** The SHA-256 (CRLF
   folded to LF) is pinned in `tests/fixtures.ts` here and in fancy-chat-php.
   A change that lands in one repo only fails the other's suite, by design.
2. **Only a human decides.** `canDecide` requires `kind === "human"` and a
   non-empty id. The reducer additionally requires the event actor to be that
   same human.
3. **Only `turn.settled` settles a turn.** A `turn.transition` carrying a
   settling action is illegal, and so is a `turn.settled` carrying a
   non-settling one.
4. **The reducer is idempotent.** An event at or below `lastSeq` is a no-op.
   Illegal events bump `illegal` and change nothing else.
5. **Agent-origin parts can never be HITL parts or raw ECharts options.**
6. **Keep zero runtime dependencies, and import only own modules.** It runs in
   browsers and workers. Prism's types are not copied here; nothing here reads them.
7. **PHP parity.** Rows, turns and the snapshot must come out identical in PHP:
   every field is present, `null` rather than absent. Do not add an optional
   field to a row.

## Commands

`npm test`, `npm run lint`, `npm run build`, `node tests/sabotage.mjs`.
