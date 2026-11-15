import MACHINES from "../contract/machines.json";

import type { ApprovalState, DeliveryState, Decision, OptionTone, TurnOutcome, TurnState } from "./types";

/**
 * The one transition table, shared with fancy-chat-php (which vendors the same
 * file and pins its hash). Nothing here may encode a transition the JSON does
 * not hold.
 */
export const machines = MACHINES;

interface Row {
  from: string;
  action: string;
  to: string;
  outcome?: string;
  reason?: string;
}

function find(rows: readonly Row[], from: string, action: string): Row | undefined {
  return rows.find((r) => r.from === from && r.action === action);
}

export type TurnTransition =
  | { ok: true; to: TurnState; outcome: TurnOutcome | null; reason: string | null }
  | { ok: false; error: "turn.illegal" };

export function transitionTurn(from: string, action: string): TurnTransition {
  const row = find(MACHINES.turn.transitions as Row[], from, action);
  if (!row) return { ok: false, error: "turn.illegal" };
  return { ok: true, to: row.to as TurnState, outcome: (row.outcome ?? null) as TurnOutcome | null, reason: row.reason ?? null };
}

/** True when `action` moves a turn to `settled`. Only `turn.settled` may carry one. */
export function isSettlingTurnAction(action: string): boolean {
  return (MACHINES.turn.transitions as Row[]).some((r) => r.action === action && r.to === "settled");
}

export type SimpleTransition<S> = { ok: true; to: S } | { ok: false; error: string };

export function transitionDelivery(from: string, action: string): SimpleTransition<DeliveryState> {
  const row = find(MACHINES.delivery.transitions as Row[], from, action);
  return row ? { ok: true, to: row.to as DeliveryState } : { ok: false, error: "delivery.illegal" };
}

export function transitionApproval(from: string, action: string): SimpleTransition<ApprovalState> {
  const row = find(MACHINES.approval.transitions as Row[], from, action);
  return row ? { ok: true, to: row.to as ApprovalState } : { ok: false, error: "approval.illegal" };
}

/** Button tone and decision come from the option KIND, never its label. */
export function optionTone(kind: string): { tone: OptionTone | null; decision: Decision | null } {
  const kinds = MACHINES.optionKinds as Record<string, { tone: OptionTone; decision: Decision }>;
  const hit = Object.prototype.hasOwnProperty.call(kinds, kind) ? kinds[kind] : undefined;
  return hit ? { tone: hit.tone, decision: hit.decision } : { tone: null, decision: null };
}
