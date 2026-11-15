# @particle-academy/fancy-chat-js

The neutral wire contract for the Fancy agent chat framework (council change
CC-fancy-0042). It is what an agent backend emits, what a server stores and
replays, and what a chat UI projects into rows. Zero runtime dependencies,
isomorphic (browser, worker, Node), and **provider-neutral**: it works with any
agent backend, or none. The Prism ecosystem is an optional addon in
`@particle-academy/fancy-chat-prism`; this package never imports it, and a
packaging test enforces that.

The PHP twin, `particle-academy/fancy-chat-php`, passes the same conformance
fixture (`conformance/chat-v1.json`) to the same output, and vendors the same
transition table (`contract/machines.json`). Both files are pinned by SHA-256 in
both repositories.

**Not yet published.** Status: phase P1 of `.ai/plans/agent-chat-framework.md`.

## What it holds

| Module | What |
|---|---|
| Events | v1 envelope (`validateEvent`): `seq` is per thread, monotonic and gapless, and is the only ordering. Core types are a closed set; apps add `x-<app>.<name>`. An unknown major is refused, unknown fields are ignored. |
| Resumable replay | `createSeqLog` / `ingestEvents`: drop duplicates, hold events past a gap and report it, so the transport re-requests `after = lastSeq`. `thread.reset` jumps the cursor. A missed broadcast costs nothing. |
| Parts | `validatePart`, `partToText`, `createPartRegistry`: `text`, `code`, `table`, `chart`, `file`, `image`, `tool-call`, `tool-result`, `card`, `question`, `approval`, plus app kinds. Size, count and depth caps are configurable. |
| Turn machine | `transitionTurn`, from `contract/machines.json`. Only `turn.settled` settles a turn; no client infers it from rows. |
| Delivery | `transitionDelivery`: `sending`, `sent`, `queued`, `steered`, `delivered`, `failed`, `dropped`, `unsent`. |
| HITL | `transitionApproval`, `optionTone` (tone from the option KIND, never its label), `canDecide` (humans only), `isReservedToolName`, `canSubmitAnswer`, `pickActionable` (one actionable item, in-flight lock). |
| Status | `deriveAgentStatus(snapshot, config)`: one pure derivation of `not-started`, `starting`, `working`, `cooling`, `idle`, `sleeping`, `parked`, `paused-limit`, `signed-out`, `broken`, each with recovery action ids the host can override. |
| Typed approval | `matchTypedApproval(text, approval, config)`: OPT-IN per app, off with no phrases by default (`ENGLISH_TYPED_APPROVAL_PHRASES` is there to opt into). Exact phrases after NFKC, case, spacing and trailing-punctuation folding; picks a one-time option only, never "always", never edit. |
| Undo window | `undoWindow(entry, now)`: time left and whether a revert may still land. Shut at the deadline and on an unreadable one. The projection lets only a human revert. |
| Plan-step HITL | `checkPlanUpdate(prev, next, approvals)`: a held step releases only through its approval; refused approvals allow only skipped or failed. The projection refuses any other release. |
| Edit and resend | The projection records each superseded branch in `state.branches`; the HOST's policy decides (branch, the default, keeps it; truncate retracts it on the server). |
| Projection | `projectThread(events)` / `applyEvent(state, event)`: messages, one merged thinking block per run, tool rows, plans and HITL placements. The state is plain JSON and is the snapshot format. |

## Two rules the projection enforces

- **A decision or answer counts only from a human.** `approval.decided` and
  `question.answered` are applied only when the event's actor is a human and the
  recorded decider is that same human. Anything else is counted as illegal and
  changes nothing.
- **Approval and question parts come only from server records.** An agent-origin
  part of either kind fails validation, and so do raw ECharts options: an agent
  may only send the neutral chart spec.

## Use

```ts
import { createSeqLog, ingestEvents, emptyThreadState, applyEvent, rowsOf } from "@particle-academy/fancy-chat-js";

let log = createSeqLog();
const state = emptyThreadState();

function onEvents(batch) {
  const r = ingestEvents(log, batch);
  log = r.log;
  for (const e of r.applied) applyEvent(state, e);
  if (r.missing) refetch({ after: r.missing.after });
  render(rowsOf(state));
}
```

## Installing from git

Until the first npm publish, install from git over HTTPS, pinned to a commit
(`git+https://github.com/Particle-Academy/fancy-chat-js.git#<sha>`). npm builds
`dist` in `prepare`. Under `ignore-scripts=true` it does not, and the package
arrives without `dist`; no install hook can warn, because `ignore-scripts` skips
those too. Check with:

```bash
npx fancy-chat-check-install
```

It exits 1 and names every `@particle-academy` package whose `main`, `module` or
`exports` files are missing. npm records such a dependency in the lockfile as
`git+ssh://git@github.com/...`; a machine without a GitHub key still installs, over
HTTPS, because the repository is public.

## Develop

```bash
npm install
npm test          # vitest: the conformance fixture, resume, parts, packaging
npm run lint      # tsc --noEmit
npm run sabotage  # breaks one clause at a time; the suite must notice each
```

MIT licence.
