# Using @particle-academy/fancy-chat-js — guide for agents

How an agent installs and uses this package in a consumer app. What the package
is, is in [README.md](./README.md). Notes for working ON this repo's code are in
[CONTRIBUTING.md](./CONTRIBUTING.md).

## Install

```bash
npm i @particle-academy/fancy-chat-js
```

With the React surfaces: `npm i @particle-academy/fancy-chat-js @particle-academy/fancy-chat-ui`.
The Laravel server is `composer require particle-academy/fancy-chat-php`. After
installing, `npx fancy-chat-check-install` checks every `@particle-academy`
package's entry files. Node `>=22`. Zero runtime dependencies.

## Find it on the Fancy MCP server

The catalog server is `https://ui.particle.academy/mcp` (streamable HTTP, no API
key; MCP id `fancy-ui`). This package is listed there: find it with
`search-backend-packages` (stack `node`).

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
- **Quick replies:** the `suggestions.updated` event
  (`data: { turnId, items: [{ id, text }] }`) sets `state.suggestions`
  (`{ turnId, items } | null`, also on `projectThread(...).suggestions`).
  `sanitizeSuggestions(raw, limits?, refuse?)` is what a server runs on model output
  before appending (`DEFAULT_SUGGESTION_LIMITS` is `{ maxCount: 3, maxChars: 80 }`);
  `checkSuggestionItems` and `isSuggestionText` are the projection's own checks.
  Types: `Suggestion`, `SuggestionsEntry`, `SuggestionLimits`.

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
- **Quick replies belong to ONE settled turn.** `suggestions.updated` is legal only
  for the newest turn, settled `completed`, from an agent or the server; a human's,
  an older turn's, or one for a turn that parked, failed or was cancelled is counted
  illegal. The next `turn.started` clears them, and so does an empty list. Items are
  plain text: render them as text, and send a pick as an ordinary message. Nothing
  in the contract lets a suggestion decide, answer or call a tool.
