# Changelog

All notable changes to this project are documented here, in
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) format.

**This package is pre-1.0, so breaking changes land in MINOR releases.** The
version number is not a stability promise until 1.0; read the entry.

## [Unreleased]

### Added

- **A turn links to the message that started it.** `turn.started` may carry
  `data.messageId`; when that message is in the log, `TurnEntry.messageId` names it
  and the message's `turnId` is set (unless the message already named a turn).
  `TurnEntry` gains `messageId` (null when no message started it), so a host can
  retry a failed turn with its original input. Fixture `38c2c9b3...`; fancy-chat-php
  takes it.
- **Several thinking blocks per run, in order.** A run that thinks, calls a tool
  and thinks again now projects two thinking rows around the tool row, instead of
  one block merged above it. Each `ThinkingEntry` has a `thinkingId`: the event's
  `data.thinkingId` when it sends one, else the run id for the first block and
  `<runId>#2`, `#3`... after. Without an explicit id, a `thinking.started` or
  `thinking.delta` after the run's block completed opens the next block. A
  non-string `thinkingId` is illegal. Rows key thinking by `thinkingId`.
  **Changed shape:** the first block's id is still the run id, so a host that
  looked a block up by run id still finds the first one; a host that relied on one
  merged block per run now sees the later ones as their own rows.
- **`durationExact` on a tool row.** `false` when the backend could only bound the
  duration (`tool.result` `durationExact: false`), so a UI can show "at most";
  anything else, including absence, is `true`.
- **`fancy-chat-check-install`** (a bin, committed source, needs no build). A git
  install under `ignore-scripts=true` skips `prepare` and arrives with no `dist`;
  no postinstall can warn, because `ignore-scripts` skips that too. Run
  `npx fancy-chat-check-install` from the host's root: it checks every installed
  `@particle-academy` package's `main`, `module` and `exports` files, names each
  missing one with the cause, and exits 1. Finding no packages fails too.
- Fixture `7d382bf7...`; fancy-chat-php takes it.

- **First release: the neutral agent-chat wire contract v1** (council change
  CC-fancy-0042). Nothing to migrate; this is new.
  - The v1 event envelope with a closed core type set and `x-<app>.<name>`
    extensions; an unknown major is refused and unknown fields are ignored.
  - Resumable replay on the client: `createSeqLog` / `ingestEvents` drop
    duplicates, hold events past a gap and report it, and honour
    `thread.reset`.
  - Typed message parts (`text`, `code`, `table`, `chart`, `file`, `image`,
    `tool-call`, `tool-result`, `card`, `question`, `approval`) with an app part
    registry, plain-text forms and configurable size, count and depth caps.
    Charts take the neutral spec; raw ECharts options are accepted only from
    server code.
  - The turn, delivery and approval machines in one shared table,
    `contract/machines.json`.
  - HITL helpers: human-only `canDecide`, reserved confirmation tool names,
    `canSubmitAnswer`, single-actionable `pickActionable`, and button tone from
    the option kind.
  - `deriveAgentStatus`, one pure status derivation with host-overridable
    recovery actions.
  - `projectThread` / `applyEvent`: a pure, idempotent projection into rows.
    Decisions and answers count only from a human actor.
  - The shared conformance fixture `conformance/chat-v1.json`, which
    `particle-academy/fancy-chat-php` passes to the same output.
  - A packaging check that fails on any Prism dependency, import or bundled
    module, with a negative control that proves it fires.
  - Typed approval (`matchTypedApproval`), opt-in per app: off and with no
    phrases until the host sets them. A typed phrase picks a one-time option
    only.
  - The undo window (`undoWindow`, and `undo.*` rows in the projection). Only
    a human reverts, and a window closes once.
  - Plan-step HITL (`checkPlanUpdate`): a held step releases only through its
    approval, and the projection refuses any other release.
  - Edit and resend: the projection records each superseded branch in
    `state.branches` for the host's policy (branch by default, or truncate).
  - `isTimestamp`, the one timestamp check every `at` and deadline uses.
  - The `decided` delivery state: the server took the message as a typed
    decision (`sent` or `queued` --decide--> `decided`, final), so it was never
    delivered to the agent.
  - `turnsToCancelForBranch(state, supersededId)`: the unsettled turns a
    truncated branch must cancel, through its messages or its approvals.
    `ApprovalRecord` gains an optional `turnId`.
  - Tool output inline: `tool.result` may carry `output` (the result text, or a
    failure's own words) and `outputLanguage` (code, e.g. `json`). The projection
    keeps both on the tool row (`null` when absent or not text). It is plain text:
    render it as text or code, never HTML. The server bounds it and sets
    `truncated`; `outputRef` points at the rest.
  - Installable from git: `prepare` builds `dist/`, so
    `npm install github:Particle-Academy/fancy-chat-js#<sha>` works before a release. It ships as
    `@particle-academy/fancy-chat-js/scripts/check-no-prism.mjs`, so every other
    core chat package runs this one checker rather than a copy.
