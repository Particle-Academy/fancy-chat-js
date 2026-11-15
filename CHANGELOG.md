# Changelog

All notable changes to this project are documented here, in
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) format.

**This package is pre-1.0, so breaking changes land in MINOR releases.** The
version number is not a stability promise until 1.0; read the entry.

## [Unreleased]

### Added

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
    `ApprovalRecord` gains an optional `turnId`. It ships as
    `@particle-academy/fancy-chat-js/scripts/check-no-prism.mjs`, so every other
    core chat package runs this one checker rather than a copy.
