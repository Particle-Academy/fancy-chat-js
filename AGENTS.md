# Using @particle-academy/fancy-chat-js — guide for agents

How an agent installs and uses this package in a consumer app. What the package
is, is in [README.md](./README.md). Notes for working ON this repo's code are in
[CONTRIBUTING.md](./CONTRIBUTING.md).

## Install

**Not yet published to npm.** Until then, install from git over HTTPS, pinned to a
commit:

```bash
npm install "git+https://github.com/Particle-Academy/fancy-chat-js.git#<sha>"
```

`dist/` is committed, so a git install builds nothing. After installing,
`npx fancy-chat-check-install` checks every `@particle-academy` package's entry
files. Node `>=22`. Zero runtime dependencies.

## Find it on the Fancy MCP server

The catalog server is `https://ui.particle.academy/mcp` (streamable HTTP, no API
key; MCP id `fancy-ui`). This package is not yet listed there; it appears once
published. Find it then with `search-backend-packages` (stack `node`) or
`search-components`.

## API essentials

- **Replay:** `createSeqLog()` + `ingestEvents(log, batch)` drop duplicates, hold
  events past a gap and report it (`r.missing.after`), so the transport re-requests
  from `lastSeq`.
- **Projection:** `emptyThreadState()`, `applyEvent(state, event)`,
  `projectThread(events)`, `rowsOf(state)`. The state is plain JSON and is the
  snapshot format.
- **Validation:** `validateEvent`, `validatePart`, `partToText`,
  `createPartRegistry`. Apps add their own event types as `x-<app>.<name>`.
- **Machines:** `transitionTurn`, `transitionDelivery`, `transitionApproval`,
  driven by `contract/machines.json` (exported as
  `@particle-academy/fancy-chat-js/contract/machines.json`).
- **HITL:** `canDecide`, `canSubmitAnswer`, `isReservedToolName`, `pickActionable`,
  `optionTone`. **Status:** `deriveAgentStatus(snapshot, config)`.
- **Opt-in helpers:** `matchTypedApproval` (off, no phrases by default),
  `undoWindow`, `checkPlanUpdate`.

The usage example in the README shows the ingest, apply and render loop.

## Traps

- **Only `turn.settled` settles a turn.** Never infer a settled turn from rows.
- **A decision or answer counts only from a human.** `approval.decided` and
  `question.answered` from any other actor are counted as illegal and change
  nothing.
- **Approval and question parts come only from server records.** An agent-origin
  part of either kind fails validation, and so do raw ECharts options: an agent may
  only send the neutral chart spec.
- `seq` is per thread, monotonic and gapless, and is the only ordering.
