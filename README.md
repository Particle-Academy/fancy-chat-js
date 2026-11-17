# @particle-academy/fancy-chat-js

The wire contract of the Fancy agent chat (council change CC-fancy-0042), which is
built on the Prism ecosystem. A chat turn runs on Prism Harness, and the server
projects the run (Harness's `g282.1` RunSteps and its run events) into this thread
log. A server stores and replays the log, and a chat UI projects it into rows. Zero
runtime dependencies and isomorphic (browser, worker, Node), because the UI reads it
in the browser.

It holds no copy of a Prism type. It never reads a RunStep: the server maps them
(`FancyChat\Prism\HarnessBackend` in fancy-chat-php), and the types those come in
are `@particle-academy/prism-harness`'s. prism-graph, prism-memory and the other
extras are optional, and nothing here needs them.

This package is the ONE contract every server implements. The PHP server,
`particle-academy/fancy-chat-php`, passes the same conformance fixture (`conformance/chat-v1.json`) to the same output, and vendors the same
transition table (`contract/machines.json`). Both files are pinned by SHA-256 in
both repositories. A Node server twin, on `@particle-academy/prism-harness` and
`@particle-academy/prism-acp`, is next and will run the same fixtures.

Design: `.ai/plans/agent-chat-on-prism.md` in the Fancy envelope.

<!-- fancy-agents-note:start -->
> **For agents.** This package is listed on the Fancy MCP catalog server at
> `https://ui.particle.academy/mcp` (streamable HTTP, no API key; MCP id `fancy-ui`),
> with install commands and docs, alongside the rest of the kit. How an agent
> installs and uses this package is in [AGENTS.md](https://github.com/Particle-Academy/fancy-chat-js/blob/main/AGENTS.md).
<!-- fancy-agents-note:end -->

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

## Install

```bash
npm i @particle-academy/fancy-chat-js
```

With the React surfaces: `npm i @particle-academy/fancy-chat-js @particle-academy/fancy-chat-ui`. The Laravel server is
`composer require particle-academy/fancy-chat-php`. `npx fancy-chat-check-install` checks every
`@particle-academy` package's entry files after an install. Node `>=22`. Zero
runtime dependencies.

## Develop

```bash
npm install
npm test          # vitest: the conformance fixture, resume, parts, packaging (zero deps)
npm run lint      # tsc --noEmit
npm run sabotage  # breaks one clause at a time; the suite must notice each
```

MIT licence.
